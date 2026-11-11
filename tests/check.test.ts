import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { NativeAdapter } from "../src/adapters/types"
import { runCheck } from "../src/core/check"
import { EvidenceFactory } from "../src/evidence"

const validConfig = {
  version: 1,
  profile: "full",
  project: {
    name: "sample",
    adoption: "existing",
  },
  adapters: {
    architecture: "likec4",
    requirements: "strictdoc",
    formal: "quint",
  },
  approval: {
    mode: "hash-lock",
    humanOnly: true,
  },
}

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

describe("runCheck", () => {
  test("reports missing requirements", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(dir, "spec", "requirements"), { recursive: true })
      const run = await runCheck(dir, { structural: true })
      expect(run.code).toBe(1)
      expect(run.result.diagnostics.some((item) => item.code === "SPEC-NO-REQUIREMENTS")).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("reports structural errors with file and line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const reqDir = join(dir, "spec", "requirements")
      await mkdir(reqDir, { recursive: true })
      await writeFile(
        join(reqDir, "bad.sdoc"),
        `[REQUIREMENT]\nUID: REQ-BAD-001\nTITLE: Bad\nSTATUS: Draft\nSTATEMENT: broken\nPROVENANCE: human:test@2026-11-10\nOWNER: test\n`,
      )
      const run = await runCheck(dir, { structural: true })
      expect(run.code).toBe(1)
      const error = run.result.diagnostics.find((item) => item.code === "SDOC-BAD-EARS")
      expect(error?.file).toContain("bad.sdoc")
      expect(error?.line).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("runs the architecture adapter for native checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(join(specDir, "config.json"), JSON.stringify(validConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const adapter: NativeAdapter = {
        id: "likec4",
        tool: "likec4",
        async run() {
          return {
            ran: true,
            diagnostics: [
              {
                level: "error",
                code: "ARCH-TEST",
                message: "architecture failed",
              },
            ],
          }
        },
      }
      const formalAdapter: NativeAdapter = {
        id: "quint",
        tool: "quint",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const run = await runCheck(dir, { architectureAdapter: adapter, formalAdapter })

      expect(run.result.diagnostics.some((item) => item.code === "ARCH-TEST")).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("collects evidence from native adapters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(join(specDir, "config.json"), JSON.stringify(validConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const evidence = new EvidenceFactory().create({
        id: "EVD-CHECK-001",
        kind: "architecture",
        method: "analysis",
        tool: "fake",
        result: "pass",
        inputs: [],
      })
      const adapter: NativeAdapter = {
        id: "likec4",
        tool: "fake",
        requiredTools: [],
        async run() {
          return { ran: true, diagnostics: [], evidence: [evidence] }
        },
      }
      const inactive = (id: string): NativeAdapter => ({
        id,
        tool: id,
        requiredTools: [],
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      const run = await runCheck(dir, {
        architectureAdapter: adapter,
        requirementsAdapter: inactive("strictdoc"),
        formalAdapter: inactive("quint"),
        contractAdapters: [],
      })

      expect(run.evidence).toEqual([evidence])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("runs the requirements adapter for native checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(join(specDir, "config.json"), JSON.stringify(validConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const architectureAdapter: NativeAdapter = {
        id: "likec4",
        tool: "likec4",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const requirementsAdapter: NativeAdapter = {
        id: "strictdoc",
        tool: "strictdoc",
        async run() {
          return {
            ran: true,
            diagnostics: [
              {
                level: "error",
                code: "REQ-TEST",
                message: "requirements failed",
              },
            ],
          }
        },
      }
      const formalAdapter: NativeAdapter = {
        id: "quint",
        tool: "quint",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const run = await runCheck(dir, { architectureAdapter, requirementsAdapter, formalAdapter })

      expect(run.result.diagnostics.some((item) => item.code === "REQ-TEST")).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("rejects an unknown requirements adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(join(specDir, "config.json"), JSON.stringify(validConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const architectureAdapter: NativeAdapter = {
        id: "likec4",
        tool: "likec4",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const requirementsAdapter: NativeAdapter = {
        id: "other",
        tool: "other",
        async run() {
          return { ran: true, diagnostics: [] }
        },
      }
      const formalAdapter: NativeAdapter = {
        id: "quint",
        tool: "quint",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const run = await runCheck(dir, { architectureAdapter, requirementsAdapter, formalAdapter })

      expect(run.result.diagnostics.some((item) => item.code === "REQ-UNKNOWN-ADAPTER")).toBe(
        true,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("skips the requirements adapter for structural checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(dir, "spec", "requirements"), { recursive: true })
      let called = false
      const adapter: NativeAdapter = {
        id: "likec4",
        tool: "likec4",
        async run() {
          called = true
          return { ran: true, diagnostics: [] }
        },
      }

      await runCheck(dir, { structural: true, architectureAdapter: adapter })

      expect(called).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("reports JSON output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(dir, "spec", "requirements"), { recursive: true })
      const run = await runCheck(dir, { structural: true, json: true })
      const output = JSON.parse(run.output) as {
        errors: number
        warnings: number
        diagnostics: unknown[]
      }

      expect(output.errors).toBeGreaterThan(0)
      expect(output.warnings).toBe(0)
      expect(output.diagnostics.length).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("runs the formal adapter for native checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(join(specDir, "config.json"), JSON.stringify(validConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const architectureAdapter: NativeAdapter = {
        id: "likec4",
        tool: "likec4",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const requirementsAdapter: NativeAdapter = {
        id: "strictdoc",
        tool: "strictdoc",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const formalAdapter: NativeAdapter = {
        id: "quint",
        tool: "quint",
        async run() {
          return {
            ran: true,
            diagnostics: [
              {
                level: "error",
                code: "FORMAL-TEST",
                message: "formal failed",
              },
            ],
          }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter,
        requirementsAdapter,
        formalAdapter,
      })

      expect(run.result.diagnostics.some((item) => item.code === "FORMAL-TEST")).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("rejects an unknown formal adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const unknownConfig = {
        ...validConfig,
        adapters: { ...validConfig.adapters, formal: "other" },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(unknownConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const architectureAdapter: NativeAdapter = {
        id: "likec4",
        tool: "likec4",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const requirementsAdapter: NativeAdapter = {
        id: "strictdoc",
        tool: "strictdoc",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const formalAdapter: NativeAdapter = {
        id: "quint",
        tool: "quint",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter,
        requirementsAdapter,
        formalAdapter,
      })

      expect(run.result.diagnostics.some((item) => item.code === "FORMAL-UNKNOWN-ADAPTER")).toBe(
        true,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("skips the formal adapter for structural checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(dir, "spec", "requirements"), { recursive: true })
      let called = false
      const formalAdapter: NativeAdapter = {
        id: "quint",
        tool: "quint",
        async run() {
          called = true
          return { ran: true, diagnostics: [] }
        },
      }

      await runCheck(dir, { structural: true, formalAdapter })

      expect(called).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("skips formal checks when the config has no formal key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const noFormalConfig = {
        ...validConfig,
        adapters: {
          architecture: "likec4",
          requirements: "strictdoc",
        },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(noFormalConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const architectureAdapter: NativeAdapter = {
        id: "likec4",
        tool: "likec4",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const requirementsAdapter: NativeAdapter = {
        id: "strictdoc",
        tool: "strictdoc",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      let called = false
      const formalAdapter: NativeAdapter = {
        id: "quint",
        tool: "quint",
        async run() {
          called = true
          return { ran: true, diagnostics: [] }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter,
        requirementsAdapter,
        formalAdapter,
      })

      expect(called).toBe(false)
      expect(run.result.diagnostics.some((item) => item.code.startsWith("FORMAL-"))).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("runs the contract adapters for native checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const contractConfig = {
        ...validConfig,
        adapters: { ...validConfig.adapters, contracts: ["json-schema"] },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(contractConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const silentAdapter = (id: string, tool: string): NativeAdapter => ({
        id,
        tool,
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      const contractAdapter: NativeAdapter = {
        id: "json-schema",
        tool: "json-schema",
        async run() {
          return {
            ran: true,
            diagnostics: [
              {
                level: "error",
                code: "CONTRACT-TEST",
                message: "contract failed",
              },
            ],
          }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter: silentAdapter("likec4", "likec4"),
        requirementsAdapter: silentAdapter("strictdoc", "strictdoc"),
        formalAdapter: silentAdapter("quint", "quint"),
        contractAdapters: [contractAdapter],
      })

      expect(run.result.diagnostics.some((item) => item.code === "CONTRACT-TEST")).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("rejects an unknown contract adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const unknownConfig = {
        ...validConfig,
        adapters: { ...validConfig.adapters, contracts: ["other"] },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(unknownConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const silentAdapter = (id: string): NativeAdapter => ({
        id,
        tool: id,
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      const contractAdapter: NativeAdapter = {
        id: "json-schema",
        tool: "json-schema",
        async run() {
          return { ran: false, diagnostics: [] }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter: silentAdapter("likec4"),
        requirementsAdapter: silentAdapter("strictdoc"),
        formalAdapter: silentAdapter("quint"),
        contractAdapters: [contractAdapter],
      })

      expect(
        run.result.diagnostics.some((item) => item.code === "CONTRACT-UNKNOWN-ADAPTER"),
      ).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("skips contract adapters for structural checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(dir, "spec", "requirements"), { recursive: true })
      let called = false
      const contractAdapter: NativeAdapter = {
        id: "json-schema",
        tool: "json-schema",
        async run() {
          called = true
          return { ran: true, diagnostics: [] }
        },
      }

      await runCheck(dir, { structural: true, contractAdapters: [contractAdapter] })

      expect(called).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("skips contract checks when the config has no contracts key", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(join(specDir, "config.json"), JSON.stringify(validConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const silentAdapter = (id: string): NativeAdapter => ({
        id,
        tool: id,
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      let called = false
      const contractAdapter: NativeAdapter = {
        id: "json-schema",
        tool: "json-schema",
        async run() {
          called = true
          return { ran: true, diagnostics: [] }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter: silentAdapter("likec4"),
        requirementsAdapter: silentAdapter("strictdoc"),
        formalAdapter: silentAdapter("quint"),
        contractAdapters: [contractAdapter],
      })

      expect(called).toBe(false)
      expect(run.result.diagnostics.some((item) => item.code.startsWith("CONTRACT-"))).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("auto-runs detected architecture, requirements, and formal adapters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(
        join(specDir, "config.json"),
        JSON.stringify({ ...validConfig, adapters: {} }),
      )
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const detectedAdapter = (id: string, code: string): NativeAdapter => ({
        id,
        tool: id,
        async detect() {
          return true
        },
        async run() {
          return {
            ran: true,
            diagnostics: [{ level: "error", code, message: `${id} detected` }],
          }
        },
      })
      const run = await runCheck(dir, {
        architectureAdapter: detectedAdapter("likec4", "ARCH-DETECTED"),
        requirementsAdapter: detectedAdapter("strictdoc", "REQ-DETECTED"),
        formalAdapter: detectedAdapter("quint", "FORMAL-DETECTED"),
      })

      expect(run.result.diagnostics.some((item) => item.code === "ARCH-DETECTED")).toBe(true)
      expect(run.result.diagnostics.some((item) => item.code === "REQ-DETECTED")).toBe(true)
      expect(run.result.diagnostics.some((item) => item.code === "FORMAL-DETECTED")).toBe(true)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("auto-runs a detected contract adapter without configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(join(specDir, "config.json"), JSON.stringify(validConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const silentAdapter = (id: string): NativeAdapter => ({
        id,
        tool: id,
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      const detectedContract: NativeAdapter = {
        id: "rust",
        tool: "rust",
        async detect() {
          return true
        },
        async run() {
          return {
            ran: true,
            diagnostics: [
              { level: "error", code: "CONTRACT-RUST-DETECTED", message: "detected" },
            ],
          }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter: silentAdapter("likec4"),
        requirementsAdapter: silentAdapter("strictdoc"),
        formalAdapter: silentAdapter("quint"),
        contractAdapters: [detectedContract],
      })

      expect(run.result.diagnostics.some((item) => item.code === "CONTRACT-RUST-DETECTED")).toBe(
        true,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("runs an explicitly required adapter even when detection is false", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const contractConfig = {
        ...validConfig,
        adapters: { ...validConfig.adapters, contracts: ["rust"] },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(contractConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const silentAdapter = (id: string): NativeAdapter => ({
        id,
        tool: id,
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      const contractAdapter: NativeAdapter = {
        id: "rust",
        tool: "rust",
        async detect() {
          return false
        },
        async run() {
          return {
            ran: true,
            diagnostics: [
              { level: "error", code: "CONTRACT-RUST-REQUIRED", message: "required" },
            ],
          }
        },
      }
      const run = await runCheck(dir, {
        architectureAdapter: silentAdapter("likec4"),
        requirementsAdapter: silentAdapter("strictdoc"),
        formalAdapter: silentAdapter("quint"),
        contractAdapters: [contractAdapter],
      })

      expect(run.result.diagnostics.some((item) => item.code === "CONTRACT-RUST-REQUIRED")).toBe(
        true,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("runs a detected and configured contract adapter only once", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const contractConfig = {
        ...validConfig,
        adapters: { ...validConfig.adapters, contracts: ["rust"] },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(contractConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const silentAdapter = (id: string): NativeAdapter => ({
        id,
        tool: id,
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      let callCount = 0
      const contractAdapter: NativeAdapter = {
        id: "rust",
        tool: "rust",
        async detect() {
          return true
        },
        async run() {
          callCount += 1
          return { ran: true, diagnostics: [] }
        },
      }
      await runCheck(dir, {
        architectureAdapter: silentAdapter("likec4"),
        requirementsAdapter: silentAdapter("strictdoc"),
        formalAdapter: silentAdapter("quint"),
        contractAdapters: [contractAdapter],
      })

      expect(callCount).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("runs the compiler adapter before other native adapters", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const implementationConfig = {
        ...validConfig,
        adapters: { ...validConfig.adapters, implementation: "compiler" },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(implementationConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const order: string[] = []
      const recordingAdapter = (id: string): NativeAdapter => ({
        id,
        tool: id,
        async run() {
          order.push(id)
          return { ran: true, diagnostics: [] }
        },
      })
      await runCheck(dir, {
        implementationAdapter: recordingAdapter("compiler"),
        architectureAdapter: recordingAdapter("likec4"),
        requirementsAdapter: recordingAdapter("strictdoc"),
        formalAdapter: recordingAdapter("quint"),
      })

      expect(order).toEqual(["compiler", "likec4", "strictdoc", "quint"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("rejects an unknown implementation adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      const unknownConfig = {
        ...validConfig,
        adapters: { ...validConfig.adapters, implementation: "other" },
      }
      await writeFile(join(specDir, "config.json"), JSON.stringify(unknownConfig))
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const run = await runCheck(dir, {
        implementationAdapter: {
          id: "compiler",
          tool: "compiler",
          async run() {
            return { ran: false, diagnostics: [] }
          },
        },
      })

      expect(run.result.diagnostics.some((item) => item.code === "IMPL-UNKNOWN-ADAPTER")).toBe(
        true,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("skips the compiler adapter for structural checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(dir, "spec", "requirements"), { recursive: true })
      let called = false
      const implementationAdapter: NativeAdapter = {
        id: "compiler",
        tool: "compiler",
        async run() {
          called = true
          return { ran: true, diagnostics: [] }
        },
      }

      await runCheck(dir, { structural: true, implementationAdapter })

      expect(called).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("auto-runs a detected compiler adapter without configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const specDir = join(dir, "spec")
      const requirementsDir = join(specDir, "requirements")
      await mkdir(requirementsDir, { recursive: true })
      await writeFile(
        join(specDir, "config.json"),
        JSON.stringify({ ...validConfig, adapters: {} }),
      )
      await writeFile(join(requirementsDir, "core.sdoc"), validRequirement)

      const silentAdapter = (id: string): NativeAdapter => ({
        id,
        tool: id,
        async run() {
          return { ran: false, diagnostics: [] }
        },
      })
      const implementationAdapter: NativeAdapter = {
        id: "compiler",
        tool: "compiler",
        async detect() {
          return true
        },
        async run() {
          return {
            ran: true,
            diagnostics: [
              { level: "error", code: "IMPL-COMPILE-DETECTED", message: "detected" },
            ],
          }
        },
      }
      const run = await runCheck(dir, {
        implementationAdapter,
        architectureAdapter: silentAdapter("likec4"),
        requirementsAdapter: silentAdapter("strictdoc"),
        formalAdapter: silentAdapter("quint"),
      })

      expect(run.result.diagnostics.some((item) => item.code === "IMPL-COMPILE-DETECTED")).toBe(
        true,
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
