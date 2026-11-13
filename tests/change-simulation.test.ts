import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runChange, runProposalOperations, type ProposalGit } from "../src/change/change"
import type { Proposal } from "../src/change/types"
import { ok, type Result } from "../src/core/result"
import { GraphSimulator, GRAPH_VERSION, type SpecGraph } from "../src/model"
import type { GitProposalState } from "../src/change/types"

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
  constructor(
    private readonly state: GitProposalState = { branch: "main", commit: "base123", clean: true },
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
    return ok(branch)
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ok("tester")
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "change-simulation-"))
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

function graph(
  elements: SpecGraph["elements"],
  commit = "base123",
  evidence: SpecGraph["evidence"] = [],
): SpecGraph {
  return {
    version: GRAPH_VERSION,
    workspace: "single-repo",
    commit,
    dirty: false,
    elements,
    evidence,
    findings: [],
    tool_versions: {},
  }
}

describe("GraphSimulator", () => {
  test("reports added, removed, and modified elements in title order", () => {
    const before = graph([
      { id: "REQ-001", kind: "requirement", title: "Zulu", links: [] },
      { id: "REQ-002", kind: "requirement", title: "Removed", links: [] },
    ])
    const after = graph(
      [
        { id: "REQ-001", kind: "requirement", title: "Alpha", status: "proposed", links: [] },
        { id: "REQ-003", kind: "requirement", title: "Added", links: [] },
      ],
      "after456",
    )

    const report = new GraphSimulator().simulate(before, after)

    expect(report.available).toBe(true)
    expect(report.added.map((element) => element.id)).toEqual(["REQ-003"])
    expect(report.removed.map((element) => element.id)).toEqual(["REQ-002"])
    expect(report.modified.map((element) => element.id)).toEqual(["REQ-001"])
    expect(report.modified[0]?.previous_title).toBe("Zulu")
    expect(report.modified[0]?.changed).toEqual(["title", "status"])
    expect(report.baseline_commit).toBe("base123")
    expect(report.current_commit).toBe("after456")
  })

  test("marks link changes as modified", () => {
    const before = graph([
      {
        id: "REQ-001",
        kind: "requirement",
        title: "Sample",
        links: [{ type: "component", to: "CMP-A" }],
      },
    ])
    const after = graph([
      {
        id: "REQ-001",
        kind: "requirement",
        title: "Sample",
        links: [{ type: "component", to: "CMP-B" }],
      },
    ])

    const report = new GraphSimulator().simulate(before, after)

    expect(report.modified[0]?.changed).toEqual(["links"])
  })
})

describe("change simulation", () => {
  test("shows the before and after title without leaking IDs", async () => {
    const target = await createTarget()
    try {
      const run = await runChange(target, "Rename sample", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        simulate: true,
        operations: [{ kind: "rename", target: "REQ-SAMPLE-001", title: "Renamed behavior" }],
      })

      expect(run.code).toBe(0)
      expect(run.output).toContain("simulation: 0 added, 0 removed, 1 modified")
      expect(run.output).toContain("Sample behavior -> Renamed behavior (Requirement)")
      expect(run.output).not.toMatch(/\b(?:REQ|AC|CMP|EVD|CAP)-/)

      const proposal = await readProposal(target, "rename-sample")
      expect(
        await Bun.file(join(target, "spec", "proposals", `rename-sample.graph.json`)).exists(),
      ).toBe(true)
      expect(proposal.operations).toHaveLength(1)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("emits the simulation in technical and JSON reports", async () => {
    const target = await createTarget()
    try {
      const technical = await runChange(target, "Rename sample", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        simulate: true,
        technical: true,
        operations: [{ kind: "rename", target: "REQ-SAMPLE-001", title: "Renamed behavior" }],
      })

      expect(technical.code).toBe(0)
      expect(technical.output).toContain(
        "simulation-modified: REQ-SAMPLE-001 kind=requirement title=Renamed behavior previous=Sample behavior fields=title,status",
      )

      const json = await runChange(target, "Deprecate sample", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        simulate: true,
        json: true,
        operations: [{ kind: "deprecate", target: "REQ-SAMPLE-001" }],
      })

      expect(json.code).toBe(0)
      const report = JSON.parse(json.output) as {
        simulation: {
          available: boolean
          modified: Array<{ id: string; previous_title?: string; title: string; changed: string[] }>
        }
      }
      expect(report.simulation.available).toBe(true)
      expect(report.simulation.modified[0]).toMatchObject({
        id: "REQ-SAMPLE-001",
        title: "Renamed behavior",
        changed: ["status"],
      })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("fails when a requested simulation has no baseline snapshot", async () => {
    const target = await createTarget()
    try {
      await runChange(target, "First change", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })
      await rm(join(target, "spec", "proposals", "first-change.graph.json"))

      const run = await runProposalOperations(
        target,
        [{ kind: "rename", target: "REQ-SAMPLE-001", title: "Changed later" }],
        {
          simulate: true,
          gitRepository: new FakeProposalGit({
            branch: "spec/first-change",
            commit: "base123",
            clean: true,
          }),
          now: fixedNow,
        },
      )

      expect(run.code).toBe(1)
      expect(run.output).toContain("baseline graph snapshot unavailable")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
