import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runApproval } from "../src/approval/approve"
import type { ApprovalConfirmation } from "../src/approval/confirmation"
import type { GitStatusReader } from "../src/approval/git"
import { architectureContentHash } from "../src/approval/hash"
import { specLockPath } from "../src/approval/lock"
import { ApprovalScopeLoader } from "../src/approval/scope"
import { verifySpecLock } from "../src/approval/verify"
import { ArchitectureCatalogLoader } from "../src/approval/architecture"
import { ok, type Result } from "../src/core/result"

const architecture = `specification {
  element system
  element component
}

model {
  // SYS-SAMPLE proposed confidence=observed provenance=human:test@2026-11-11
  sysSample = system 'Sample'
  // CMP-APP proposed confidence=observed provenance=human:test@2026-11-11 owner="platform"
  cmpApp = component 'Application'

  sysSample -> cmpApp 'contains'
}

views {
  view index {
    include *
  }
}
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
  async read(target: string): Promise<Result<boolean, string>> {
    void target
    return ok(true)
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "approval-architecture-"))
  await mkdir(join(target, "spec", "architecture"), { recursive: true })
  await writeFile(join(target, "spec", "architecture", "model.c4"), architecture)

  return target
}

function options() {
  return {
    approver: "tester",
    confirmation: new FakeConfirmation(true),
    gitStatus: new FakeGitStatus(),
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  }
}

describe("architecture approval", () => {
  test("hash-locks a proposed architecture element and marks it approved", async () => {
    const target = await createTarget()
    try {
      const run = await runApproval(target, ["CMP-APP"], options())

      expect(run.code).toBe(0)
      expect(run.lock?.elements["CMP-APP"]?.content_hash).toStartWith("sha256:")
      expect(run.lock?.elements["CMP-APP"]?.evidence).toEqual([])

      const text = await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")
      expect(text).toContain("// CMP-APP approved confidence=observed")
      expect(text).toContain('owner="platform"')
      expect(JSON.parse(await readFile(specLockPath(target), "utf8"))).toEqual(run.lock)

      const diagnostics = await verifySpecLock(target, [])
      expect(diagnostics.filter((item) => item.level === "error")).toHaveLength(0)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("resolves visible architecture names", async () => {
    const target = await createTarget()
    try {
      const [scope, error] = await new ApprovalScopeLoader(target).resolve(["Application"])

      expect(error).toBeNull()
      expect(scope?.ids).toEqual(["CMP-APP"])
      expect(scope?.labels["CMP-APP"]).toBe("Application")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("rejects draft architecture elements", async () => {
    const target = await createTarget()
    try {
      const draft = architecture.replace("CMP-APP proposed", "CMP-APP draft")
      await writeFile(join(target, "spec", "architecture", "model.c4"), draft)
      const run = await runApproval(target, ["CMP-APP"], options())

      expect(run.code).toBe(1)
      expect(run.output).toContain("must have status 'proposed'")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports architecture hash mismatch after an edit", async () => {
    const target = await createTarget()
    try {
      await runApproval(target, ["CMP-APP"], options())
      const changed = architecture.replace("Application", "Renamed application")
      await writeFile(join(target, "spec", "architecture", "model.c4"), changed)
      const diagnostics = await verifySpecLock(target, [])

      expect(diagnostics.some((item) => item.code === "APPROVAL-HASH-MISMATCH")).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("uses the same hash as the architecture catalog", async () => {
    const target = await createTarget()
    try {
      const [catalog, error] = await new ArchitectureCatalogLoader(target).load()
      expect(error).toBeNull()
      const element = catalog?.elements.find((candidate) => candidate.id === "CMP-APP")
      expect(element).toBeDefined()
      if (element === undefined || catalog === null) return

      expect(architectureContentHash(element, catalog.relationships)).toStartWith("sha256:")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
