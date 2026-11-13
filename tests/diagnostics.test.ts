import { describe, expect, test } from "bun:test"
import { DiagnosticsEngine } from "../src/diagnostics/engine"
import { DEFAULT_DIAGNOSTICS } from "../src/diagnostics/config"
import type { IrElement, IrRelationship } from "../src/analysis/ir"

function element(filePath: string, name: string, type: IrElement["type"] = "function"): IrElement {
  return {
    id: type === "module" ? `FILE-${filePath}` : `SYM-${filePath}#${name}`,
    type,
    language: "typescript",
    name,
    qualifiedName: name,
    filePath,
    startLine: 1,
    endLine: type === "module" ? 10 : 2,
    parentId: type === "module" ? null : `FILE-${filePath}`,
    signature: name,
    visibility: type === "module" ? "internal" : "public",
    exported: false,
    references: [],
    calls: [],
    imports: [],
    inheritance: [],
    dataAccess: [],
    confidence: "observed",
    provenance: "test",
  }
}

function relationship(
  sourceId: string,
  targetId: string,
  type: IrRelationship["type"],
): IrRelationship {
  return {
    id: `REL-${sourceId}-${type}-${targetId}`,
    sourceId,
    targetId,
    type,
    resolution: "resolved",
    confidence: "observed",
    provenance: "test",
    resolvedBy: "test",
  }
}

describe("architectural diagnostics", () => {
  test("detects a circular dependency", () => {
    const elements = [
      element("src/a.ts", "src/a.ts", "module"),
      element("src/b.ts", "src/b.ts", "module"),
    ]
    const findings = new DiagnosticsEngine().run({
      elements,
      relationships: [
        relationship("FILE-src/a.ts", "FILE-src/b.ts", "imports"),
        relationship("FILE-src/b.ts", "FILE-src/a.ts", "imports"),
      ],
      entryPoints: [],
      coverage: { mapped: [], partial: [], unmapped: [], unassigned: [], stale: [] },
    })
    expect(findings.some((finding) => finding.ruleId === "ARC-001")).toBe(true)
  })

  test("respects thresholds and boundary configuration", () => {
    const elements = [
      element("src/adapters/a.ts", "a", "module"),
      element("src/workbench/b.ts", "b", "module"),
    ]
    const findings = new DiagnosticsEngine().run({
      elements,
      relationships: [relationship("FILE-src/adapters/a.ts", "FILE-src/workbench/b.ts", "imports")],
      entryPoints: [],
      coverage: { mapped: [], partial: [], unmapped: ["CMP-UNMAPPED"], unassigned: [], stale: [] },
      config: {
        ...DEFAULT_DIAGNOSTICS,
        boundaries: [{ from: "src/adapters/**", forbid: ["src/workbench/**"] }],
      },
    })
    expect(findings.some((finding) => finding.ruleId === "ARC-008")).toBe(true)
    expect(findings.some((finding) => finding.ruleId === "ARC-012")).toBe(true)
  })

  test("does not flag member declarations as unused code", () => {
    const member = element("src/a.ts", "value", "property")
    const findings = new DiagnosticsEngine().run({
      elements: [element("src/a.ts", "src/a.ts", "module"), member],
      relationships: [],
      entryPoints: [],
      coverage: { mapped: [], partial: [], unmapped: [], unassigned: [], stale: [] },
    })
    expect(findings.some((finding) => finding.ruleId === "ARC-007")).toBe(false)
  })

  test("does not emit AI-assisted rules deterministically", () => {
    const findings = new DiagnosticsEngine().run({
      elements: [element("src/a.ts", "a")],
      relationships: [],
      entryPoints: [],
      coverage: { mapped: [], partial: [], unmapped: [], unassigned: [], stale: [] },
    })
    expect(findings.every((finding) => finding.family === "deterministic")).toBe(true)
  })
})
