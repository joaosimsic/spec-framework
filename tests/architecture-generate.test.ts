import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  ARCHITECTURE_DRAFT_PATH,
  ArchitectureModelGenerator,
} from "../src/core/architecture-generate"

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "architecture-generate-"))
  await write(
    join(target, "spec", "config.json"),
    `${JSON.stringify({
      version: 1,
      profile: "full",
      project: { name: "sample-app", adoption: "existing" },
      adapters: {},
      approval: { mode: "human", humanOnly: true },
    })}\n`,
  )
  await write(join(target, "package.json"), `${JSON.stringify({ name: "sample-app" })}\n`)
  await write(join(target, "src", "core", "result.ts"), "export type Result<T> = T\n")
  await write(join(target, "src", "cli.ts"), 'import "./core/result"\n')
  await write(
    join(target, "plugin", "opencode", "package.json"),
    `${JSON.stringify({ name: "@sample/plugin", dependencies: { react: "^19", sqlite: "^1" } })}\n`,
  )
  await write(
    join(target, "plugin", "opencode", "src", "index.ts"),
    'import react from "react"\nexport const plugin = react\n',
  )

  return target
}

describe("ArchitectureModelGenerator", () => {
  test("generates a semantic draft from code facts", async () => {
    const target = await createTarget()
    try {
      const generator = new ArchitectureModelGenerator(target)
      const [run, error] = await generator.write()
      expect(error).toBeNull()
      expect(run?.code).toBe(0)
      expect(run?.path).toBe(join(target, ARCHITECTURE_DRAFT_PATH))

      const model = await readFile(join(target, ARCHITECTURE_DRAFT_PATH), "utf8")
      expect(model).toContain("= system 'sample-app'")
      expect(model).toContain("= component 'Core'")
      expect(model).toContain("= component 'CLI'")
      expect(model).toContain("= component '@sample/plugin'")
      expect(model).toContain("= data_store 'sqlite'")
      expect(model).toContain("= external_system 'react'")
      expect(model).not.toContain("= component 'src/core'")
      expect(model).not.toContain("= component 'src'")
      expect(model).toContain('code="src/core,src/core/result.ts"')
      expect(model).toContain("sysSampleApp -> cmpSrcCore 'contains'")
      expect(model).toContain("cmpSrc -> cmpSrcCore 'depends_on'")
      expect(model).toContain("cmpPluginOpencode -> extReact 'depends_on'")
      expect(model).toContain("view mapDraft")

      const [check, checkError] = await generator.check()
      expect(checkError).toBeNull()
      expect(check?.code).toBe(0)
      expect(check?.changed).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("detects a stale generated draft", async () => {
    const target = await createTarget()
    try {
      const generator = new ArchitectureModelGenerator(target)
      await generator.write()
      await write(join(target, "src", "extra", "check.ts"), "export const check = true\n")

      const [check, error] = await generator.check()
      expect(error).toBeNull()
      expect(check?.code).toBe(1)
      expect(check?.changed).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("never overwrites the curated architecture model", async () => {
    const target = await createTarget()
    const curatedPath = join(target, "spec", "architecture", "model.c4")
    const curated = [
      "specification {",
      "  element system",
      "}",
      "",
      "model {",
      "  // SYS-SAMPLE-APP proposed observed human:owner@2026-11-12",
      "  sample = system 'Curated sample'",
      "}",
      "",
    ].join("\n")
    try {
      await write(curatedPath, curated)
      const generator = new ArchitectureModelGenerator(target)
      await generator.write()

      expect(await readFile(curatedPath, "utf8")).toBe(curated)
      expect(await readFile(join(target, ARCHITECTURE_DRAFT_PATH), "utf8")).toContain(
        "= system 'sample-app'",
      )
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
