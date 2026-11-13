import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runMapReview, type MapReviewReport } from "../src/core/map-review"
import type { ProposalGit } from "../src/change/change"
import type { GitProposalState, Proposal } from "../src/change/types"
import { ok, type Result } from "../src/core/result"

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "existing" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

const lock = {
  version: 1,
  approved_at: "2026-11-11T12:00:00.000Z",
  approver: "tester",
  dirty: false,
  elements: {},
  evidence: {},
}

class FakeProposalGit implements ProposalGit {
  readonly branches: string[] = []

  constructor(
    public state: GitProposalState = { branch: "main", commit: "base123", clean: true },
    public existingBranch = false,
  ) {}

  async readState(target: string): Promise<Result<GitProposalState, string>> {
    void target
    return ok(this.state)
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    void target
    void branch
    return ok(this.existingBranch)
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    void target
    void baseCommit
    this.branches.push(branch)
    return ok(branch)
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ok("tester")
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "map-review-"))
  await mkdir(join(target, "spec"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "app" })}\n`)

  return target
}

function fixedNow(): Date {
  return new Date("2026-11-11T12:00:00.000Z")
}

async function readProposal(target: string, slug: string): Promise<Proposal> {
  const text = await readFile(join(target, "spec", "proposals", `${slug}.json`), "utf8")
  return JSON.parse(text) as Proposal
}

describe("runMapReview", () => {
  test("opens a mapping proposal without writing the lock", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      const run = await runMapReview(target, {
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      expect(git.branches).toEqual(["spec/review-sample-mapping"])
      expect(run.output).toContain("mapping review open")
      expect(run.output).toContain("goal: Review sample mapping")
      expect(run.output).toContain("nothing is approved")
      expect(run.output).toContain("confidence queue:")

      const proposal = await readProposal(target, "review-sample-mapping")
      expect(proposal.mode).toBe("mapping")
      expect(proposal.status).toBe("proposed")
      expect(proposal.baseline).toEqual({ commit: "base123", lock_hash: null })
      expect(
        await Bun.file(
          join(target, "spec", "proposals", "review-sample-mapping.mapping.json"),
        ).exists(),
      ).toBe(true)
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("does not leak internal IDs in default output", async () => {
    const target = await createTarget()
    try {
      const run = await runMapReview(target, {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      expect(run.output).not.toMatch(/(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS)-/)
      expect(run.output).not.toContain("spec/review-sample-mapping")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("emits a deterministic JSON report with identity", async () => {
    const target = await createTarget()
    try {
      const run = await runMapReview(target, {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        json: true,
      })

      const report = JSON.parse(run.output) as MapReviewReport
      expect(report.version).toBe(2)
      expect(report.review.mode).toBe("mapping")
      expect(report.review.queue.some((item) => item.technical.id === "CMP-APP")).toBe(true)
      expect(report.proposal.branch).toBe("spec/review-sample-mapping")
      expect(report.proposal.baseline).toEqual({ commit: "base123", lock_hash: null })
      expect(report.map.elements.some((element) => element.id === "SYS-SAMPLE")).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reveals technical identity on request", async () => {
    const target = await createTarget()
    try {
      const run = await runMapReview(target, {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        technical: true,
      })

      expect(run.code).toBe(0)
      expect(run.output).toContain("mapping-review: mode=mapping")
      expect(run.output).toContain("mapping-review-area: CMP-APP")
      expect(run.output).toContain("provenance=code:package.json")
      expect(run.output).toContain("proposal: prop-review-sample-mapping")
      expect(run.output).toContain("baseline_commit: base123")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("records an existing lock hash in the baseline", async () => {
    const target = await createTarget()
    try {
      await writeFile(join(target, "spec", "spec.lock"), `${JSON.stringify(lock, null, 2)}\n`)
      const run = await runMapReview(target, {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      const proposal = await readProposal(target, "review-sample-mapping")
      expect(proposal.mode).toBe("mapping")
      expect(proposal.baseline.lock_hash).toStartWith("sha256:")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a dirty tree and an active proposal", async () => {
    const target = await createTarget()
    try {
      const dirty = await runMapReview(target, {
        author: "tester",
        gitRepository: new FakeProposalGit({
          branch: "main",
          commit: "base123",
          clean: false,
        }),
      })
      expect(dirty.code).toBe(1)
      expect(dirty.output).toContain("dirty")

      const active = await runMapReview(target, {
        author: "tester",
        gitRepository: new FakeProposalGit({
          branch: "spec/existing",
          commit: "base123",
          clean: true,
        }),
      })
      expect(active.code).toBe(1)
      expect(active.output).toContain("active proposal")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("requires spec init before review", async () => {
    const target = await mkdtemp(join(tmpdir(), "map-review-"))
    try {
      const git = new FakeProposalGit()
      const run = await runMapReview(target, { gitRepository: git })

      expect(run.code).toBe(1)
      expect(run.output).toContain("map review failed")
      expect(run.output).toContain("missing")
      expect(git.branches).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
