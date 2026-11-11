import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { NativeAdapter } from "../src/adapters/types"
import { elementContentHash } from "../src/approval/hash"
import { SpecLockWriter } from "../src/approval/lock"
import type { SpecLock } from "../src/approval/types"
import type { Proposal } from "../src/change/types"
import type { Result } from "../src/core/result"
import { parseSdoc, requirementBlocks } from "../src/core/sdoc"
import { EvidenceFactory, type EvidenceRecord } from "../src/evidence"
import type { GraphWorkspace } from "../src/model/types"
import type { WorkspaceMetadataReader } from "../src/query/types"
import {
  BundlePdfRenderer,
  runBundle,
  type BundleOptions,
  type BundleReport,
  type ProposalContext,
  type ProposalContextReader,
} from "../src/bundle/index"

const validRequirement = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
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

const approvedRequirement = validRequirement.replaceAll("STATUS: Draft", "STATUS: Approved")

const invalidRequirement = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: invalid statement
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-10
OWNER: test
`

class FakeWorkspaceReader implements WorkspaceMetadataReader {
  constructor(private readonly workspace: GraphWorkspace) {}

  async read(target: string): Promise<Result<GraphWorkspace, string>> {
    void target

    return [this.workspace, null]
  }
}

class FakeProposalReader implements ProposalContextReader {
  constructor(private readonly context: ProposalContext | null) {}

  async read(target: string): Promise<Result<ProposalContext | null, string>> {
    void target

    return [this.context, null]
  }
}

function noopAdapter(id: string): NativeAdapter {
  return {
    id,
    tool: id,
    requiredTools: [],
    async detect() {
      return false
    },
    async run() {
      return { ran: false, diagnostics: [] }
    },
  }
}

function evidenceAdapter(record: EvidenceRecord): NativeAdapter {
  return {
    id: "fake-evidence",
    tool: record.tool,
    requiredTools: [],
    async detect() {
      return true
    },
    async run() {
      return { ran: true, diagnostics: [], evidence: [record] }
    },
  }
}

function cleanWorkspace(commit = "a1b2c3d4e5f6"): GraphWorkspace {
  return { workspace: "single-repo", commit, dirty: false }
}

function options(workspace: GraphWorkspace, overrides: Partial<BundleOptions> = {}): BundleOptions {
  return {
    workspaceReader: new FakeWorkspaceReader(workspace),
    proposalReader: new FakeProposalReader(null),
    checkOptions: {
      implementationAdapter: noopAdapter("implementation"),
      architectureAdapter: noopAdapter("architecture"),
      requirementsAdapter: noopAdapter("requirements"),
      formalAdapter: noopAdapter("formal"),
    },
    ...overrides,
  }
}

async function createTarget(requirement = validRequirement): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "bundle-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await mkdir(join(target, "spec", "formal"), { recursive: true })
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
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), requirement)
  await writeFile(join(target, "spec", "formal", "example.qnt"), "module example {}\n")

  return target
}

function fixtureProposal(): Proposal {
  return {
    version: 1,
    id: "prop-session-expiry",
    direction: "add session expiry handling",
    mode: "refactor",
    status: "proposed",
    branch: "spec/session-expiry",
    base_commit: "a1b2c3d4e5f6",
    baseline: { commit: "a1b2c3d4e5f6", lock_hash: null },
    author: "test",
    created_at: "2026-11-10T00:00:00.000Z",
    operations: [],
  }
}

function pdfReport(count: number): BundleReport {
  return {
    project: "sample",
    specVersion: "0.1.0",
    graphVersion: 1,
    commit: "a1b2c3d4e5f6",
    workspace: "single-repo",
    dirty: false,
    preview: false,
    tools: {},
    elements: Array.from({ length: count }, (_, index) => ({
      id: `REQ-SAMPLE-${index}`,
      kind: "requirement",
      title: `Requirement ${index}`,
      status: "draft",
      links: [],
    })),
    evidence: [],
    checks: [],
    findings: [],
    approvals: [],
    pending: [],
    sources: [],
    changeReport: "No active proposal.",
    lock: null,
  }
}

describe("BundlePdfRenderer", () => {
  test("paginates long reports", () => {
    const pdf = Buffer.from(new BundlePdfRenderer().render(pdfReport(120))).toString("latin1")

    expect(pdf.startsWith("%PDF-1.4")).toBe(true)
    expect((pdf.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(1)
    expect(pdf).toContain("startxref")
  })
})

describe("runBundle", () => {
  test("writes the audit bundle layout", async () => {
    const target = await createTarget()
    try {
      const run = await runBundle(target, options(cleanWorkspace()))
      expect(run.code).toBe(0)
      expect(run.directory).toBe(join(target, "spec", "audit", "audit-a1b2c3d4e5f6"))
      expect(run.manifest?.project.name).toBe("sample")

      const directory = run.directory ?? ""
      const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"))
      const graph = JSON.parse(await readFile(join(directory, "graph.json"), "utf8"))
      const html = await readFile(join(directory, "index.html"), "utf8")
      const changeReport = await readFile(join(directory, "change-report.md"), "utf8")
      const pdf = await readFile(join(directory, "spec.pdf"))

      expect(manifest.version).toBe(1)
      expect(manifest.git.commit).toBe("a1b2c3d4e5f6")
      expect(manifest.checks.errors).toBe(0)
      expect(manifest.sources.requirements).toEqual([
        {
          path: "spec/requirements/core.sdoc",
          hash: expect.stringMatching(/^sha256:/),
        },
      ])
      expect(graph.elements.map((element: { id: string }) => element.id)).toEqual([
        "AC-SAMPLE-001",
        "REQ-SAMPLE-001",
      ])
      expect(html).toContain("Audit bundle")
      expect(html).toContain("REQ-SAMPLE-001")
      expect(changeReport).toContain("No active proposal")
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-")
      expect(await Bun.file(join(directory, "sources", "requirements", "core.sdoc")).exists()).toBe(
        true,
      )
      expect(await Bun.file(join(directory, "sources", "formal", "example.qnt")).exists()).toBe(
        true,
      )
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("produces deterministic files across runs", async () => {
    const target = await createTarget()
    try {
      const first = await runBundle(target, options(cleanWorkspace(), { output: "audit-one" }))
      const second = await runBundle(target, options(cleanWorkspace(), { output: "audit-two" }))
      expect(first.code).toBe(0)
      expect(second.code).toBe(0)

      for (const file of ["manifest.json", "graph.json", "index.html", "change-report.md"]) {
        const left = await readFile(join(target, "audit-one", file))
        const right = await readFile(join(target, "audit-two", file))
        expect(left.equals(right)).toBe(true)
      }
      const leftPdf = await readFile(join(target, "audit-one", "spec.pdf"))
      const rightPdf = await readFile(join(target, "audit-two", "spec.pdf"))
      expect(leftPdf.equals(rightPdf)).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("includes regenerated evidence", async () => {
    const target = await createTarget()
    try {
      const record = new EvidenceFactory().create({
        id: "EVD-BUNDLE-001",
        kind: "test",
        method: "test",
        tool: "bun",
        result: "pass",
        inputs: [],
      })
      const base = options(cleanWorkspace())
      const run = await runBundle(target, {
        ...base,
        checkOptions: {
          ...base.checkOptions,
          contractAdapters: [evidenceAdapter(record)],
        },
      })
      expect(run.code).toBe(0)

      const directory = run.directory ?? ""
      const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"))
      expect(manifest.evidence["EVD-BUNDLE-001"]).toMatchObject({
        method: "test",
        result: "pass",
        hash: record.hash,
      })
      expect(
        await Bun.file(join(directory, "evidence", "test", "EVD-BUNDLE-001.json")).exists(),
      ).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("refuses a dirty tree unless allowed", async () => {
    const target = await createTarget()
    try {
      const dirty = { ...cleanWorkspace(), dirty: true }
      const refused = await runBundle(target, options(dirty))
      expect(refused.code).toBe(1)
      expect(refused.output).toContain("git tree is dirty")

      const allowed = await runBundle(target, options(dirty, { allowDirty: true }))
      expect(allowed.code).toBe(0)
      expect(allowed.manifest?.git.preview).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("refuses an existing destination unless forced", async () => {
    const target = await createTarget()
    try {
      const first = await runBundle(target, options(cleanWorkspace(), { output: "audit" }))
      expect(first.code).toBe(0)

      const refused = await runBundle(target, options(cleanWorkspace(), { output: "audit" }))
      expect(refused.code).toBe(1)
      expect(refused.output).toContain("already exists")

      const forced = await runBundle(
        target,
        options(cleanWorkspace(), { output: "audit", force: true }),
      )
      expect(forced.code).toBe(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("refuses to replace a non-bundle directory", async () => {
    const target = await createTarget()
    try {
      await mkdir(join(target, "existing"), { recursive: true })
      await writeFile(join(target, "existing", "keep.txt"), "keep")

      const run = await runBundle(
        target,
        options(cleanWorkspace(), { output: "existing", force: true }),
      )
      expect(run.code).toBe(1)
      expect(run.output).toContain("refusing to replace non-bundle directory")
      expect(await Bun.file(join(target, "existing", "keep.txt")).exists()).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("does not write a bundle when checks fail", async () => {
    const target = await createTarget(invalidRequirement)
    try {
      const run = await runBundle(target, options(cleanWorkspace(), { output: "audit" }))
      expect(run.code).toBe(1)
      expect(run.output).toContain("checks reported")

      const exists = await stat(join(target, "audit")).then(
        () => true,
        () => false,
      )
      expect(exists).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("renders the active proposal change report", async () => {
    const target = await createTarget()
    try {
      const run = await runBundle(
        target,
        options(cleanWorkspace(), {
          proposalReader: new FakeProposalReader({
            branch: "spec/session-expiry",
            proposal: fixtureProposal(),
          }),
        }),
      )
      expect(run.code).toBe(0)
      const report = await readFile(join(run.directory ?? "", "change-report.md"), "utf8")
      expect(report).toContain("add session expiry handling")
      expect(report).toContain("No typed operations")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("copies the approval lock and counts approvals", async () => {
    const target = await createTarget(approvedRequirement)
    try {
      const blocks = requirementBlocks(parseSdoc("fixture", approvedRequirement))
      const lock: SpecLock = {
        version: 1,
        approved_at: "2026-11-10T00:00:00.000Z",
        approver: "reviewer",
        dirty: false,
        elements: Object.fromEntries(
          blocks.map((block) => [
            block.fields.UID ?? "",
            { content_hash: elementContentHash(block), evidence: [] },
          ]),
        ),
        evidence: {},
      }
      const [, lockError] = await new SpecLockWriter(target).write(lock)
      expect(lockError).toBeNull()

      const run = await runBundle(target, options(cleanWorkspace(), { output: "audit" }))
      expect(run.code).toBe(0)
      expect(run.manifest?.approvals.approved_elements).toBe(2)
      expect(run.manifest?.approvals.approver).toBe("reviewer")
      expect(await Bun.file(join(target, "audit", "spec.lock")).exists()).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("writes JSON output when requested", async () => {
    const target = await createTarget()
    try {
      const run = await runBundle(
        target,
        options(cleanWorkspace(), { output: "audit", json: true }),
      )
      expect(run.code).toBe(0)
      const parsed = JSON.parse(run.output) as {
        directory: string
        manifest: { version: number }
      }
      expect(parsed.directory).toBe(join(target, "audit"))
      expect(parsed.manifest.version).toBe(1)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
