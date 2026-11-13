import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GeneratedBundleWriter } from "../src/bundle"
import { GeneratedSpecValidator, GENERATED_SPEC_VERSION, type GeneratedSpec } from "../src/spec"
import type { VerificationRunDetails } from "../src/persistence"

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
      schema_version: 2,
    },
    project: { id: "PROJ-1", name: "sample", root: ".", language: "typescript" },
    architecture: {
      system: {
        id: "SYS-SAMPLE",
        type: "system",
        label: "SYSTEM sample",
        label_role: "SYSTEM",
        label_anchor: "sample",
        label_evidence: ["spec-framework.json#project.name"],
        parent_id: null,
        summary: "Generated system boundary.",
        confidence: "observed",
        status: "observed",
        provenance: "test",
        evidence: ["test"],
        entry_points: [],
        public_surface: [],
        data_access: [],
        tests: [],
        unknowns: [],
      },
      subsystems: [],
      components: [],
      interfaces: [],
      data_stores: [],
      external_systems: [],
      relationships: [],
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
    },
    implementation: { files: [], symbols: [] },
    mappings: [],
    hypotheses: [],
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
  test("accepts the v2 generated contract and rejects approval status", () => {
    const validator = new GeneratedSpecValidator()
    const [validated, validationError] = validator.check(spec())
    expect(validationError).toBeNull()
    expect(validated?.version).toBe(2)

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

  test("rejects labels that are not anchored in behavior evidence", () => {
    const invalid = spec()
    invalid.architecture.system.label = "Sample configuration"
    const [, error] = new GeneratedSpecValidator().check(invalid)
    expect(error).not.toBeNull()

    const missingEvidence = spec()
    missingEvidence.architecture.system.label_evidence = []
    const [, evidenceError] = new GeneratedSpecValidator().check(missingEvidence)
    expect(evidenceError).not.toBeNull()
  })

  test("writes a generated audit bundle", async () => {
    const target = await mkdtemp(join(tmpdir(), "generated-bundle-"))
    const [result, error] = await new GeneratedBundleWriter().write(target, spec())
    expect(error).toBeNull()
    expect(result?.files.some((file) => file.endsWith("spec.gen.json"))).toBe(true)
    expect(await Bun.file(join(result?.path ?? "", "manifest.json")).exists()).toBe(true)
  })

  test("includes the latest verification run in the bundle", async () => {
    const target = await mkdtemp(join(tmpdir(), "generated-bundle-verification-"))
    const verification: VerificationRunDetails = {
      run: {
        id: "VRUN-1",
        projectId: "PROJ-1",
        snapshotId: "SNAP-1",
        specHash: "hash",
        runnerVersion: "bun-test",
        result: "passed",
        errors: 0,
        warnings: 0,
        checkCount: 1,
        passedCount: 1,
        failedCount: 0,
        unknownCount: 0,
        findings: [],
        createdAt: "2026-11-13T00:00:00.000Z",
      },
      results: [
        {
          runId: "VRUN-1",
          checkId: "tests",
          method: "test",
          command: ["bun", "test"],
          workingDirectory: ".",
          result: "passed",
          confidence: "observed",
          exitCode: 0,
          timedOut: false,
          durationMs: 10,
          outputHash: "hash",
          output: "ok",
          inputHashes: ["hash"],
        },
      ],
    }
    const [result, error] = await new GeneratedBundleWriter().write(target, spec(), {
      verification,
    })
    expect(error).toBeNull()
    expect(result?.files.some((file) => file.endsWith("verification.json"))).toBe(true)
    const manifest = JSON.parse(
      await Bun.file(join(result?.path ?? "", "manifest.json")).text(),
    ) as { generated: Record<string, string> }
    expect(manifest.generated["verification.json"]).toBeDefined()
  })
})
