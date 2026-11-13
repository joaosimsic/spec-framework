import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProposalGit } from "../src/change/change"
import type { GitProposalState, Proposal } from "../src/change/types"
import { ok, type Result } from "../src/core/result"
import { runMapPromote } from "../src/core/map-promote"
import { runMapReview } from "../src/core/map-review"

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "existing" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

const architecture = `specification {
  element actor
  element system
  element component
}

model {
  // SYS-BASE observed human:test@2026-11-11
  base = system 'Base'
}

views {
  view index {
    include *
  }
}
`

class FakeProposalGit implements ProposalGit {
  constructor(
    public state: GitProposalState = { branch: "main", commit: "base123", clean: true },
  ) {}

  async readState(target: string): Promise<Result<GitProposalState, string>> {
    void target
    return ok(this.state)
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    void target
    void branch
    return ok(false)
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    void target
    void baseCommit
    void branch
    return ok(branch)
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ok("tester")
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "map-promotion-"))
  await mkdir(join(target, "spec", "architecture"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "spec", "architecture", "model.c4"), architecture)
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "app" })}\n`)

  return target
}

async function openReview(target: string, actions: unknown[] = []): Promise<FakeProposalGit> {
  const git = new FakeProposalGit()
  const run = await runMapReview(target, {
    actions: actions as never,
    author: "tester",
    gitRepository: git,
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  })
  expect(run.code).toBe(0)
  git.state = { branch: "spec/review-sample-mapping", commit: "base123", clean: false }

  return git
}

async function readProposal(target: string): Promise<Proposal> {
  const text = await readFile(
    join(target, "spec", "proposals", "review-sample-mapping.json"),
    "utf8",
  )

  return JSON.parse(text) as Proposal
}

describe("mapping promotion", () => {
  test("promotes curated areas into proposed architecture", async () => {
    const target = await createTarget()
    try {
      const git = await openReview(target, [
        { kind: "accept", target: "sample" },
        { kind: "accept", target: "app" },
        { kind: "rename", target: "app", title: "Application" },
        { kind: "set-owner", target: "Application", owner: "platform" },
        {
          kind: "set-responsibility",
          target: "Application",
          responsibility: "Serves the product.",
        },
      ])

      const run = await runMapPromote(target, {
        gitRepository: git,
        now: () => new Date("2026-11-11T12:00:00.000Z"),
      })

      expect(run.code).toBe(0)
      expect(run.output).toContain("mapping promotion complete")
      expect(run.output).toContain("Application")
      expect(run.output).not.toMatch(/(?:REQ|AC|CMP|SYS)-/)

      const model = await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")
      expect(model).toContain("cmpApp = component 'Application'")
      expect(model).toContain("// CMP-APP proposed confidence=observed")
      expect(model).toContain('owner="platform"')
      expect(model).toContain('responsibility="Serves the product."')
      expect(model).toContain("sysSample -> cmpApp 'contains'")
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)

      const proposal = await readProposal(target)
      expect(proposal.status).toBe("proposed")
      expect(proposal.operations.at(-1)?.kind).toBe("promote-mapping")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("is idempotent and does not duplicate promoted elements", async () => {
    const target = await createTarget()
    try {
      const git = await openReview(target, [
        { kind: "accept", target: "sample" },
        { kind: "accept", target: "app" },
      ])
      await runMapPromote(target, { gitRepository: git })
      const second = await runMapPromote(target, { gitRepository: git })
      const model = await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")

      expect(second.code).toBe(0)
      expect(second.output).toContain("already present")
      expect(model.match(/\/\/ CMP-APP /g)).toHaveLength(1)
      expect(model.match(/cmpApp = component/g)).toHaveLength(1)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects blocking open questions", async () => {
    const target = await createTarget()
    try {
      const git = await openReview(target, [
        { kind: "accept", target: "app" },
        {
          kind: "open-question",
          target: "app",
          question: "Who owns rollout?",
          blocking: true,
        },
      ])
      const run = await runMapPromote(target, { gitRepository: git })

      expect(run.code).toBe(1)
      expect(run.output).toContain("blocked by an open question")
      expect(await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")).toBe(
        architecture,
      )
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
  test("declares promoted kinds and writes accepted relations", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "package.json"),
        `${JSON.stringify({ name: "app", dependencies: { sqlite3: "1" } })}\n`,
      )
      const git = await openReview(target, [
        { kind: "accept", target: "sample" },
        { kind: "accept", target: "app" },
        { kind: "accept", target: "sqlite3" },
        {
          kind: "accept-relation",
          source: "app",
          target: "sqlite3",
          type: "depends_on",
        },
      ])
      const run = await runMapPromote(target, { gitRepository: git })
      const model = await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")

      expect(run.code).toBe(0)
      expect(model).toContain("element data_store")
      expect(model).toContain("// DAT-SQLITE3 proposed")
      expect(model).toContain("cmpApp -> datSqlite3 'depends_on'")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
