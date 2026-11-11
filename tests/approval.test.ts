import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runApproval } from "../src/approval/approve"
import type { ApprovalConfirmation } from "../src/approval/confirmation"
import type { GitStatusReader } from "../src/approval/git"
import { elementContentHash } from "../src/approval/hash"
import { specLockPath } from "../src/approval/lock"
import { parseSdoc } from "../src/core/sdoc"
import type { Result } from "../src/core/result"
import { EvidenceFactory } from "../src/evidence"

const proposedRequirement = `[DOCUMENT]
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

class FakeConfirmation implements ApprovalConfirmation {
  readonly messages: string[] = []

  constructor(private readonly answer: boolean) {}

  async confirm(message: string): Promise<boolean> {
    this.messages.push(message)

    return this.answer
  }
}

class FakeGitStatus implements GitStatusReader {
  calls = 0

  constructor(private readonly clean: boolean) {}

  async read(target: string): Promise<Result<boolean, string>> {
    void target
    this.calls += 1

    return [this.clean, null]
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "approval-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), proposedRequirement)

  return target
}

function approvalOptions(
  confirmation: ApprovalConfirmation,
  gitStatus: GitStatusReader,
  allowDirty = false,
) {
  return {
    approver: "tester",
    confirmation,
    gitStatus,
    allowDirty,
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  }
}

describe("runApproval", () => {
  test("hash-locks proposed requirements and acceptance criteria", async () => {
    const target = await createTarget()
    try {
      const run = await runApproval(
        target,
        ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )

      expect(run.code).toBe(0)
      expect(run.lock?.approver).toBe("tester")
      expect(run.lock?.approved_at).toBe("2026-11-11T12:00:00.000Z")
      expect(run.lock?.dirty).toBe(false)
      expect(Object.keys(run.lock?.elements ?? {}).sort()).toEqual([
        "AC-SAMPLE-001",
        "REQ-SAMPLE-001",
      ])
      expect(run.lock?.elements["REQ-SAMPLE-001"]?.content_hash).toStartWith("sha256:")

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).not.toContain("STATUS: Proposed")
      expect(text.match(/STATUS: Approved/g)).toHaveLength(2)

      const lockText = await readFile(specLockPath(target), "utf8")
      expect(JSON.parse(lockText)).toEqual(run.lock)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("records evidence hashes and writes artifacts", async () => {
    const target = await createTarget()
    try {
      const evidence = new EvidenceFactory().create({
        id: "EVD-SAMPLE-001",
        kind: "sample",
        method: "test",
        tool: "bun",
        result: "pass",
        inputs: [],
        command: ["bun", "test"],
      })
      const run = await runApproval(target, ["REQ-SAMPLE-001", "AC-SAMPLE-001"], {
        ...approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
        evidence: [evidence],
      })

      expect(run.code).toBe(0)
      expect(run.lock?.elements["REQ-SAMPLE-001"]?.evidence).toEqual(["EVD-SAMPLE-001"])
      expect(run.lock?.evidence["EVD-SAMPLE-001"]).toEqual({
        hash: evidence.hash,
        tool: "bun",
        result: "pass",
      })
      const artifact = await readFile(
        join(target, "spec", "evidence", "EVD-SAMPLE-001.json"),
        "utf8",
      )
      expect(JSON.parse(artifact)).toEqual(evidence)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects unknown element IDs", async () => {
    const target = await createTarget()
    try {
      const run = await runApproval(
        target,
        ["REQ-MISSING-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )

      expect(run.code).toBe(1)
      expect(run.output).toContain("unknown element")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects records that are not proposed", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        proposedRequirement.replace("STATUS: Proposed", "STATUS: Draft"),
      )
      const run = await runApproval(
        target,
        ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )

      expect(run.code).toBe(1)
      expect(run.output).toContain("STATUS: Proposed")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects an acceptance criterion outside the approval scope", async () => {
    const target = await createTarget()
    try {
      const run = await runApproval(
        target,
        ["REQ-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )

      expect(run.code).toBe(1)
      expect(run.output).toContain("AC-SAMPLE-001")
      expect(run.output).toContain("not approved or included")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects a requirement without formalization or waiver", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        proposedRequirement.replace("FORMAL: PROP-SAMPLE-001", "FORMAL: none"),
      )
      const run = await runApproval(
        target,
        ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )

      expect(run.code).toBe(1)
      expect(run.output).toContain("formalization or waiver")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("requires a clean tree unless the dirty state is allowed", async () => {
    const target = await createTarget()
    try {
      const denied = await runApproval(
        target,
        ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(false)),
      )
      expect(denied.code).toBe(1)
      expect(denied.output).toContain("--allow-dirty")

      const allowed = await runApproval(
        target,
        ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(false), true),
      )
      expect(allowed.code).toBe(0)
      expect(allowed.lock?.dirty).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("writes nothing when confirmation is denied", async () => {
    const target = await createTarget()
    try {
      const confirmation = new FakeConfirmation(false)
      const run = await runApproval(
        target,
        ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
        approvalOptions(confirmation, new FakeGitStatus(true)),
      )

      expect(run.code).toBe(1)
      expect(run.output).toContain("cancelled")
      expect(confirmation.messages).toHaveLength(1)
      expect(await Bun.file(specLockPath(target)).exists()).toBe(false)
      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("STATUS: Proposed")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("shows named scope by default and IDs only with technical output", async () => {
    const target = await createTarget()
    try {
      const labels = {
        "REQ-SAMPLE-001": "Sample behavior",
        "AC-SAMPLE-001": "Sample criterion",
      }
      const confirmation = new FakeConfirmation(true)
      const run = await runApproval(target, ["REQ-SAMPLE-001", "AC-SAMPLE-001"], {
        ...approvalOptions(confirmation, new FakeGitStatus(true)),
        labels,
      })

      expect(run.code).toBe(0)
      expect(run.output).toContain("approved Sample behavior")
      expect(run.output).not.toContain("REQ-SAMPLE-001")
      expect(run.output).not.toContain("AC-SAMPLE-001")
      expect(confirmation.messages[0]).toContain("Sample behavior")
      expect(confirmation.messages[0]).toContain("Sample criterion")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("prints IDs with technical approval output", async () => {
    const target = await createTarget()
    try {
      const labels = {
        "REQ-SAMPLE-001": "Sample behavior",
        "AC-SAMPLE-001": "Sample criterion",
      }
      const run = await runApproval(target, ["REQ-SAMPLE-001", "AC-SAMPLE-001"], {
        ...approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
        labels,
        technical: true,
      })

      expect(run.code).toBe(0)
      expect(run.output).toContain("approved REQ-SAMPLE-001")
      expect(run.output).toContain("approved AC-SAMPLE-001")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("preserves unrelated lock entries", async () => {
    const target = await createTarget()
    try {
      await writeFile(
        specLockPath(target),
        JSON.stringify({
          version: 1,
          approved_at: "2026-11-10T00:00:00.000Z",
          approver: "previous",
          dirty: false,
          elements: {
            "REQ-OLD-001": { content_hash: "sha256:old", evidence: ["EVD-OLD-001"] },
          },
          evidence: {
            "EVD-OLD-001": { hash: "sha256:evidence", tool: "test", result: "pass" },
          },
        }),
      )
      const run = await runApproval(
        target,
        ["REQ-SAMPLE-001", "AC-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )

      expect(run.code).toBe(0)
      expect(run.lock?.elements["REQ-OLD-001"]?.content_hash).toBe("sha256:old")
      expect(run.lock?.evidence["EVD-OLD-001"]?.hash).toBe("sha256:evidence")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reapproves a requirement whose acceptance criterion is already locked", async () => {
    const target = await createTarget()
    try {
      const first = await runApproval(
        target,
        ["AC-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )
      expect(first.code).toBe(0)

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        text.replace(
          "STATEMENT: The sample component shall return a result.",
          "STATEMENT: The sample component shall return a successful result.",
        ),
      )

      const second = await runApproval(
        target,
        ["REQ-SAMPLE-001"],
        approvalOptions(new FakeConfirmation(true), new FakeGitStatus(true)),
      )
      expect(second.code).toBe(0)
      expect(second.lock?.elements["AC-SAMPLE-001"]).toBeDefined()
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("elementContentHash", () => {
  test("ignores status and field order", () => {
    const first = parseSdoc(
      "sample.sdoc",
      `[REQUIREMENT]\nUID: REQ-SAMPLE-001\nSTATUS: Proposed\nTITLE: Sample\nSTATEMENT: The sample shall work.\n`,
    )[0]
    const second = parseSdoc(
      "sample.sdoc",
      `[REQUIREMENT]\nSTATEMENT: The sample shall work.\nTITLE: Sample\nSTATUS: Approved\nUID: REQ-SAMPLE-001\n`,
    )[0]

    expect(first).toBeDefined()
    expect(second).toBeDefined()
    if (first === undefined || second === undefined) return
    expect(elementContentHash(first)).toBe(elementContentHash(second))
  })
})
