import { describe, expect, test } from "bun:test"
import { DiagnosticsEngine } from "../src/diagnostics/engine"
import { DEFAULT_DIAGNOSTICS } from "../src/diagnostics/config"
import type { IrElement, IrRelationship } from "../src/analysis/ir"
import type { GeneratedConceptualElement } from "../src/spec"

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

function component(
  id: string,
  overrides: Partial<GeneratedConceptualElement> = {},
): GeneratedConceptualElement {
  return {
    id,
    type: "component",
    label: "HTTP /orders",
    label_role: "HTTP",
    label_anchor: "/orders",
    label_evidence: ["http:/orders"],
    parent_id: null,
    summary: "Observed entry points: GET /orders.",
    confidence: "observed",
    status: "observed",
    provenance: "test",
    evidence: ["ENTRY-http-GET-/orders"],
    entry_points: ["ENTRY-http-GET-/orders"],
    public_surface: [],
    data_access: [],
    tests: [],
    unknowns: [],
    ...overrides,
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
      coverage: {
        mapped: [],
        partial: [],
        unmapped: [],
        unassigned: [],
        stale: [],
        ambiguous: [],
        entry_points_without_sinks: [],
        behavior_without_implementation: [],
        external_systems: [],
      },
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
      coverage: {
        mapped: [],
        partial: [],
        unmapped: ["CMP-UNMAPPED"],
        unassigned: [],
        stale: [],
        ambiguous: [],
        entry_points_without_sinks: [],
        behavior_without_implementation: [],
        external_systems: [],
      },
      config: {
        ...DEFAULT_DIAGNOSTICS,
        boundaries: [{ from: "src/adapters/**", forbid: ["src/workbench/**"] }],
      },
    })
    expect(findings.some((finding) => finding.ruleId === "ARC-008")).toBe(true)
    const ownership = findings.find((finding) => finding.ruleId === "ARC-012")
    expect(ownership).not.toBeUndefined()
    expect(ownership?.evidence[0]?.file).toBe("spec/generated/spec.gen.json")
    expect(ownership?.recommendation).not.toContain("mapping selector")
  })

  test("flags behavior-bearing components without test evidence", () => {
    const findings = new DiagnosticsEngine().run({
      elements: [],
      relationships: [],
      entryPoints: [],
      coverage: {
        mapped: ["CMP-UNTESTED", "CMP-TESTED", "CMP-NO-BEHAVIOR"],
        partial: [],
        unmapped: [],
        unassigned: [],
        stale: [],
        ambiguous: [],
        entry_points_without_sinks: [],
        behavior_without_implementation: [],
        external_systems: [],
      },
      components: [
        component("CMP-UNTESTED"),
        component("CMP-TESTED", { tests: ["tests/orders.test.ts"] }),
        component("CMP-NO-BEHAVIOR", { entry_points: [], public_surface: [] }),
      ],
    })
    const missing = findings.filter((finding) => finding.ruleId === "ARC-011")
    expect(missing).toHaveLength(1)
    expect(missing[0]?.affectedElements).toEqual(["CMP-UNTESTED"])
    expect(missing[0]?.evidence[0]?.file).toBe("spec/generated/spec.gen.json")
  })

  test("does not flag member declarations as unused code", () => {
    const member = element("src/a.ts", "value", "property")
    const findings = new DiagnosticsEngine().run({
      elements: [element("src/a.ts", "src/a.ts", "module"), member],
      relationships: [],
      entryPoints: [],
      coverage: {
        mapped: [],
        partial: [],
        unmapped: [],
        unassigned: [],
        stale: [],
        ambiguous: [],
        entry_points_without_sinks: [],
        behavior_without_implementation: [],
        external_systems: [],
      },
    })
    expect(findings.some((finding) => finding.ruleId === "ARC-007")).toBe(false)
  })

  test("does not emit AI-assisted rules deterministically", () => {
    const findings = new DiagnosticsEngine().run({
      elements: [element("src/a.ts", "a")],
      relationships: [],
      entryPoints: [],
      coverage: {
        mapped: [],
        partial: [],
        unmapped: [],
        unassigned: [],
        stale: [],
        ambiguous: [],
        entry_points_without_sinks: [],
        behavior_without_implementation: [],
        external_systems: [],
      },
    })
    expect(findings.every((finding) => finding.family === "deterministic")).toBe(true)
  })
})
