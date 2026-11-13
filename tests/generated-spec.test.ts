import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GeneratedBundleWriter } from "../src/bundle"
import { GeneratedSpecValidator, GENERATED_SPEC_VERSION, type GeneratedSpec } from "../src/spec"

function spec(): GeneratedSpec {
  return {
    version: GENERATED_SPEC_VERSION,
    snapshot: {
      id: "SNAP-1",
      project_id: "PROJ-1",
      commit: "abc123",
      dirty: false,
      analyzer: "typescript",
      analyzer_version: "1",
      schema_version: 1,
    },
    project: { id: "PROJ-1", name: "sample", root: ".", language: "typescript" },
    architecture: {
      elements: [
        {
          id: "SYS-SAMPLE",
          type: "system",
          label: "sample",
          parent_id: null,
          file_path: null,
          start_line: null,
          end_line: null,
          signature: null,
          confidence: "observed",
          status: "observed",
          provenance: "test",
          evidence: [],
        },
      ],
      relationships: [],
      coverage: { mapped: [], partial: [], unmapped: [], unassigned: [], stale: [] },
    },
    requirements: [],
    contracts: [],
    verification: [],
    flows: [],
    findings: [],
    evidence: [],
    unknowns: [],
  }
}

describe("generated spec", () => {
  test("accepts the generated contract and rejects approval status", () => {
    const validator = new GeneratedSpecValidator()
    const [validated, validationError] = validator.check(spec())
    expect(validationError).toBeNull()
    expect(validated?.version).toBe(1)

    const invalid = spec()
    invalid.requirements.push({
      id: "REQ-1",
      kind: "observed_behavior",
      title: "x",
      statement: "x",
      component: null,
      entry_point: null,
      evidence: [],
      confidence: "observed",
      status: "approved" as never,
      unknowns: [],
    })
    const [, error] = validator.check(invalid)
    expect(error).not.toBeNull()
  })

  test("writes a generated audit bundle", async () => {
    const target = await mkdtemp(join(tmpdir(), "generated-bundle-"))
    const [result, error] = await new GeneratedBundleWriter().write(target, spec())
    expect(error).toBeNull()
    expect(result?.files.some((file) => file.endsWith("spec.gen.json"))).toBe(true)
    expect(await Bun.file(join(result?.path ?? "", "manifest.json")).exists()).toBe(true)
  })
})
