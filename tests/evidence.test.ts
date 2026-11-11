import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  EvidenceCollector,
  EvidenceFactory,
  EvidenceStore,
  type EvidenceDraft,
} from "../src/evidence"

function draft(id = "EVD-TEST-001"): EvidenceDraft {
  return {
    id,
    kind: "test",
    method: "test",
    tool: "bun",
    result: "pass",
    inputs: [],
    command: ["bun", "test"],
  }
}

describe("EvidenceFactory", () => {
  test("creates deterministic hashed records", async () => {
    const factory = new EvidenceFactory()
    const first = factory.create(draft())
    const second = factory.create(draft())

    expect(first).toEqual(second)
    expect(first.hash).toStartWith("sha256:")
    expect(first.input_hash).toStartWith("sha256:")
  })

  test("hashes inputs in a deterministic order", async () => {
    const target = await mkdtemp(join(tmpdir(), "evidence-"))
    try {
      await mkdir(join(target, "spec"), { recursive: true })
      await writeFile(join(target, "spec", "b.txt"), "second")
      await writeFile(join(target, "spec", "a.txt"), "first")
      const factory = new EvidenceFactory()
      const first = await factory.inputs(target, [
        join(target, "spec", "b.txt"),
        join(target, "spec", "a.txt"),
      ])
      const second = await factory.inputs(target, [
        join(target, "spec", "a.txt"),
        join(target, "spec", "b.txt"),
      ])

      expect(first).toEqual(second)
      expect(first.map((input) => input.path)).toEqual(["spec/a.txt", "spec/b.txt"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("EvidenceCollector", () => {
  test("rejects duplicate evidence identifiers", () => {
    const factory = new EvidenceFactory()
    const [records, collectError] = new EvidenceCollector().collect([
      factory.create(draft()),
      factory.create(draft()),
    ])

    expect(records).toBeNull()
    expect(collectError?.code).toBe("EVIDENCE-DUPLICATE-ID")
  })

  test("rejects unsafe evidence identifiers", () => {
    const factory = new EvidenceFactory()
    const [records, collectError] = new EvidenceCollector().collect([
      factory.create(draft("../escape")),
    ])

    expect(records).toBeNull()
    expect(collectError?.code).toBe("EVIDENCE-BAD-RECORD")
  })
})

describe("EvidenceStore", () => {
  test("writes and loads deterministic artifacts", async () => {
    const target = await mkdtemp(join(tmpdir(), "evidence-"))
    try {
      const record = new EvidenceFactory().create(draft())
      const store = new EvidenceStore(target)
      const [written, writeError] = await store.writeAll([record])
      expect(writeError).toBeNull()
      expect(written).toHaveLength(1)
      expect(written?.[0]).toBe(join(target, "spec", "evidence", "EVD-TEST-001.json"))

      const loaded = await store.loadAll()
      expect(loaded.failures).toEqual([])
      expect(loaded.records).toEqual([record])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports tampered artifacts", async () => {
    const target = await mkdtemp(join(tmpdir(), "evidence-"))
    try {
      const record = new EvidenceFactory().create(draft())
      const store = new EvidenceStore(target)
      await store.writeAll([record])
      const path = join(target, "spec", "evidence", "EVD-TEST-001.json")
      const parsed = JSON.parse(await readFile(path, "utf8")) as { result: string }
      parsed.result = "fail"
      await writeFile(path, JSON.stringify(parsed))

      const loaded = await store.loadAll()
      expect(loaded.records).toEqual([])
      expect(loaded.failures[0]?.code).toBe("EVIDENCE-BAD-HASH")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
