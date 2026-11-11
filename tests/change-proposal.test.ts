import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  runChange,
  runChangeStatus,
  runProposalOperations,
  type ProposalGit,
} from "../src/change/change"
import type { Result } from "../src/core/result"
import type { GitProposalState, Proposal } from "../src/change/types"

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "existing" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

const requirementSource = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Approved
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Approved
STATEMENT: Given a request, the component returns a result.
PROVENANCE: human:test@2026-11-11
OWNER: test
`

class FakeProposalGit implements ProposalGit {
  readonly branches: string[] = []
  readonly baseCommits: string[] = []

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
    this.branches.push(branch)
    this.baseCommits.push(baseCommit)
    return [branch, null]
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ["tester", null]
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "change-proposal-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
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

describe("runChange", () => {
  test("creates a same-worktree proposal and records the baseline", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      const run = await runChange(target, "Add auth expiry", {
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      expect(git.branches).toEqual(["spec/add-auth-expiry"])
      expect(git.baseCommits).toEqual(["base123"])

      const proposal = await readProposal(target, "add-auth-expiry")
      expect(proposal).toMatchObject({
        id: "prop-add-auth-expiry",
        direction: "Add auth expiry",
        mode: "mapping",
        status: "proposed",
        branch: "spec/add-auth-expiry",
        base_commit: "base123",
        baseline: { commit: "base123", lock_hash: null },
        author: "tester",
      })
      expect(run.output).toContain("proposal: spec/add-auth-expiry")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("applies typed operations without writing the lock", async () => {
    const target = await createTarget()
    try {
      const run = await runChange(target, "Rename sample", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        operations: [
          { kind: "rename", target: "REQ-SAMPLE-001", title: "Renamed behavior" },
        ],
      })

      expect(run.code).toBe(0)
      expect(run.report?.changes).toHaveLength(1)

      const requirement = await readFile(
        join(target, "spec", "requirements", "core.sdoc"),
        "utf8",
      )
      expect(requirement).toContain("TITLE: Renamed behavior")
      expect(requirement).toContain("STATUS: Proposed")
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)

      const proposal = await readProposal(target, "rename-sample")
      expect(proposal.operations).toHaveLength(1)
      expect(proposal.operations[0]?.kind).toBe("rename")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("records an existing lock hash in the baseline", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "spec", "spec.lock"),
        `${JSON.stringify(
          {
            version: 1,
            approved_at: "2026-11-11T12:00:00.000Z",
            approver: "tester",
            dirty: false,
            elements: {},
            evidence: {},
          },
          null,
          2,
        )}\n`,
      )

      const run = await runChange(target, "Locked change", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      const proposal = await readProposal(target, "locked-change")
      expect(proposal.mode).toBe("refactor")
      expect(proposal.baseline.lock_hash).toStartWith("sha256:")
      expect(run.warnings).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("warns when a refactor has no approved baseline", async () => {
    const target = await createTarget()
    try {
      const run = await runChange(target, "Draft refactor", {
        mode: "refactor",
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      expect(run.warnings).toEqual(["no approved baseline; this is a draft-only refactor"])

      const proposal = await readProposal(target, "draft-refactor")
      expect(proposal.mode).toBe("refactor")
      expect(proposal.baseline.lock_hash).toBeNull()
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a dirty tree and an existing active proposal", async () => {
    const target = await createTarget()
    try {
      const dirty = await runChange(target, "Dirty", {
        author: "tester",
        gitRepository: new FakeProposalGit({ branch: "main", commit: "base123", clean: false }),
      })
      expect(dirty.code).toBe(1)
      expect(dirty.output).toContain("dirty")

      const active = await runChange(target, "Active", {
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

  test("rejects a branch that already exists", async () => {
    const target = await createTarget()
    try {
      const run = await runChange(target, "Existing", {
        author: "tester",
        gitRepository: new FakeProposalGit(undefined, true),
      })

      expect(run.code).toBe(1)
      expect(run.output).toContain("already exists")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("runProposalOperations", () => {
  test("applies operations to the active proposal", async () => {
    const target = await createTarget()
    try {
      await runChange(target, "Follow up", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      const run = await runProposalOperations(
        target,
        [{ kind: "rename", target: "REQ-SAMPLE-001", title: "Follow up title" }],
        {
          gitRepository: new FakeProposalGit({
            branch: "spec/follow-up",
            commit: "base123",
            clean: false,
          }),
          now: fixedNow,
        },
      )

      expect(run.code).toBe(0)
      const proposal = await readProposal(target, "follow-up")
      expect(proposal.operations).toHaveLength(1)
      expect(proposal.status).toBe("proposed")

      const requirement = await readFile(
        join(target, "spec", "requirements", "core.sdoc"),
        "utf8",
      )
      expect(requirement).toContain("TITLE: Follow up title")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("runChangeStatus", () => {
  test("reads the active proposal from the current branch", async () => {
    const target = await createTarget()
    try {
      await runChange(target, "Status view", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      const git = new FakeProposalGit({
        branch: "spec/status-view",
        commit: "base123",
        clean: false,
      })
      const run = await runChangeStatus(target, { gitRepository: git, technical: true })

      expect(run.code).toBe(0)
      expect(run.proposal?.id).toBe("prop-status-view")
      expect(run.output).toContain("baseline_commit: base123")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("fails outside a proposal branch", async () => {
    const target = await createTarget()
    try {
      const run = await runChangeStatus(target, { gitRepository: new FakeProposalGit() })

      expect(run.code).toBe(1)
      expect(run.output).toContain("no active proposal")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
