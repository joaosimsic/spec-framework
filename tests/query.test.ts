import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Result } from "../src/core/result"
import type { GraphWorkspace } from "../src/model/types"
import { runQuery } from "../src/query/index"
import type { WorkspaceMetadataReader } from "../src/query/types"

const validRequirement = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
CAPABILITY: CAP-SAMPLE
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
STATEMENT: Given a request, the component returns a result.
FORMAL: PROP-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test
`

const cleanWorkspace: GraphWorkspace = {
  workspace: "single-repo",
  commit: "a1b2c3d",
  dirty: false,
}

class FakeWorkspaceReader implements WorkspaceMetadataReader {
  constructor(private readonly workspace: GraphWorkspace) {}

  async read(target: string): Promise<Result<GraphWorkspace, string>> {
    void target

    return [this.workspace, null]
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "query-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(
    join(target, "spec", "config.json"),
    JSON.stringify({
      version: 1,
      profile: "full",
      project: { name: "sample", adoption: "existing" },
      adapters: {},
      approval: { mode: "hash-lock", humanOnly: true },
    }),
  )
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), validRequirement)

  return target
}

function reader(workspace: GraphWorkspace = cleanWorkspace): WorkspaceMetadataReader {
  return new FakeWorkspaceReader(workspace)
}

function parseGraph(output: string): {
  version: number
  workspace: string
  commit: string
  dirty: boolean
  elements: Array<{
    id: string
    kind: string
    status?: string
    links: Array<{ type: string; to: string }>
  }>
  findings: Array<{ id?: string }>
  tool_versions: Record<string, string>
} {
  return JSON.parse(output) as {
    version: number
    workspace: string
    commit: string
    dirty: boolean
    elements: Array<{
      id: string
      kind: string
      status?: string
      links: Array<{ type: string; to: string }>
    }>
    findings: Array<{ id?: string }>
    tool_versions: Record<string, string>
  }
}

describe("runQuery", () => {
  test("emits a deterministic identity graph document", async () => {
    const target = await createTarget()
    try {
      const first = await runQuery(target, { json: true, workspaceReader: reader() })
      const second = await runQuery(target, { json: true, workspaceReader: reader() })

      expect(first.code).toBe(0)
      expect(first.output).toBe(second.output)

      const graph = parseGraph(first.output)
      expect(graph.version).toBe(1)
      expect(graph.workspace).toBe("single-repo")
      expect(graph.commit).toBe("a1b2c3d")
      expect(graph.dirty).toBe(false)
      expect(graph.elements.map((element) => element.id)).toEqual([
        "AC-SAMPLE-001",
        "REQ-SAMPLE-001",
      ])
      expect(graph.elements[1]?.links).toContainEqual({
        type: "derives_from",
        to: "CAP-SAMPLE",
      })
      expect(typeof graph.tool_versions.spec).toBe("string")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("filters by id, kind, and status", async () => {
    const target = await createTarget()
    try {
      const byId = await runQuery(target, {
        id: "REQ-SAMPLE-001",
        json: true,
        workspaceReader: reader(),
      })
      const byKind = await runQuery(target, {
        kind: "acceptance_criterion",
        json: true,
        workspaceReader: reader(),
      })
      const byStatus = await runQuery(target, {
        status: "approved",
        json: true,
        workspaceReader: reader(),
      })

      const idGraph = parseGraph(byId.output)
      const kindGraph = parseGraph(byKind.output)
      expect(idGraph.elements.map((element) => element.id)).toEqual(["REQ-SAMPLE-001"])
      expect(idGraph.findings.every((finding) => finding.id === "REQ-SAMPLE-001")).toBe(true)
      expect(kindGraph.elements.map((element) => element.id)).toEqual(["AC-SAMPLE-001"])
      expect(kindGraph.findings.every((finding) => finding.id === "AC-SAMPLE-001")).toBe(true)
      expect(parseGraph(byStatus.output).elements).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects an unknown element id", async () => {
    const target = await createTarget()
    try {
      const run = await runQuery(target, {
        id: "REQ-MISSING-001",
        json: true,
        workspaceReader: reader(),
      })

      expect(run.code).toBe(1)
      expect(run.output).toContain("unknown element: REQ-MISSING-001")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("refuses a dirty tree unless explicitly allowed", async () => {
    const target = await createTarget()
    try {
      const dirtyReader = reader({ ...cleanWorkspace, dirty: true })
      const refused = await runQuery(target, { json: true, workspaceReader: dirtyReader })
      const allowed = await runQuery(target, {
        json: true,
        allowDirty: true,
        workspaceReader: dirtyReader,
      })

      expect(refused.code).toBe(1)
      expect(refused.output).toContain("git tree is dirty")
      expect(allowed.code).toBe(0)
      expect(parseGraph(allowed.output).dirty).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("prints names and plain-language state without internal ids by default", async () => {
    const target = await createTarget()
    try {
      const run = await runQuery(target, { workspaceReader: reader() })

      expect(run.code).toBe(0)
      expect(run.output).toContain("Sample behavior - Draft - not reviewed (requirement)")
      expect(run.output).toContain("Sample criterion - Draft - not reviewed (acceptance criterion)")
      expect(run.output).toContain("A related item is missing from the model.")
      expect(run.output).not.toMatch(/\b(?:REQ|AC)-/)
      expect(run.output).not.toContain("GRAPH-")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("prints identity and provenance only with technical details", async () => {
    const target = await createTarget()
    try {
      const run = await runQuery(target, { technical: true, workspaceReader: reader() })

      expect(run.code).toBe(0)
      expect(run.output).toContain("Sample behavior")
      expect(run.output).toContain("id: REQ-SAMPLE-001")
      expect(run.output).toContain("provenance: human:test@2026-11-10")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("emits an experience view with opaque refs", async () => {
    const target = await createTarget()
    try {
      const run = await runQuery(target, {
        json: true,
        view: "experience",
        workspaceReader: reader(),
      })
      const model = JSON.parse(run.output) as {
        version: number
        graphVersion: number
        commit: string
        entries: Array<{
          ref: string
          label: string
          kindLabel: string
          state: string
          technical: { id: string }
        }>
      }

      expect(run.code).toBe(0)
      expect(model.version).toBe(1)
      expect(model.graphVersion).toBe(1)
      expect(model.commit).toBe("a1b2c3d")
      expect(model.entries.map((entry) => entry.ref)).toEqual(["ref_0", "ref_1"])
      expect(model.entries.map((entry) => entry.technical.id)).toEqual([
        "AC-SAMPLE-001",
        "REQ-SAMPLE-001",
      ])
      expect(model.entries.every((entry) => !/\b(?:REQ|AC)-/.test(entry.ref))).toBe(true)
      expect(model.entries[1]).toMatchObject({
        label: "Sample behavior",
        kindLabel: "Requirement",
        state: "Draft - not reviewed",
      })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("fails when the spec configuration or sources are missing", async () => {
    const emptyTarget = await mkdtemp(join(tmpdir(), "query-empty-"))
    const configTarget = await mkdtemp(join(tmpdir(), "query-config-"))
    try {
      await mkdir(join(configTarget, "spec"), { recursive: true })
      await writeFile(
        join(configTarget, "spec", "config.json"),
        JSON.stringify({
          version: 1,
          profile: "full",
          project: { name: "sample", adoption: "existing" },
          adapters: {},
          approval: { mode: "hash-lock", humanOnly: true },
        }),
      )

      const missingConfig = await runQuery(emptyTarget, { workspaceReader: reader() })
      const missingSources = await runQuery(configTarget, { workspaceReader: reader() })

      expect(missingConfig.code).toBe(1)
      expect(missingConfig.output).toContain("missing")
      expect(missingSources.code).toBe(1)
      expect(missingSources.output).toContain("no .sdoc or .md requirement files")
    } finally {
      await rm(emptyTarget, { recursive: true, force: true })
      await rm(configTarget, { recursive: true, force: true })
    }
  })
})
