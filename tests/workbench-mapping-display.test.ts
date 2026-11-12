import { describe, expect, test } from "bun:test"
import type { Proposal } from "../src/change/types"
import type { MapReport } from "../src/discovery/types"
import type { MappingCurationState } from "../src/discovery/curation-types"
import { WorkbenchMappingDisplay } from "../src/workbench/mapping-display"
import type { WorkbenchMappingState } from "../src/workbench/state"

const map: MapReport = {
  version: 1,
  draftPath: null,
  elements: [
    {
      id: "CMP-APP",
      kind: "component",
      title: "app",
      status: "draft",
      provenance: "code:package.json",
      confidence: "observed",
      links: [
        {
          type: "depends_on",
          to: "DAT-SQLITE3",
          confidence: "inferred",
          provenance: "code:package.json#dependencies",
        },
      ],
    },
    {
      id: "DAT-SQLITE3",
      kind: "data_store",
      title: "sqlite3",
      status: "draft",
      provenance: "code:package.json#dependencies",
      confidence: "inferred",
      links: [],
    },
  ],
  summary: {
    elements: 2,
    relations: 1,
    observed: 1,
    inferred: 1,
    ambiguous: 0,
    unknown: 0,
  },
  gaps: {
    missingOwners: ["CMP-APP", "DAT-SQLITE3"],
    missingResponsibilities: ["CMP-APP", "DAT-SQLITE3"],
    externalDependencies: [],
    unresolvedRequirementLinks: [],
  },
  findings: [],
}

const curation: MappingCurationState = {
  areas: map.elements,
  relations: [
    {
      sourceId: "CMP-APP",
      targetId: "DAT-SQLITE3",
      type: "depends_on",
      confidence: "inferred",
      provenance: "code:package.json#dependencies",
    },
  ],
  resolvedIds: [],
  decisions: [],
  questions: [],
  summary: {
    accepted: 0,
    rejected: 0,
    acceptedRelations: 0,
    rejectedRelations: 0,
    renamed: 0,
    merged: 0,
    split: 0,
    questions: 0,
  },
}

const proposal: Proposal = {
  version: 1,
  id: "prop-review-sample-mapping",
  direction: "Review sample mapping",
  mode: "mapping",
  status: "proposed",
  branch: "spec/review-sample-mapping",
  base_commit: "base123",
  baseline: { commit: "base123", lock_hash: null },
  author: "tester",
  created_at: "2026-11-11T12:00:00.000Z",
  operations: [],
}

const mapping: WorkbenchMappingState = {
  proposal,
  snapshot: { version: 1, map, decisions: [] },
  curation,
}

describe("WorkbenchMappingDisplay", () => {
  test("exposes relation endpoints as names and opaque refs", () => {
    const view = new WorkbenchMappingDisplay(mapping).view()
    const relation = view.relations[0]

    expect(relation?.sourceRef).toStartWith("area_")
    expect(relation?.targetRef).toStartWith("area_")
    expect(relation?.label).toBe("app to sqlite3 (depends on)")
    expect(JSON.stringify(view)).not.toMatch(/\b(?:CMP|DAT)-/)
  })

  test("resolves relation decisions from the exposed refs", () => {
    const display = new WorkbenchMappingDisplay(mapping)
    const relation = display.view().relations[0]
    const [actions, failure] = display.resolve([
      {
        kind: "accept-relation",
        source: relation?.sourceRef ?? "",
        target: relation?.targetRef ?? "",
        type: relation?.type,
      },
    ])

    expect(failure).toBeNull()
    expect(actions).toEqual([
      {
        kind: "accept-relation",
        source: "CMP-APP",
        target: "DAT-SQLITE3",
        type: "depends_on",
      },
    ])
  })
})
