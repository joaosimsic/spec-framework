import { describe, expect, test } from "bun:test"
import { MappingCurationEngine } from "../src/discovery/curation"
import { buildMapReport } from "../src/discovery/report"
import type { DraftElement } from "../src/discovery/types"

function report() {
  const source: DraftElement = {
    id: "CMP-SOURCE",
    kind: "component",
    title: "Source",
    status: "draft",
    provenance: "code:package.json",
    confidence: "observed",
    links: [
      {
        type: "depends_on",
        to: "CMP-TARGET",
        confidence: "inferred",
        provenance: "code:package.json#dependencies",
      },
      {
        type: "uses",
        to: "CMP-TARGET",
        confidence: "inferred",
        provenance: "code:package.json#dependencies",
      },
    ],
  }
  const target: DraftElement = {
    id: "CMP-TARGET",
    kind: "component",
    title: "Target",
    status: "draft",
    provenance: "code:package.json",
    confidence: "observed",
    links: [],
  }

  return buildMapReport([source, target], [], [], [], null)
}

describe("MappingCurationEngine relations", () => {
  test("requires a type when several relations connect the same areas", () => {
    const engine = MappingCurationEngine.start(report())
    const [, error] = engine.apply(
      { kind: "accept-relation", source: "Source", target: "Target" },
      "2026-11-11T12:00:00.000Z",
      "tester",
    )

    expect(error).toContain("ambiguous")
    expect(error).toContain("supply a type")
  })

  test("matches relation types by human phrasing and updates state", () => {
    const engine = MappingCurationEngine.start(report())
    const [action, error] = engine.apply(
      {
        kind: "reject-relation",
        source: "Source",
        target: "Target",
        type: "depends on",
      },
      "2026-11-11T12:00:00.000Z",
      "tester",
    )

    expect(error).toBeNull()
    expect(action).toEqual({
      kind: "reject-relation",
      source: "Source",
      target: "Target",
      type: "depends on",
    })

    const state = engine.state()
    expect(state.relations).toHaveLength(1)
    expect(state.relations[0]).toEqual(
      expect.objectContaining({
        sourceId: "CMP-SOURCE",
        targetId: "CMP-TARGET",
        type: "uses",
        confidence: "inferred",
      }),
    )
    expect(state.summary.rejectedRelations).toBe(1)
  })
})
