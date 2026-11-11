import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { elementContentHash } from "../src/approval/hash"
import { ProposalOperationParser } from "../src/change/operation-parser"
import { WorkspaceOperationApplier } from "../src/change/operations"
import { runChange, type ProposalGit } from "../src/change/change"
import type { GitProposalState, ProposalOperation } from "../src/change/types"
import type { Result } from "../src/core/result"
import { collectWorkspaceContributions } from "../src/model"
import { SpecGraphBuilder } from "../src/model"
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
CONTRACTS: CON-EXAMPLE-001
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

const architectureSource = `specification {
  element system
  element component
  relationship depends_on
}

model {
  // SYS-SAMPLE observed doc:architecture
  sample = system 'Sample system'
  // CMP-SAMPLE observed doc:architecture
  sampleComponent = component 'Sample component'
  // CMP-AUTH observed doc:architecture
  auth = component 'Authentication'

  sample -> sampleComponent 'contains'
  sample -> auth 'contains'
}

views {
  view index {
    include *
  }
}
`

const contractSource = `{
  "id": "CON-EXAMPLE-001",
  "owner": "spec-framework",
  "consumers": ["spec-cli"],
  "compatibility": "backward",
  "schema": "example.schema.json",
  "versioning": "semver"
}
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

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "change-sources-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await mkdir(join(target, "spec", "architecture"), { recursive: true })
  await mkdir(join(target, "spec", "contracts", "json-schema"), {
    recursive: true,
  })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), requirementSource)
  await writeFile(join(target, "spec", "architecture", "model.c4"), architectureSource)
  await writeFile(
    join(target, "spec", "contracts", "json-schema", "example.contract.json"),
    contractSource,
  )

  return target
}

function fixedNow(): Date {
  return new Date("2026-11-11T12:00:00.000Z")
}

async function apply(
  target: string,
  operations: ProposalOperation[],
): Promise<Awaited<ReturnType<WorkspaceOperationApplier["apply"]>>> {
  return new WorkspaceOperationApplier(target, fixedNow).apply(operations)
}

describe("new operation parsing", () => {
  test("parses extract, move, and change-contract operations", () => {
    const [operations, error] = ProposalOperationParser.parseList([
      {
        kind: "extract",
        target: "REQ-SAMPLE-001",
        component: { UID: "CMP-AUTH-REFRESH", TITLE: "Token refresh" },
        parent: "CMP-AUTH",
      },
      { kind: "move", target: "CMP-AUTH-REFRESH", to: "CMP-SAMPLE" },
      {
        kind: "change-contract",
        target: "CON-EXAMPLE-001",
        fields: { compatibility: "full" },
      },
    ])

    expect(error).toBeNull()
    expect(operations).toHaveLength(3)
    expect(operations?.[0]).toMatchObject({
      kind: "extract",
      parent: "CMP-AUTH",
    })
    expect(operations?.[1]).toMatchObject({ kind: "move", to: "CMP-SAMPLE" })
    expect(operations?.[2]).toMatchObject({ kind: "change-contract" })
  })

  test("rejects malformed source operations", () => {
    const [missingComponent, componentError] = ProposalOperationParser.parseList({
      kind: "extract",
      target: "REQ-SAMPLE-001",
    })
    expect(missingComponent).toBeNull()
    expect(componentError).toContain("component")

    const [badField, fieldError] = ProposalOperationParser.parseList({
      kind: "move",
      target: "CMP-SAMPLE",
      to: "CMP-AUTH",
      field: "TITLE",
    })
    expect(badField).toBeNull()
    expect(fieldError).toContain("COMPONENT or CAPABILITY")

    const [emptyFields, fieldsError] = ProposalOperationParser.parseList({
      kind: "change-contract",
      target: "CON-EXAMPLE-001",
      fields: {},
    })
    expect(emptyFields).toBeNull()
    expect(fieldsError).toContain("must not be empty")
  })
})

describe("workspace operations", () => {
  test("extracts a component and moves the requirement link", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "extract",
          target: "REQ-SAMPLE-001",
          component: { UID: "CMP-AUTH-REFRESH", TITLE: "Token refresh" },
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes.map((change) => [change.id, change.action])).toEqual([
        ["CMP-AUTH-REFRESH", "added"],
        ["REQ-SAMPLE-001", "modified"],
      ])

      const requirement = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(requirement).toContain("COMPONENT: CMP-AUTH-REFRESH")
      expect(requirement).toContain("STATUS: Proposed")

      const architecture = await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")
      expect(architecture).toContain("// CMP-AUTH-REFRESH proposed")
      expect(architecture).toContain("sample -> cmpAuthRefresh 'contains'")
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("moves component containment and requirement ownership", async () => {
    const target = await createTarget()
    try {
      const [containment, containmentError] = await apply(target, [
        { kind: "move", target: "CMP-SAMPLE", to: "CMP-AUTH" },
      ])
      expect(containmentError).toBeNull()
      expect(containment?.changes.map((change) => change.id)).toEqual(["CMP-SAMPLE"])

      const architecture = await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")
      expect(architecture).toContain("auth -> sampleComponent 'contains'")
      expect(architecture).not.toContain("sample -> sampleComponent 'contains'")

      const [ownership, ownershipError] = await apply(target, [
        {
          kind: "move",
          target: "REQ-SAMPLE-001",
          to: "CMP-AUTH",
          field: "COMPONENT",
        },
      ])
      expect(ownershipError).toBeNull()
      expect(ownership?.changes.map((change) => change.id)).toEqual(["REQ-SAMPLE-001"])

      const requirement = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(requirement).toContain("COMPONENT: CMP-AUTH")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("annotates an existing unannotated component before moving it", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "spec", "architecture", "model.c4"),
        architectureSource.replace("  // CMP-AUTH observed doc:architecture\n", ""),
      )
      const [applied, error] = await apply(target, [
        { kind: "move", target: "CMP-AUTH", to: "CMP-SAMPLE" },
      ])

      expect(error).toBeNull()
      expect(applied?.changes.map((change) => change.id)).toEqual(["CMP-AUTH"])

      const architecture = await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")
      expect(architecture).toContain("// CMP-AUTH")
      expect(architecture).toContain("sampleComponent -> auth 'contains'")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("changes a contract sidecar and keeps the id stable", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "change-contract",
          target: "CON-EXAMPLE-001",
          fields: { compatibility: "full" },
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes).toEqual([
        expect.objectContaining({
          id: "CON-EXAMPLE-001",
          kind: "contract",
          action: "modified",
          title: "Example",
        }),
      ])

      const contract = JSON.parse(
        await readFile(
          join(target, "spec", "contracts", "json-schema", "example.contract.json"),
          "utf8",
        ),
      )
      expect(contract).toMatchObject({
        id: "CON-EXAMPLE-001",
        compatibility: "full",
        owner: "spec-framework",
      })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("does not write any source when a later operation fails", async () => {
    const target = await createTarget()
    try {
      const [, error] = await apply(target, [
        {
          kind: "extract",
          target: "REQ-SAMPLE-001",
          component: { UID: "CMP-AUTH-REFRESH", TITLE: "Token refresh" },
        },
        {
          kind: "change-contract",
          target: "CON-MISSING",
          fields: { compatibility: "full" },
        },
      ])

      expect(error).toContain("unknown contract")
      expect(await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")).toBe(
        requirementSource,
      )
      expect(await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")).toBe(
        architectureSource,
      )
      expect(
        await readFile(
          join(target, "spec", "contracts", "json-schema", "example.contract.json"),
          "utf8",
        ),
      ).toBe(contractSource)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("cross-source graph and impact", () => {
  test("collects architecture, contracts, and requirement links", async () => {
    const target = await createTarget()
    try {
      const blocks = parseSdoc("core.sdoc", requirementSource)
      const builder = new SpecGraphBuilder()
      for (const contribution of await collectWorkspaceContributions(target, blocks)) {
        builder.add(contribution)
      }
      const [graph, error] = builder.build({
        workspace: "single-repo",
        commit: "base123",
        dirty: false,
      })

      expect(error).toBeNull()
      expect(graph?.elements.map((element) => element.id)).toEqual([
        "AC-SAMPLE-001",
        "CMP-AUTH",
        "CMP-SAMPLE",
        "CON-EXAMPLE-001",
        "REQ-SAMPLE-001",
        "SYS-SAMPLE",
      ])
      expect(graph?.elements.find((element) => element.id === "REQ-SAMPLE-001")?.links).toEqual(
        expect.arrayContaining([
          { type: "contract", to: "CON-EXAMPLE-001" },
          { type: "component", to: "CMP-SAMPLE" },
        ]),
      )
      expect(graph?.elements.find((element) => element.id === "CMP-SAMPLE")?.links).toEqual([
        { type: "part_of", to: "SYS-SAMPLE" },
      ])
      expect(graph?.elements.find((element) => element.id === "CON-EXAMPLE-001")).toMatchObject({
        kind: "contract",
        title: "Example",
        owner: "spec-framework",
      })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("skips unannotated architecture elements and reports them", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "spec", "architecture", "model.c4"),
        architectureSource.replace(
          "  sample -> auth 'contains'",
          "  mystery = component 'Mystery'\n  sample -> auth 'contains'",
        ),
      )
      const blocks = parseSdoc("core.sdoc", requirementSource)
      const builder = new SpecGraphBuilder()
      for (const contribution of await collectWorkspaceContributions(target, blocks)) {
        builder.add(contribution)
      }
      const [graph, error] = builder.build({
        workspace: "single-repo",
        commit: "base123",
        dirty: false,
      })

      expect(error).toBeNull()
      expect(graph?.elements.some((element) => element.title === "Mystery")).toBe(false)
      expect(graph?.findings).toContainEqual(expect.objectContaining({ code: "ARCH-UNANNOTATED" }))
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("contract change invalidates evidence and renews approvals", async () => {
    const target = await createTarget()
    try {
      const elements: Record<string, { content_hash: string; evidence: string[] }> = {}
      for (const block of parseSdoc("core.sdoc", requirementSource)) {
        const id = block.fields.UID
        if (id === undefined) continue
        elements[id] = {
          content_hash: elementContentHash(block),
          evidence: ["EVD-SAMPLE-001"],
        }
      }
      await writeFile(
        join(target, "spec", "spec.lock"),
        `${JSON.stringify(
          {
            version: 1,
            approved_at: "2026-11-11T12:00:00.000Z",
            approver: "tester",
            dirty: false,
            elements,
            evidence: {},
          },
          null,
          2,
        )}\n`,
      )

      const run = await runChange(target, "Change contract", {
        author: "tester",
        gitRepository: new FakeProposalGit(),
        now: fixedNow,
        operations: [
          {
            kind: "change-contract",
            target: "CON-EXAMPLE-001",
            fields: { compatibility: "full" },
          },
        ],
      })

      expect(run.code).toBe(0)
      expect(run.report?.impact.changed.map((element) => element.id)).toContain("CON-EXAMPLE-001")
      expect(run.report?.impact.affected.map((element) => element.id)).toContain("REQ-SAMPLE-001")
      expect(run.report?.impact.invalidated_evidence).toEqual(["EVD-SAMPLE-001"])
      expect(run.report?.impact.approvals_to_renew).toEqual(["AC-SAMPLE-001", "REQ-SAMPLE-001"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
