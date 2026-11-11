import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { elementContentHash } from "../src/approval/hash"
import type { SpecLock } from "../src/approval/types"
import { runChange, type ProposalGit } from "../src/change/change"
import type {
  GitProposalState,
  Proposal,
  ProposalOperation,
} from "../src/change/types"
import type { Result } from "../src/core/result"
import { parseSdoc } from "../src/core/sdoc"

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
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Approved
STATEMENT: Given a request, the component returns a result.
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test
`

class FakeProposalGit implements ProposalGit {
  async readState(target: string): Promise<Result<GitProposalState, string>> {
    void target
    return [{ branch: "main", commit: "base123", clean: true }, null]
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    void target
    void branch
    return [false, null]
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    void target
    void baseCommit
    return [branch, null]
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ["tester", null]
  }
}

async function createTarget(source = requirementSource): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "change-impact-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), source)

  return target
}

function buildLock(source: string): SpecLock {
  const elements: SpecLock["elements"] = {}

  for (const block of parseSdoc("core.sdoc", source)) {
    const id = block.fields.UID
    if (id === undefined || id === "") continue
    elements[id] = {
      content_hash: elementContentHash(block),
      evidence: ["EVD-SAMPLE-001"],
    }
  }

  return {
    version: 1,
    approved_at: "2026-11-11T12:00:00.000Z",
    approver: "tester",
    dirty: false,
    elements,
    evidence: {},
  }
}

async function writeLock(target: string, source: string): Promise<void> {
  await writeFile(
    join(target, "spec", "spec.lock"),
    `${JSON.stringify(buildLock(source), null, 2)}\n`,
  )
}

function fixedNow(): Date {
  return new Date("2026-11-11T12:00:00.000Z")
}

async function readProposal(target: string, slug: string): Promise<Proposal> {
  const text = await readFile(join(target, "spec", "proposals", `${slug}.json`), "utf8")
  return JSON.parse(text) as Proposal
}

async function runOperations(
  target: string,
  direction: string,
  slug: string,
  operations: ProposalOperation[],
) {
  return runChange(target, direction, {
    author: "tester",
    gitRepository: new FakeProposalGit(),
    now: fixedNow,
    operations,
  })
}

describe("change impact report", () => {
  test("reports changed and affected elements without leaking IDs", async () => {
    const target = await createTarget()
    try {
      const run = await runOperations(target, "Rename sample", "rename-sample", [
        { kind: "rename", target: "REQ-SAMPLE-001", title: "Renamed behavior" },
      ])

      expect(run.code).toBe(0)
      expect(run.report?.impact.changed.map((element) => element.id)).toEqual([
        "REQ-SAMPLE-001",
      ])
      expect(run.report?.impact.affected.map((element) => element.id)).toEqual([
        "AC-SAMPLE-001",
      ])
      expect(run.report?.impact.invalidated_evidence).toEqual(["EVD-SAMPLE-001"])
      expect(run.output).toContain("Renamed behavior (Requirement)")
      expect(run.output).toContain("Sample criterion (Acceptance criterion)")
      expect(run.output).not.toMatch(/\b(?:REQ|AC|CMP|EVD|CAP)-/)

      const proposal = await readProposal(target, "rename-sample")
      expect(proposal.operations).toHaveLength(1)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("emits impact in the JSON report", async () => {
    const target = await createTarget()
    try {
      const run = await runChange(target, "Rename sample", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        json: true,
        operations: [
          { kind: "rename", target: "REQ-SAMPLE-001", title: "Renamed behavior" },
        ],
      })

      expect(run.code).toBe(0)
      const report = JSON.parse(run.output) as {
        impact: {
          changed: Array<{ id: string }>
          affected: Array<{ id: string }>
          invalidated_evidence: string[]
        }
      }
      expect(report.impact.changed.map((element) => element.id)).toEqual(["REQ-SAMPLE-001"])
      expect(report.impact.affected.map((element) => element.id)).toEqual(["AC-SAMPLE-001"])
      expect(report.impact.invalidated_evidence).toEqual(["EVD-SAMPLE-001"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reveals identity only in technical output", async () => {
    const target = await createTarget()
    try {
      const run = await runChange(target, "Rename sample", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        technical: true,
        operations: [
          { kind: "rename", target: "REQ-SAMPLE-001", title: "Renamed behavior" },
        ],
      })

      expect(run.code).toBe(0)
      expect(run.output).toContain("impact-changed: REQ-SAMPLE-001")
      expect(run.output).toContain("impact-affected: AC-SAMPLE-001")
      expect(run.output).toContain("impact-evidence: EVD-SAMPLE-001")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("renews approvals after locked content drifts", async () => {
    const target = await createTarget()
    try {
      await writeLock(target, requirementSource)
      const drifted = requirementSource.replace("TITLE: Sample behavior", "TITLE: Drifted behavior")
      await writeFile(join(target, "spec", "requirements", "core.sdoc"), drifted)

      const run = await runChange(target, "Inspect drift", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
      })

      expect(run.code).toBe(0)
      expect(run.report?.impact.changed.map((element) => element.id)).toEqual([
        "REQ-SAMPLE-001",
      ])
      expect(run.report?.impact.approvals_to_renew).toEqual([
        "AC-SAMPLE-001",
        "REQ-SAMPLE-001",
      ])
      expect(run.report?.impact.invalidated_evidence).toEqual(["EVD-SAMPLE-001"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("treats status-only operations as changed", async () => {
    const target = await createTarget()
    try {
      const run = await runOperations(target, "Deprecate sample", "deprecate-sample", [
        { kind: "deprecate", target: "REQ-SAMPLE-001" },
      ])

      expect(run.code).toBe(0)
      expect(run.report?.impact.changed.map((element) => element.id)).toEqual([
        "REQ-SAMPLE-001",
      ])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  const seedScenarios: Array<{
    label: string
    direction: string
    slug: string
    operations: ProposalOperation[]
    expected: string[]
  }> = [
    {
      label: "replace",
      direction: "Replace sample",
      slug: "replace-sample",
      operations: [
        {
          kind: "replace",
          target: "REQ-SAMPLE-001",
          replacement: {
            UID: "REQ-SAMPLE-002",
            TITLE: "Replacement behavior",
            STATUS: "Proposed",
          },
        },
      ],
      expected: ["REQ-SAMPLE-001", "REQ-SAMPLE-002"],
    },
    {
      label: "split",
      direction: "Split sample",
      slug: "split-sample",
      operations: [
        {
          kind: "split",
          target: "REQ-SAMPLE-001",
          parts: [
            { UID: "REQ-SAMPLE-002", TITLE: "First part", STATUS: "Proposed" },
            { UID: "REQ-SAMPLE-003", TITLE: "Second part", STATUS: "Proposed" },
          ],
        },
      ],
      expected: ["REQ-SAMPLE-001", "REQ-SAMPLE-002", "REQ-SAMPLE-003"],
    },
    {
      label: "merge",
      direction: "Merge sample",
      slug: "merge-sample",
      operations: [
        {
          kind: "merge",
          targets: ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
          result: { UID: "REQ-SAMPLE-002", TITLE: "Merged result", STATUS: "Proposed" },
        },
      ],
      expected: ["AC-SAMPLE-001", "REQ-SAMPLE-001", "REQ-SAMPLE-002"],
    },
  ]

  for (const scenario of seedScenarios) {
    test(`treats ${scenario.label} targets and new records as changed`, async () => {
      const target = await createTarget()
      try {
        const run = await runOperations(
          target,
          scenario.direction,
          scenario.slug,
          scenario.operations,
        )

        expect(run.code).toBe(0)
        expect(run.report?.impact.changed.map((element) => element.id)).toEqual(
          scenario.expected,
        )
      } finally {
        await rm(target, { recursive: true, force: true })
      }
    })
  }
})
