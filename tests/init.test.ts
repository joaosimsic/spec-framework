import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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
      expect(created.some((path) => path.endsWith("contracts/json-schema/example.schema.json"))).toBe(
        true,
      )
      expect(created.some((path) => path.endsWith("contracts/cli/version.snapshot.json"))).toBe(
        true,
      )
      expect(created.some((path) => path.endsWith("implementation/README.md"))).toBe(true)

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

  test("detects Rust and enables the Rust contract adapter", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await writeFile(join(dir, "Cargo.toml"), '[package]\nname = "sample"\nversion = "0.1.0"\n')
      await initProject(dir, { existing: true })

      const config = JSON.parse(await readFile(join(dir, "spec", "config.json"), "utf8")) as {
        adapters: { contracts: string[]; formal?: string }
      }

      expect(config.adapters.contracts).toContain("rust")
      expect(config.adapters.formal).toBeUndefined()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("enables formal checks when Quint sources already exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "spec-framework-"))
    try {
      await mkdir(join(dir, "spec", "formal"), { recursive: true })
      await writeFile(join(dir, "spec", "formal", "model.qnt"), "module model {\n}\n")
      await initProject(dir, { existing: true })

      const config = JSON.parse(await readFile(join(dir, "spec", "config.json"), "utf8")) as {
        adapters: { formal?: string }
      }

      expect(config.adapters.formal).toBe("quint")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
