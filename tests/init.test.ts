import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { initProject } from "../src/core/init"
import { runCheck } from "../src/core/check"

describe("initProject", () => {
  test("creates a full spec scaffold that passes structural checks", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      const created = await initProject(dir)
      expect(created.length).toBeGreaterThan(0)

      const run = await runCheck(dir, { structural: true })
      expect(run.code).toBe(0)
      expect(run.result.errors).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("refuses to overwrite without force", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await initProject(dir)
      await expect(initProject(dir)).rejects.toThrow("already exists")
      await expect(initProject(dir, { force: true })).resolves.toBeDefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
