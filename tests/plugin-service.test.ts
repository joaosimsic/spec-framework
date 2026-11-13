import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { ProposalGit } from "../src/change"
import type { GitProposalState, Proposal } from "../src/change/types"
import { ok, type Result } from "../src/core/result"
import {
  formatChange,
  formatContext,
  formatContextBlock,
  formatQuery,
  formatStatus,
  SpecPluginService,
} from "../src/plugin"

const config = `{
  "version": 1,
  "profile": "full",
  "project": { "name": "sample", "adoption": "greenfield" },
  "adapters": {},
  "approval": { "mode": "human", "humanOnly": true }
}
`

const requirements = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-12
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
STATEMENT: Given a request, the component returns a result.
FORMAL: PROP-SAMPLE-001
PROVENANCE: human:test@2026-11-12
OWNER: test
`

const proposal: Proposal = {
  version: 1,
  id: "prop-add-session-expiry",
  direction: "Add session expiry",
  mode: "scratch",
  status: "draft",
  branch: "spec/add-session-expiry",
  base_commit: "base123",
  baseline: { commit: "base123", lock_hash: null },
  author: "tester",
  created_at: "2026-11-12T12:00:00.000Z",
  operations: [],
}

class FakeProposalGit implements ProposalGit {
  async readState(target: string): Promise<Result<GitProposalState, string>> {
    void target
    return ok({ branch: "spec/add-session-expiry", commit: "base123", clean: true })
  }

  async branchExists(target: string, branch: string): Promise<Result<boolean, string>> {
    void target
    void branch
    return ok(true)
  }

  async createBranch(
    target: string,
    branch: string,
    baseCommit: string,
  ): Promise<Result<string, string>> {
    void target
    void baseCommit
    return ok(branch)
  }

  async resolveAuthor(target: string): Promise<Result<string, string>> {
    void target
    return ok("tester")
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "plugin-service-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await mkdir(join(target, "spec", "proposals"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), config)
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), requirements)
  await writeFile(
    join(target, "spec", "proposals", "add-session-expiry.json"),
    `${JSON.stringify(proposal, null, 2)}\n`,
  )

  return target
}

function serviceFor(target: string): SpecPluginService {
  return new SpecPluginService(target, { gitRepository: new FakeProposalGit() })
}

describe("SpecPluginService", () => {
  test("reads status and records a decision by visible name", async () => {
    const target = await createTarget()
    try {
      const service = serviceFor(target)
      const [status, statusError] = await service.status()
      expect(statusError).toBeNull()
      if (status === null) throw new Error("status missing")
      expect(status.mode).toBe("scratch")
      expect(status.proposal?.label).toBe("Add session expiry")
      expect(formatStatus(status)).not.toMatch(/\b(?:REQ|AC|DEC|UNK)-/)
      expect(formatContextBlock(status)).toContain("<spec-context>")
      expect(formatContextBlock(status)).not.toMatch(/\b(?:REQ|AC|DEC|UNK)-/)

      const [change, changeError] = await service.decide({
        kind: "open-question",
        text: "What happens when the token store is down?",
        target: "Sample behavior",
      })
      expect(changeError).toBeNull()
      if (change === null) throw new Error("change missing")
      expect(formatChange(change)).not.toMatch(/\b(?:REQ|AC|DEC|UNK)-/)

      const text = await readFile(join(target, "spec", "requirements", "decisions.sdoc"), "utf8")
      expect(text).toContain("UID: UNK-WHAT-HAPPENS-WHEN-THE-TOKEN-STORE-IS-DOWN")
      expect(text).toContain("QUESTIONS: REQ-SAMPLE-001")

      const [next, nextError] = await service.next()
      expect(nextError).toBeNull()
      expect(next?.openQuestions.map((item) => item.label)).toContain(
        "What happens when the token store is down?",
      )
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("resolves names and reveals identity only in technical output", async () => {
    const target = await createTarget()
    try {
      const service = serviceFor(target)
      const [byName, nameError] = await service.query({ name: "Sample behavior" })
      expect(nameError).toBeNull()
      expect(byName?.entries).toHaveLength(1)
      expect(formatQuery(byName?.entries ?? [])).not.toContain("REQ-SAMPLE-001")
      expect(formatQuery(byName?.entries ?? [], true)).toContain("REQ-SAMPLE-001")

      const [ambiguous, ambiguousError] = await service.query({ name: "Missing" })
      expect(ambiguous).toBeNull()
      expect(ambiguousError?.code).toBe("SPEC-PLUGIN-NOT-FOUND")

      const [context, contextError] = await service.context(["Sample behavior"])
      expect(contextError).toBeNull()
      expect(formatContext(context!, false)).not.toContain("REQ-SAMPLE-001")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
