import { describe, expect, test } from "bun:test"
import { ForceGraphLinkSanitizer } from "../src/workbench/web/views/graph/force-links"
import type { ForceGraphLink, ForceGraphNode } from "../src/workbench/web/views/graph/force-types"

const nodes: ForceGraphNode[] = [
  { ref: "a", label: "A", kind: "component", kindLabel: "Component", parentRef: null },
  { ref: "b", label: "B", kind: "file", kindLabel: "File", parentRef: "a" },
]

function link(ref: string, sourceRef: string, targetRef: string): ForceGraphLink {
  return { ref, sourceRef, targetRef, label: "calls", type: "calls" }
}

describe("force graph link sanitizer", () => {
  test("drops links with missing endpoints and self links", () => {
    const sanitized = ForceGraphLinkSanitizer.sanitize(nodes, [
      link("valid", "a", "b"),
      link("missing-source", "missing", "b"),
      link("missing-target", "a", "missing"),
      link("self", "a", "a"),
    ])

    expect(sanitized.map((item) => item.ref)).toEqual(["valid"])
  })

  test("deduplicates and sorts deterministically", () => {
    const sanitized = ForceGraphLinkSanitizer.sanitize(nodes, [
      link("z", "a", "b"),
      link("a", "b", "a"),
      link("z", "a", "b"),
    ])

    expect(sanitized.map((item) => item.ref)).toEqual(["a", "z"])
  })
})
