import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runApproval } from "../src/approval/approve"
import type { ApprovalConfirmation } from "../src/approval/confirmation"
import type { GitStatusReader } from "../src/approval/git"
import { ok, type Result } from "../src/core/result"
import { runMapCheck } from "../src/core/map-check"

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "existing" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

const architecture = `specification {
  element system
  element component
}

model {
  // SYS-SAMPLE proposed confidence=observed provenance=human:test@2026-11-11
  sysSample = system 'Sample'
  // CMP-APP proposed confidence=observed provenance=human:test@2026-11-11
  cmpApp = component 'App'

  sysSample -> cmpApp 'contains'
}

views {
  view index {
    include *
  }
}
`

class Confirmation implements ApprovalConfirmation {
  async confirm(message: string): Promise<boolean> {
    void message
    return true
  }
}

class CleanGit implements GitStatusReader {
  async read(target: string): Promise<Result<boolean, string>> {
    void target
    return ok(true)
  }
}

async function createTarget(packageName = "app"): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "map-drift-"))
  await mkdir(join(target, "spec", "architecture"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "spec", "architecture", "model.c4"), architecture)
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: packageName })}\n`)

  return target
}

async function approve(target: string): Promise<void> {
  const run = await runApproval(target, ["SYS-SAMPLE", "CMP-APP"], {
    approver: "tester",
    confirmation: new Confirmation(),
    gitStatus: new CleanGit(),
    now: () => new Date("2026-11-11T12:00:00.000Z"),
  })
  expect(run.code).toBe(0)
}

describe("mapping drift", () => {
  test("reports no drift for matching approved architecture", async () => {
    const target = await createTarget()
    try {
      await approve(target)
      const run = await runMapCheck(target)

      expect(run.code).toBe(0)
      expect(run.report?.approved).toBe(2)
      expect(run.report?.findings).toEqual([])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports missing-in-code and missing-in-spec", async () => {
    const target = await createTarget("renamed")
    try {
      await approve(target)
      const run = await runMapCheck(target)
      const kinds = run.report?.findings.map((finding) => finding.kind) ?? []

      expect(run.code).toBe(1)
      expect(kinds).toContain("missing-in-code")
      expect(kinds).toContain("missing-in-spec")
      expect(run.output).not.toMatch(/(?:CMP|SYS)-/)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports changed approval and changed relation", async () => {
    const target = await createTarget()
    try {
      await approve(target)
      const changed = architecture
        .replace("sysSample = system 'Sample'", "sysSample = system 'Renamed sample'")
        .replace("\n\n  sysSample -> cmpApp 'contains'", "")
      await writeFile(join(target, "spec", "architecture", "model.c4"), changed)
      const run = await runMapCheck(target, { json: true })
      const kinds = run.report?.findings.map((finding) => finding.kind) ?? []

      expect(kinds).toContain("changed-approval")
      expect(kinds).toContain("changed-relation")
      expect(run.output).toContain("SYS-SAMPLE")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("returns cleanly when no architecture is approved", async () => {
    const target = await createTarget()
    try {
      const run = await runMapCheck(target)

      expect(run.code).toBe(0)
      expect(run.report?.approved).toBe(0)
      expect(run.output).toContain("no approved architecture")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
