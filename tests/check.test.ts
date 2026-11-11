import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { NativeAdapter } from "../src/adapters/types"
import { runCheck } from "../src/core/check"

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
      const run = await runCheck(dir, { architectureAdapter: adapter })

      expect(run.result.diagnostics.some((item) => item.code === "ARCH-TEST")).toBe(true)
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
      const run = await runCheck(dir, { architectureAdapter, requirementsAdapter })

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
      const run = await runCheck(dir, { architectureAdapter, requirementsAdapter })

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
})
