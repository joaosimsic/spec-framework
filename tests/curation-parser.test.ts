import { describe, expect, test } from "bun:test"
import { CurationParser } from "../src/discovery/curation-parser"

describe("CurationParser", () => {
  test("parses area actions and metadata", () => {
    const [actions, error] = CurationParser.parseJson(
      JSON.stringify([
        { kind: "accept", target: "core" },
        { kind: "set-owner", target: "core", owner: "platform" },
        { kind: "open-question", question: "Who owns rollout?", blocking: true },
      ]),
    )

    expect(error).toBeNull()
    expect(actions).toEqual([
      { kind: "accept", target: "core" },
      { kind: "set-owner", target: "core", owner: "platform" },
      { kind: "open-question", question: "Who owns rollout?", blocking: true },
    ])
  })

  test("parses relation actions with optional types", () => {
    const [actions, error] = CurationParser.parseJson(
      JSON.stringify([
        { kind: "accept-relation", source: "Application", target: "database" },
        {
          kind: "reject-relation",
          source: "Application",
          target: "database",
          type: "depends_on",
        },
      ]),
    )

    expect(error).toBeNull()
    expect(actions).toEqual([
      { kind: "accept-relation", source: "Application", target: "database" },
      {
        kind: "reject-relation",
        source: "Application",
        target: "database",
        type: "depends_on",
      },
    ])
  })

  test("rejects incomplete relation actions", () => {
    const [, sourceError] = CurationParser.parse({
      kind: "accept-relation",
      target: "database",
    })
    expect(sourceError).toContain("requires a source")

    const [, targetError] = CurationParser.parse({
      kind: "reject-relation",
      source: "Application",
    })
    expect(targetError).toContain("requires a target")

    const [, typeError] = CurationParser.parse({
      kind: "accept-relation",
      source: "Application",
      target: "database",
      type: " ",
    })
    expect(typeError).toContain("type must be a non-empty string")
  })

  test("requires unique merge targets and split parts", () => {
    const [, mergeError] = CurationParser.parse({
      kind: "merge",
      targets: ["core", "core"],
      title: "runtime",
    })
    expect(mergeError).toContain("merge requires")

    const [, splitError] = CurationParser.parse({
      kind: "split",
      target: "runtime",
      parts: ["engine", "engine"],
    })
    expect(splitError).toContain("split requires")
  })

  test("rejects unknown action kinds and blank values", () => {
    const [, unknownError] = CurationParser.parse({ kind: "approve", target: "core" })
    expect(unknownError).toContain("unknown action kind")

    const [, blankError] = CurationParser.parse({ kind: "rename", target: "core", title: " " })
    expect(blankError).toContain("rename requires a title")
  })

  test("reads stored decisions", () => {
    const [decisions, error] = CurationParser.parseDecisions([
      {
        at: "2026-11-11T12:00:00.000Z",
        action: { kind: "reject", target: "legacy" },
      },
    ])

    expect(error).toBeNull()
    expect(decisions).toEqual([
      {
        at: "2026-11-11T12:00:00.000Z",
        action: { kind: "reject", target: "legacy" },
      },
    ])
  })
})
