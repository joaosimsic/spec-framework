import { describe, expect, test } from "bun:test"
import { SnapshotComparator, type SnapshotData } from "../src/analysis/comparison"
import type { IrElement, IrRelationship } from "../src/analysis/ir"

function element(id: string, signature: string): IrElement {
  return {
    id,
    type: "function",
    language: "typescript",
    name: id,
    qualifiedName: id,
    filePath: "src/a.ts",
    startLine: 1,
    endLine: 2,
    parentId: null,
    signature,
    visibility: "public",
    exported: true,
    references: [],
    calls: [],
    imports: [],
    inheritance: [],
    dataAccess: [],
    confidence: "observed",
    provenance: "test",
  }
}

function relationship(id: string): IrRelationship {
  return {
    id,
    sourceId: "SYM-a",
    targetId: "SYM-b",
    type: "calls",
    resolution: "resolved",
    confidence: "observed",
    provenance: "test",
    resolvedBy: "test",
  }
}

function snapshot(id: string): SnapshotData {
  return {
    id,
    commit: id,
    elements: [element("SYM-a", "function a()"), element("SYM-b", "function b()")],
    relationships: [relationship("REL-1")],
    flows: [],
    findings: [],
    entryPoints: [],
    coverage: {
      mapped: ["CMP-A"],
      partial: [],
      unmapped: [],
      unassigned: [],
      stale: [],
      ambiguous: [],
      entry_points_without_sinks: [],
      behavior_without_implementation: [],
      external_systems: [],
    },
  }
}

describe("snapshot comparison", () => {
  test("reports added, removed, and changed elements", () => {
    const before = snapshot("SNAP-1")
    const after = snapshot("SNAP-2")
    after.elements = [
      element("SYM-a", "function a(value: number)"),
      element("SYM-c", "function c()"),
    ]
    after.coverage = {
      mapped: ["CMP-B"],
      partial: [],
      unmapped: [],
      unassigned: [],
      stale: [],
      ambiguous: [],
      entry_points_without_sinks: [],
      behavior_without_implementation: [],
      external_systems: [],
    }
    const comparison = SnapshotComparator.compare(before, after)
    expect(comparison.elements.changed).toContain("SYM-a")
    expect(comparison.elements.added).toContain("SYM-c")
    expect(comparison.elements.removed).toContain("SYM-b")
    expect(comparison.coverage.newlyMapped).toContain("CMP-B")
  })

  test("never mutates the older snapshot", () => {
    const before = snapshot("SNAP-1")
    const original = JSON.stringify(before)
    SnapshotComparator.compare(before, snapshot("SNAP-2"))
    expect(JSON.stringify(before)).toBe(original)
  })
})
