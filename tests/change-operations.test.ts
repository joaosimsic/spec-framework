import { describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SdocOperationApplier } from "../src/change/operations"
import { ProposalOperationParser } from "../src/change/operation-parser"
import type { ProposalOperation } from "../src/change/types"

const requirementSource = `[DOCUMENT]
TITLE: Sample requirements

[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Approved
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test
PRIORITY: high

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Approved
STATEMENT: Given a request, the component returns a result.
PROVENANCE: human:test@2026-11-11
OWNER: test

[REQUIREMENT]
UID: REQ-SAMPLE-002
TITLE: Second behavior
STATUS: Draft
STATEMENT: The sample component shall return another result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test
`

function fixedNow(): Date {
  return new Date("2026-11-11T12:00:00.000Z")
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "change-operations-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), requirementSource)

  return target
}

async function apply(
  target: string,
  operations: ProposalOperation[],
): Promise<Awaited<ReturnType<SdocOperationApplier["apply"]>>> {
  return new SdocOperationApplier(target, fixedNow).apply(operations)
}

describe("ProposalOperationParser", () => {
  test("parses a typed rename and rejects unknown kinds", () => {
    const [operations, error] = ProposalOperationParser.parseList([
      { kind: "rename", target: "REQ-SAMPLE-001", title: "New title" },
    ])

    expect(error).toBeNull()
    expect(operations).toEqual([{ kind: "rename", target: "REQ-SAMPLE-001", title: "New title" }])

    const [invalid, invalidError] = ProposalOperationParser.parseList({ kind: "delete" })
    expect(invalid).toBeNull()
    expect(invalidError).toContain("unknown operation kind")
  })

  test("parses decision and open-question operations", () => {
    const [operations, error] = ProposalOperationParser.parseList([
      {
        kind: "record-decision",
        title: "Use session tokens",
        statement: "Use short-lived session tokens for refresh.",
        target: "REQ-SAMPLE-001",
      },
      {
        kind: "record-open-question",
        question: "What happens when the token store is down?",
      },
    ])

    expect(error).toBeNull()
    expect(operations).toEqual([
      {
        kind: "record-decision",
        title: "Use session tokens",
        statement: "Use short-lived session tokens for refresh.",
        target: "REQ-SAMPLE-001",
      },
      {
        kind: "record-open-question",
        question: "What happens when the token store is down?",
      },
    ])
  })

  test("parses add-record and allows generated IDs", () => {
    const [operations, error] = ProposalOperationParser.parseList([
      {
        kind: "add-record",
        recordKind: "requirement",
        record: { TITLE: "New behavior", STATEMENT: "The component shall respond." },
      },
      {
        kind: "replace",
        target: "REQ-SAMPLE-001",
        replacement: { TITLE: "Replacement behavior" },
      },
    ])

    expect(error).toBeNull()
    expect(operations?.[0]).toMatchObject({ kind: "add-record", recordKind: "requirement" })
    expect(operations?.[1]).toMatchObject({ kind: "replace", target: "REQ-SAMPLE-001" })

    const [invalid, invalidError] = ProposalOperationParser.parseList({
      kind: "add-record",
      recordKind: "unknown-kind",
      record: { TITLE: "Bad" },
    })
    expect(invalid).toBeNull()
    expect(invalidError).toContain("not supported")
  })
})

