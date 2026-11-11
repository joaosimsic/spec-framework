import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runStart, type StartReport } from "../src/change/start"
import type { ProposalGit } from "../src/change/change"
import type { GitProposalState, Proposal } from "../src/change/types"
import type { Result } from "../src/core/result"

const requirementSource = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
PROVENANCE: human:test@2026-11-11
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
STATEMENT: Given a request, the component returns a result.
PROVENANCE: human:test@2026-11-11
OWNER: test
`

const configFor = (adoption: string) =>
  `${JSON.stringify(
    {
      version: 1,
      profile: "full",
      project: { name: "sample", adoption },
      adapters: {},
      approval: { mode: "human", humanOnly: true },
    },
    null,
    2,
  )}\n`

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
    return [this.state, null]
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    void target
    void branch
    return [this.existingBranch, null]
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    void target
    void baseCommit
    this.branches.push(branch)
    return [branch, null]
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ["tester", null]
  }
}

async function createTarget(adoption = "greenfield"): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "start-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), configFor(adoption))
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), requirementSource)

  return target
}

function fixedNow(): Date {
  return new Date("2026-11-11T12:00:00.000Z")
}

async function readProposal(target: string, slug: string): Promise<Proposal> {
  const text = await readFile(join(target, "spec", "proposals", `${slug}.json`), "utf8")
  return JSON.parse(text) as Proposal
}

describe("runStart", () => {
  test("opens a scratch proposal without writing the lock", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      const run = await runStart(target, "Add session expiry", {
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      expect(git.branches).toEqual(["spec/add-session-expiry"])
      expect(run.output).toContain("scratch proposal open")
      expect(run.output).toContain("goal: Add session expiry")
      expect(run.output).toContain("nothing is approved")

      const proposal = await readProposal(target, "add-session-expiry")
      expect(proposal.mode).toBe("scratch")
      expect(proposal.status).toBe("proposed")
      expect(proposal.baseline).toEqual({ commit: "base123", lock_hash: null })
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("does not leak internal IDs in default output", async () => {
    const target = await createTarget()
    try {
      const run = await runStart(target, "Add session expiry", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      expect(run.output).not.toMatch(/(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS)-/)
      expect(run.output).not.toContain("spec/add-session-expiry")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("emits a deterministic JSON report with identity", async () => {
    const target = await createTarget()
    try {
      const run = await runStart(target, "Add session expiry", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        json: true,
      })

      const report = JSON.parse(run.output) as StartReport
      expect(report.version).toBe(1)
      expect(report.briefing.mode).toBe("scratch")
      expect(report.briefing.prompts.length).toBeGreaterThan(0)
      expect(report.change.proposal.branch).toBe("spec/add-session-expiry")
      expect(report.change.proposal.baseline).toEqual({ commit: "base123", lock_hash: null })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reveals technical identity on request", async () => {
    const target = await createTarget()
    try {
      const run = await runStart(target, "Add session expiry", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        technical: true,
      })

      expect(run.code).toBe(0)
      expect(run.output).toContain("start: mode=scratch")
      expect(run.output).toContain("baseline_commit: base123")
      expect(run.output).toContain("proposal: prop-add-session-expiry")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("requires spec init before start", async () => {
    const target = await mkdtemp(join(tmpdir(), "start-"))
    try {
      const git = new FakeProposalGit()
      const run = await runStart(target, "Add session expiry", { gitRepository: git })

      expect(run.code).toBe(1)
      expect(run.output).toContain("run spec init")
      expect(git.branches).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a project initialized as existing", async () => {
    const target = await createTarget("existing")
    try {
      const git = new FakeProposalGit()
      const run = await runStart(target, "Add session expiry", { gitRepository: git })

      expect(run.code).toBe(1)
      expect(run.output).toContain("spec map --review")
      expect(git.branches).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects an approved baseline", async () => {
    const target = await createTarget()
    try {
      await writeFile(join(target, "spec", "spec.lock"), `${JSON.stringify(lock, null, 2)}\n`)
      const git = new FakeProposalGit()
      const run = await runStart(target, "Add session expiry", { gitRepository: git })

      expect(run.code).toBe(1)
      expect(run.output).toContain("approved baseline exists")
      expect(run.output).toContain("spec refactor")
      expect(git.branches).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a dirty tree and an active proposal", async () => {
    const target = await createTarget()
    try {
      const dirty = await runStart(target, "Dirty start", {
        author: "tester",
        gitRepository: new FakeProposalGit({
          branch: "main",
          commit: "base123",
          clean: false,
        }),
      })
      expect(dirty.code).toBe(1)
      expect(dirty.output).toContain("dirty")

      const active = await runStart(target, "Active start", {
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

  test("rejects an empty goal", async () => {
    const target = await createTarget()
    try {
      const run = await runStart(target, "   ", { gitRepository: new FakeProposalGit() })

      expect(run.code).toBe(1)
      expect(run.output).toContain("direction is required")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
