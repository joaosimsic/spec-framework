import { describe, expect, test } from "bun:test"
import { cp, mkdtemp, rename, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConceptualArchitectureBuilder } from "../src/architecture"
import { TypeScriptAdapter } from "../src/analysis/adapters/typescript"
import { RepositoryScanner } from "../src/analysis/scanner"
import { FlowAnalyzer } from "../src/flows/analyzer"

const fixture = join(import.meta.dir, "fixtures", "repositories", "typescript-basic")

async function analyze(root: string, projectName = "typescript-basic") {
  const [scan, scanError] = await new RepositoryScanner().scan(root)
  expect(scanError).toBeNull()
  if (scan === null) throw new Error("scan unavailable")
  const [snapshot, snapshotError] = await new TypeScriptAdapter().analyze(root, scan.files)
  expect(snapshotError).toBeNull()
  if (snapshot === null) throw new Error("analysis unavailable")
  const flows = new FlowAnalyzer().analyze(
    snapshot.elements,
    snapshot.relationships,
    snapshot.entryPoints,
  )

  return new ConceptualArchitectureBuilder().build({
    projectName,
    root,
    elements: snapshot.elements,
    relationships: snapshot.relationships,
    entryPoints: snapshot.entryPoints,
    flows,
  })
}

describe("behavior-derived conceptual architecture", () => {
  test("labels components from behavior anchors, never paths", async () => {
    const architecture = await analyze(fixture)
    const labels = architecture.architecture.components.map((component) => component.label).sort()
    expect(labels).toContain("HTTP /health")
    expect(labels).toContain("CLI basic")
    expect(labels).toContain("API typescript-basic")
    expect(labels).toContain("APP typescript-basic")
    for (const component of architecture.architecture.components) {
      expect(component.label).toBe(`${component.label_role} ${component.label_anchor}`)
      expect(component.label_evidence.length).toBeGreaterThan(0)
      expect(component.label).not.toContain("src/")
      expect(component.label).not.toContain("bin/")
      expect(component.provenance).not.toContain("directory")
    }
    expect(
      architecture.architecture.components.every(
        (component) => component.parent_id !== null && component.parent_id.startsWith("SUB-"),
      ),
    ).toBe(true)
  })

  test("does not name conceptual elements after directories", async () => {
    const root = join(import.meta.dir, "fixtures", "repositories", "bad-directory-names")
    const architecture = await analyze(root, "bad-directory-names")
    const labels = architecture.architecture.components.map((component) => component.label).sort()
    expect(labels).toContain("API bad-directory-names")
    expect(labels).toContain("HTTP /status")
    expect(labels.some((label) => label.includes("nondescript"))).toBe(false)
    expect(labels.some((label) => label.includes("random"))).toBe(false)
  })

  test("keeps implementation out of the conceptual graph and emits mappings", async () => {
    const architecture = await analyze(fixture)
    const elements = [
      architecture.architecture.system,
      ...architecture.architecture.subsystems,
      ...architecture.architecture.components,
      ...architecture.architecture.interfaces,
      ...architecture.architecture.data_stores,
      ...architecture.architecture.external_systems,
    ]
    expect(elements.some((element) => ["file", "symbol", "module"].includes(element.type))).toBe(
      false,
    )
    expect(architecture.implementation.files.length).toBeGreaterThan(0)
    expect(architecture.mappings.length).toBeGreaterThan(0)
    expect(architecture.architecture.coverage.unassigned.length).toBeLessThanOrEqual(
      architecture.implementation.files.length,
    )
    expect(architecture.architecture.coverage.entry_points_without_sinks.length).toBeGreaterThan(0)
  })

  test("keeps conceptual identity and labels stable across directory renames", async () => {
    const first = await analyze(fixture)
    const target = await mkdtemp(join(tmpdir(), "conceptual-rename-"))
    await cp(fixture, target, { recursive: true })
    await rename(join(target, "src", "math.ts"), join(target, "src", "renamed.ts"))
    await writeFile(
      join(target, "src", "service.ts"),
      'import { add } from "./renamed"\n\nexport function run(): number {\n  return add(1, 2)\n}\n',
    )
    const second = await analyze(target)
    const firstComponents = first.architecture.components
      .map((component) => `${component.id}:${component.label}`)
      .sort()
    const secondComponents = second.architecture.components
      .map((component) => `${component.id}:${component.label}`)
      .sort()

    expect(secondComponents).toEqual(firstComponents)
    expect(
      second.mappings.some((mapping) => mapping.implementation_id === "FILE-src/renamed.ts"),
    ).toBe(true)
  }, 30000)
})
