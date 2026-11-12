import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TypeScriptSymbolReader } from "../src/workbench/code-symbols"

describe("TypeScriptSymbolReader", () => {
  test("extracts exported and internal top-level declarations", async () => {
    const target = await mkdtemp(join(tmpdir(), "code-symbols-"))

    try {
      await mkdir(join(target, "src"), { recursive: true })
      await writeFile(
        join(target, "src", "sample.ts"),
        `export function run(): void {}
export interface Input { value: string }
export const load = () => 1
class Internal {}
type Hidden = string
`,
      )

      const symbols = await new TypeScriptSymbolReader(target).read(["src/sample.ts"])
      const byName = new Map(
        (symbols.get("src/sample.ts") ?? []).map((symbol) => [symbol.name, symbol]),
      )

      expect(byName.get("run")).toMatchObject({ kind: "function", exported: true })
      expect(byName.get("Input")).toMatchObject({ kind: "interface", exported: true })
      expect(byName.get("load")).toMatchObject({ kind: "function", exported: true })
      expect(byName.get("Internal")).toMatchObject({ kind: "class", exported: false })
      expect(byName.get("Hidden")).toMatchObject({ kind: "type", exported: false })
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