describe("SdocOperationApplier", () => {
  test("adds records with generated IDs and links acceptance criteria", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "add-record",
          recordKind: "requirement",
          record: {
            TITLE: "Login behavior",
            STATUS: "Draft",
            STATEMENT: "The component shall accept a valid login.",
          },
        },
        {
          kind: "add-record",
          recordKind: "acceptance_criterion",
          record: {
            TITLE: "Valid login succeeds",
            STATUS: "Draft",
            STATEMENT: "Given a valid login, the component returns success.",
          },
          acceptanceOf: "REQ-LOGIN-BEHAVIOR",
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes.map((change) => [change.id, change.action])).toEqual([
        ["AC-VALID-LOGIN-SUCCEEDS", "added"],
        ["REQ-LOGIN-BEHAVIOR", "modified"],
      ])

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("UID: REQ-LOGIN-BEHAVIOR")
      expect(text).toContain("UID: AC-VALID-LOGIN-SUCCEEDS")
      expect(text).toContain("ACCEPTANCE: AC-VALID-LOGIN-SUCCEEDS")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("generates IDs for split parts and merge results", async () => {
    const target = await createTarget()
    try {
      const [split, splitError] = await apply(target, [
        {
          kind: "split",
          target: "REQ-SAMPLE-001",
          parts: [
            { TITLE: "First part", STATEMENT: "The component shall return the first result." },
            { TITLE: "Second part", STATEMENT: "The component shall return the second result." },
          ],
        },
      ])
      expect(splitError).toBeNull()
      expect(split?.changes.map((change) => change.id)).toContain("REQ-FIRST-PART")
      expect(split?.changes.map((change) => change.id)).toContain("REQ-SECOND-PART")

      const [merged, mergeError] = await apply(target, [
        {
          kind: "merge",
          targets: ["REQ-SAMPLE-002", "REQ-FIRST-PART"],
          result: { TITLE: "Combined behavior", STATEMENT: "The component shall respond." },
        },
      ])
      expect(mergeError).toBeNull()
      expect(merged?.changes.map((change) => change.id)).toContain("REQ-COMBINED-BEHAVIOR")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("generates unique IDs for repeated visible names", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "add-record",
          recordKind: "requirement",
          record: { TITLE: "Duplicate behavior", STATEMENT: "The component shall respond." },
        },
        {
          kind: "add-record",
          recordKind: "requirement",
          record: { TITLE: "Duplicate behavior", STATEMENT: "The component shall respond again." },
        },
        {
          kind: "replace",
          target: "REQ-SAMPLE-001",
          replacement: {
            TITLE: "Replacement behavior",
            STATEMENT: "The component shall return a replacement result.",
          },
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes.map((change) => change.id)).toContain("REQ-DUPLICATE-BEHAVIOR")
      expect(applied?.changes.map((change) => change.id)).toContain("REQ-DUPLICATE-BEHAVIOR-2")
      expect(applied?.changes.map((change) => change.id)).toContain("REQ-REPLACEMENT-BEHAVIOR")

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("REPLACES: REQ-SAMPLE-001")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("renames an approved element without changing its id", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        { kind: "rename", target: "REQ-SAMPLE-001", title: "Renamed behavior" },
      ])

      expect(error).toBeNull()
      expect(applied?.changes).toEqual([
        expect.objectContaining({
          id: "REQ-SAMPLE-001",
          action: "modified",
          previous_title: "Sample behavior",
          title: "Renamed behavior",
          previous_status: "Approved",
          status: "Proposed",
        }),
      ])
      expect(applied?.logs[0]?.before_hashes["REQ-SAMPLE-001"]).not.toBeNull()

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("UID: REQ-SAMPLE-001")
      expect(text).toContain("TITLE: Renamed behavior")
      expect(text).toContain("STATUS: Proposed")
      expect(text).toContain("PRIORITY: high")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("replaces an element and records the replaces link", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "replace",
          target: "REQ-SAMPLE-001",
          replacement: {
            UID: "REQ-SAMPLE-003",
            TITLE: "Replacement behavior",
            STATUS: "Draft",
            STATEMENT: "The sample component shall return a replacement result.",
            ACCEPTANCE: "AC-SAMPLE-001",
            COMPONENT: "CMP-SAMPLE",
            FORMAL: "PROP-SAMPLE-001",
            PROVENANCE: "human:test@2026-11-11",
            OWNER: "test",
          },
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes.map((change) => [change.id, change.action])).toEqual([
        ["REQ-SAMPLE-001", "deprecated"],
        ["REQ-SAMPLE-003", "added"],
      ])

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("STATUS: Deprecated")
      expect(text).toContain("UID: REQ-SAMPLE-003")
      expect(text).toContain("REPLACES: REQ-SAMPLE-001")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("splits one element into parts", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "split",
          target: "REQ-SAMPLE-001",
          parts: [
            {
              UID: "REQ-SAMPLE-004",
              TITLE: "First part",
              STATUS: "Proposed",
              STATEMENT: "The sample component shall return the first result.",
              ACCEPTANCE: "AC-SAMPLE-001",
              COMPONENT: "CMP-SAMPLE",
              FORMAL: "PROP-SAMPLE-001",
              PROVENANCE: "human:test@2026-11-11",
              OWNER: "test",
            },
            {
              UID: "REQ-SAMPLE-005",
              TITLE: "Second part",
              STATUS: "Proposed",
              STATEMENT: "The sample component shall return the second result.",
              ACCEPTANCE: "AC-SAMPLE-001",
              COMPONENT: "CMP-SAMPLE",
              FORMAL: "PROP-SAMPLE-001",
              PROVENANCE: "human:test@2026-11-11",
              OWNER: "test",
            },
          ],
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes).toHaveLength(3)

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("[REQUIREMENT]\nUID: REQ-SAMPLE-004")
      expect(text).toContain("[REQUIREMENT]\nUID: REQ-SAMPLE-005")
      expect(text).toContain("REPLACES: REQ-SAMPLE-001")
      expect(text.match(/UID: REQ-SAMPLE-00[45]/g)).toHaveLength(2)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("merges two elements into one", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "merge",
          targets: ["REQ-SAMPLE-001", "REQ-SAMPLE-002"],
          result: {
            UID: "REQ-SAMPLE-006",
            TITLE: "Merged behavior",
            STATUS: "Proposed",
            STATEMENT: "The sample component shall return a merged result.",
            ACCEPTANCE: "AC-SAMPLE-001",
            COMPONENT: "CMP-SAMPLE",
            FORMAL: "PROP-SAMPLE-001",
            PROVENANCE: "human:test@2026-11-11",
            OWNER: "test",
          },
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes.map((change) => [change.id, change.action])).toEqual([
        ["REQ-SAMPLE-001", "deprecated"],
        ["REQ-SAMPLE-002", "deprecated"],
        ["REQ-SAMPLE-006", "added"],
      ])

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("REPLACES: REQ-SAMPLE-001 REQ-SAMPLE-002")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("records a decision and links it to its subject", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "record-decision",
          title: "Use short-lived session tokens",
          statement: "Use short-lived session tokens for refresh.",
          target: "REQ-SAMPLE-001",
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes).toEqual([
        expect.objectContaining({
          id: "DEC-USE-SHORT-LIVED-SESSION-TOKENS",
          action: "added",
          kind: "decision",
          status: "Proposed",
        }),
      ])

      const text = await readFile(join(target, "spec", "requirements", "decisions.sdoc"), "utf8")
      expect(text).toContain("[GRAMMAR]")
      expect(text).toContain("UID: DEC-USE-SHORT-LIVED-SESSION-TOKENS")
      expect(text).toContain("STATUS: Proposed")
      expect(text).toContain("DECIDES: REQ-SAMPLE-001")
      expect(text).toContain("PROVENANCE: human:proposal")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("records an open question", async () => {
    const target = await createTarget()
    try {
      const [applied, error] = await apply(target, [
        {
          kind: "record-open-question",
          question: "What happens when the token store is down?",
          target: "REQ-SAMPLE-001",
        },
      ])

      expect(error).toBeNull()
      expect(applied?.changes[0]?.kind).toBe("unknown")

      const text = await readFile(join(target, "spec", "requirements", "decisions.sdoc"), "utf8")
      expect(text).toContain("UID: UNK-WHAT-HAPPENS-WHEN-THE-TOKEN-STORE-IS-DOWN")
      expect(text).toContain("STATUS: Draft")
      expect(text).toContain("QUESTIONS: REQ-SAMPLE-001")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a decision that targets an unknown item", async () => {
    const target = await createTarget()
    try {
      const [, error] = await apply(target, [
        {
          kind: "record-decision",
          title: "Bad decision",
          statement: "Record a bad decision.",
          target: "REQ-MISSING",
        },
      ])

      expect(error).toContain("unknown element")
      const [file] = await Promise.all([
        Bun.file(join(target, "spec", "requirements", "decisions.sdoc")).exists(),
      ])
      expect(file).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("does not write when a later operation is invalid", async () => {
    const target = await createTarget()
    try {
      const [, error] = await apply(target, [
        { kind: "rename", target: "REQ-SAMPLE-001", title: "Changed" },
        { kind: "rename", target: "REQ-MISSING", title: "Missing" },
      ])

      expect(error).toContain("unknown element")
      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toBe(requirementSource)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
