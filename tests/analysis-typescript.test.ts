import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { RepositoryScanner } from "../src/analysis/scanner"
import { TypeScriptAdapter } from "../src/analysis/adapters/typescript"
import { IrIdentity } from "../src/analysis/ir"

const root = join(import.meta.dir, "fixtures", "repositories", "typescript-basic")

async function analyze() {
  const [scan, scanError] = await new RepositoryScanner().scan(root)
  expect(scanError).toBeNull()
  if (scan === null) throw new Error("scan unavailable")
  const [snapshot, snapshotError] = await new TypeScriptAdapter().analyze(root, scan.files)

  return { scan, snapshot, snapshotError }
}

describe("TypeScript analysis", () => {
  test("scans source files and applies ignore rules", async () => {
    const { scan } = await analyze()
    const paths = scan.files.map((file) => file.path)
    expect(paths).toContain("src/math.ts")
    expect(paths).toContain("bin/cli.ts")
    expect(paths).not.toContain("generated.txt")
    expect(paths).not.toContain(".env")
  })

  test("extracts symbols, calls, data access, and entry points", async () => {
    const { snapshot, snapshotError } = await analyze()
    expect(snapshotError).toBeNull()
    if (snapshot === null) return

    const ids = new Set(snapshot.elements.map((element) => element.id))
    expect(ids.has(IrIdentity.file("src/math.ts"))).toBe(true)
    expect(ids.has(IrIdentity.symbol("src/math.ts", "add"))).toBe(true)
    expect(ids.has(IrIdentity.symbol("src/math.ts", "Counter.increment"))).toBe(true)

    const run = snapshot.elements.find((element) => element.name === "run")
    expect(run?.calls.some((call) => call.state === "resolved")).toBe(true)
    expect(
      snapshot.relationships.some(
        (relationship) =>
          relationship.type === "calls" &&
          relationship.sourceId === run?.id &&
          relationship.resolution === "resolved",
      ),
    ).toBe(true)

    const save = snapshot.elements.find((element) => element.name === "save")
    expect(save?.dataAccess.map((access) => access.channel)).toContain("filesystem")
    expect(save?.dataAccess.map((access) => access.channel)).toContain("network")

    const kinds = snapshot.entryPoints.map((entry) => entry.kind)
    expect(kinds).toContain("cli")
    expect(kinds).toContain("application_main")
    expect(kinds).toContain("http_route")
    expect(kinds).toContain("library_api")
  })

  test("produces deterministic output", async () => {
    const first = await analyze()
    const second = await analyze()
    expect(JSON.stringify(first.snapshot)).toBe(JSON.stringify(second.snapshot))
  })
})
