import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { TypeScriptDiscovery } from "../src/discovery/typescript"

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "ts-discovery-"))
  await write(join(target, "src", "core", "result.ts"), "export type Result<T> = T\n")
  await write(join(target, "src", "core", "sdoc.ts"), "export const parse = (): void => {}\n")
  await write(
    join(target, "src", "change", "operations.ts"),
    [
      'import { parse } from "../core/sdoc"',
      'import { Result } from "../core/result"',
      'import Ajv from "ajv"',
      'import { readFile } from "node:fs/promises"',
    ].join("\n"),
  )
  await write(join(target, "src", "cli.ts"), 'import { parse } from "./change/operations"\n')
  await write(join(target, "bin", "spec.ts"), '#!/usr/bin/env bun\nimport "../src/cli"\n')
  await write(
    join(target, "src", "workbench", "service.ts"),
    'import { parse } from "../change/operations"\n',
  )
  await write(
    join(target, "plugin", "opencode", "src", "tools.ts"),
    'import { parse } from "../../../src/core/result"\n',
  )
  await write(join(target, "tests", "ignored.test.ts"), 'import "../../src/core/sdoc"\n')
  await write(join(target, "docs", "ignored.ts"), "export const docs = true\n")

  return target
}

describe("TypeScriptDiscovery", () => {
  test("maps subsystems, files, containment, and local imports", async () => {
    const target = await createTarget()
    try {
      const contribution = await new TypeScriptDiscovery().discover(target, "SYS-SAMPLE")
      const byId = new Map(contribution.elements.map((element) => [element.id, element]))

      for (const id of [
        "CMP-SRC",
        "CMP-SRC-CORE",
        "CMP-SRC-CHANGE",
        "CMP-SRC-WORKBENCH",
        "CMP-PLUGIN-OPENCODE",
      ]) {
        expect(byId.get(id)?.kind).toBe("component")
      }
      expect(byId.get("CMP-SRC")?.title).toBe("src")
      expect(byId.get("CMP-SRC-CORE")?.title).toBe("src/core")
      expect(byId.get("CMP-PLUGIN-OPENCODE")?.title).toBe("plugin/opencode")
      expect(contribution.elements.some((element) => element.id === "CMP-BIN")).toBe(false)

      for (const id of [
        "FILE-SRC-CORE-SDOC-TS",
        "FILE-SRC-CORE-RESULT-TS",
        "FILE-SRC-CHANGE-OPERATIONS-TS",
        "FILE-SRC-CLI-TS",
        "FILE-SRC-WORKBENCH-SERVICE-TS",
        "FILE-PLUGIN-OPENCODE-SRC-TOOLS-TS",
      ]) {
        expect(byId.get(id)?.kind).toBe("module")
      }

      expect(byId.get("FILE-SRC-CHANGE-OPERATIONS-TS")?.links).toContainEqual({
        type: "part_of",
        to: "CMP-SRC-CHANGE",
        confidence: "observed",
        provenance: "code:src/change/operations.ts",
      })
      expect(byId.get("FILE-SRC-CHANGE-OPERATIONS-TS")?.links).toContainEqual({
        type: "depends_on",
        to: "FILE-SRC-CORE-SDOC-TS",
        confidence: "observed",
        provenance: "code:src/change/operations.ts#imports",
      })
      expect(byId.get("CMP-SRC-CHANGE")?.links).toContainEqual({
        type: "depends_on",
        to: "CMP-SRC-CORE",
        confidence: "observed",
        provenance: "code:src/change/operations.ts#imports",
      })

      expect(
        contribution.elements.some((element) => element.title === "tests/ignored.test.ts"),
      ).toBe(false)
      expect(contribution.elements.some((element) => element.title === "docs/ignored.ts")).toBe(
        false,
      )
      expect(contribution.externalDependencies).toEqual(["CMP-SRC-CHANGE -> ajv"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("is deterministic", async () => {
    const target = await createTarget()
    try {
      const first = await new TypeScriptDiscovery().discover(target, "SYS-SAMPLE")
      const second = await new TypeScriptDiscovery().discover(target, "SYS-SAMPLE")

      expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
