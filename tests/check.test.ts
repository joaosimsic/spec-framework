import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runCheck } from "../src/core/check"

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
})
