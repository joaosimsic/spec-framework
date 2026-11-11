import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runApproval } from "../src/approval/approve"
import type { ApprovalConfirmation } from "../src/approval/confirmation"
import type { GitStatusReader } from "../src/approval/git"
import { specLockPath } from "../src/approval/lock"
import type { NativeAdapter } from "../src/adapters/types"
import { runCheck } from "../src/core/check"
import type { Result } from "../src/core/result"
import { EvidenceFactory, type EvidenceRecord } from "../src/evidence"

const requirement = `[DOCUMENT]
TITLE: Sample requirements

[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Proposed
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Proposed
STATEMENT: Given a request, the component returns a result.
FORMAL: PROP-SAMPLE-001
EVIDENCE: EVD-SAMPLE-001
PROVENANCE: human:test@2026-11-11
OWNER: test
`

class AcceptingConfirmation implements ApprovalConfirmation {
  async confirm(): Promise<boolean> {
    return true
  }
}

class CleanGitStatus implements GitStatusReader {
  async read(target: string): Promise<Result<boolean, string>> {
    void target

    return [true, null]
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "approval-check-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), requirement)

  return target
}

async function approveSample(target: string, evidence: EvidenceRecord[] = []): Promise<void> {
  const run = await runApproval(target, ["REQ-SAMPLE-001", "AC-SAMPLE-001"], {
    approver: "tester",
    confirmation: new AcceptingConfirmation(),
    gitStatus: new CleanGitStatus(),
    evidence,
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  })
  expect(run.code).toBe(0)
}

function evidenceRecord(result: "pass" | "fail"): EvidenceRecord {
  return new EvidenceFactory().create({
    id: "EVD-SAMPLE-001",
    kind: "sample",
    method: "test",
    tool: "bun",
    result,
    inputs: [],
    command: ["bun", "test"],
  })
}

function fixedEvidenceAdapter(evidence: EvidenceRecord[]): NativeAdapter {
  return {
    id: "likec4",
    tool: "evidence-test",
    requiredTools: [],
    async run() {
      return { ran: true, diagnostics: [], evidence }
    },
  }
}

function inactiveAdapter(id: string): NativeAdapter {
  return {
    id,
    tool: id,
    requiredTools: [],
    async run() {
      return { ran: false, diagnostics: [] }
    },
  }
}

async function writeCheckConfig(target: string): Promise<void> {
  await writeFile(
    join(target, "spec", "config.json"),
    JSON.stringify({
      version: 1,
      profile: "full",
      project: { name: "sample", adoption: "existing" },
      adapters: { architecture: "likec4" },
      approval: { mode: "hash-lock", humanOnly: true },
    }),
  )
}

async function runEvidenceCheck(target: string, evidence: EvidenceRecord[]) {
  return runCheck(target, {
    architectureAdapter: fixedEvidenceAdapter(evidence),
    requirementsAdapter: inactiveAdapter("strictdoc"),
    formalAdapter: inactiveAdapter("quint"),
    contractAdapters: [],
  })
}

describe("runCheck approval lock verification", () => {
  test("passes when the lock matches current content", async () => {
    const target = await createTarget()
    try {
      await approveSample(target)
      const run = await runCheck(target, { structural: true })

      expect(run.code).toBe(0)
      expect(run.result.diagnostics).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a content hash mismatch", async () => {
    const target = await createTarget()
    try {
      await approveSample(target)
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        (await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")).replace(
          "STATEMENT: The sample component shall return a result.",
          "STATEMENT: The sample component shall return a changed result.",
        ),
      )

      const run = await runCheck(target, { structural: true })
      expect(run.code).toBe(1)
      expect(run.result.diagnostics.some((item) => item.code === "APPROVAL-HASH-MISMATCH")).toBe(
        true,
      )
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports approved status without a lock entry", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        (await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")).replace(
          /STATUS: Proposed/g,
          "STATUS: Approved",
        ),
      )

      const run = await runCheck(target, { structural: true })
      expect(run.code).toBe(1)
      expect(run.result.diagnostics.some((item) => item.code === "APPROVAL-UNLOCKED")).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports locked elements that no longer exist", async () => {
    const target = await createTarget()
    try {
      await approveSample(target)
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        requirement.replace("REQ-SAMPLE-001", "REQ-SAMPLE-002").replace(
          "AC-SAMPLE-001",
          "AC-SAMPLE-002",
        ),
      )

      const run = await runCheck(target, { structural: true })
      expect(run.code).toBe(1)
      expect(run.result.diagnostics.some((item) => item.code === "APPROVAL-MISSING-ELEMENT")).toBe(
        true,
      )
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports an approved requirement with an unlocked acceptance criterion", async () => {
    const target = await createTarget()
    try {
      await approveSample(target)
      const lock = JSON.parse(await readFile(specLockPath(target), "utf8")) as {
        elements: Record<string, unknown>
      }
      delete lock.elements["AC-SAMPLE-001"]
      await writeFile(specLockPath(target), JSON.stringify(lock))

      const run = await runCheck(target, { structural: true })
      expect(run.code).toBe(1)
      expect(run.result.diagnostics.some((item) => item.code === "APPROVAL-MISSING-AC")).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a malformed lock", async () => {
    const target = await createTarget()
    try {
      await writeFile(specLockPath(target), "{")

      const run = await runCheck(target, { structural: true })
      expect(run.code).toBe(1)
      expect(run.result.diagnostics.some((item) => item.code === "APPROVAL-BAD-LOCK")).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("skips lock verification when requested", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        (await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")).replace(
          /STATUS: Proposed/g,
          "STATUS: Approved",
        ),
      )

      const run = await runCheck(target, { structural: true, verifyApprovals: false })
      expect(run.code).toBe(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports changed evidence hashes", async () => {
    const target = await createTarget()
    try {
      await writeCheckConfig(target)
      await approveSample(target, [evidenceRecord("pass")])
      const run = await runEvidenceCheck(target, [evidenceRecord("fail")])

      expect(run.code).toBe(1)
      expect(
        run.result.diagnostics.some((item) => item.code === "APPROVAL-EVIDENCE-MISMATCH"),
      ).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports approved evidence that was not regenerated", async () => {
    const target = await createTarget()
    try {
      await writeCheckConfig(target)
      await approveSample(target, [evidenceRecord("pass")])
      const run = await runEvidenceCheck(target, [])

      expect(run.code).toBe(1)
      expect(
        run.result.diagnostics.some((item) => item.code === "APPROVAL-EVIDENCE-MISSING"),
      ).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("skips evidence verification for structural checks", async () => {
    const target = await createTarget()
    try {
      await approveSample(target, [evidenceRecord("pass")])
      const run = await runCheck(target, { structural: true })

      expect(run.code).toBe(0)
      expect(
        run.result.diagnostics.some(
          (item) =>
            item.code === "APPROVAL-EVIDENCE-MISMATCH" ||
            item.code === "APPROVAL-EVIDENCE-MISSING",
        ),
      ).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
