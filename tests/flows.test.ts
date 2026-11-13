import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { TypeScriptAdapter } from "../src/analysis/adapters/typescript"
import { RepositoryScanner } from "../src/analysis/scanner"
import { FlowAnalyzer } from "../src/flows/analyzer"

const root = join(import.meta.dir, "fixtures", "repositories", "typescript-basic")

describe("functional flows", () => {
  test("traces from an entry point through resolvable calls", async () => {
    const [scan, scanError] = await new RepositoryScanner().scan(root)
    expect(scanError).toBeNull()
    if (scan === null) throw new Error("scan unavailable")
    const [snapshot, snapshotError] = await new TypeScriptAdapter().analyze(root, scan.files)
    expect(snapshotError).toBeNull()
    if (snapshot === null) return

    const flows = new FlowAnalyzer().analyze(
      snapshot.elements,
      snapshot.relationships,
      snapshot.entryPoints,
    )
    const cli = flows.find((flow) => flow.entryPointId === "ENTRY-cli-bin/cli.ts")
    expect(cli).toBeDefined()
    expect(cli?.steps.length).toBeGreaterThan(1)
    expect(cli?.steps.some((step) => step.nodeId.includes("#run"))).toBe(true)
    expect(cli?.steps.some((step) => step.nodeId.includes("#add"))).toBe(true)
    expect(cli?.evidence).toBe("static")
  })

  test("records sources and sinks from data access", async () => {
    const [scan] = await new RepositoryScanner().scan(root)
    if (scan === null) throw new Error("scan unavailable")
    const [snapshot] = await new TypeScriptAdapter().analyze(root, scan.files)
    if (snapshot === null) throw new Error("analysis unavailable")
    const flows = new FlowAnalyzer().analyze(
      snapshot.elements,
      snapshot.relationships,
      snapshot.entryPoints,
    )
    const save = flows.find((flow) => flow.entryPointId.includes("#save"))
    expect(save).toBeDefined()
    expect(save?.sinks.map((sink) => sink.channel)).toContain("filesystem")
    expect(save?.sinks.map((sink) => sink.channel)).toContain("network")
  })
})
