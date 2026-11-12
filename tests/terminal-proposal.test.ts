import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runChange } from "../src/change/change"
import { runStart } from "../src/change/start"
import { TerminalPrompt } from "../src/terminal/prompt"
import { TerminalProposalSession } from "../src/terminal/proposal"
import { TerminalRenderer } from "../src/terminal/render"
import { WorkbenchService } from "../src/workbench/service"
import { FakeProposalGit, FakeTerminalIO } from "./terminal-support"

const requirementSource = `[REQUIREMENT]
UID: REQ-SAMPLE-001
TITLE: Sample behavior
STATUS: Draft
STATEMENT: The sample component shall return a result.
ACCEPTANCE: AC-SAMPLE-001
COMPONENT: CMP-SAMPLE
PROVENANCE: human:test@2026-11-11
OWNER: test

[REQUIREMENT]
UID: AC-SAMPLE-001
TITLE: Sample criterion
STATUS: Draft
STATEMENT: Given a request, the component returns a result.
PROVENANCE: human:test@2026-11-11
OWNER: test
`

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "greenfield" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "terminal-proposal-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), requirementSource)

  return target
}

function fixedNow(): Date {
  return new Date("2026-11-12T12:00:00.000Z")
}

describe("TerminalProposalSession", () => {
  test("adds a draft requirement in scratch mode", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      const started = await runStart(target, "Add session expiry", {
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })
      expect(started.code).toBe(0)
      git.state = { branch: "spec/add-session-expiry", commit: "base123", clean: true }

      const io = new FakeTerminalIO([
        "Add requirement",
        "Login behavior",
        "The component shall accept a valid login.",
        "",
        "",
        "None",
        "None",
        "Finish",
      ])
      const prompt = new TerminalPrompt(io)
      const renderer = new TerminalRenderer(io, false)
      const service = new WorkbenchService(target, { gitRepository: git })
      const session = new TerminalProposalSession(service, prompt, renderer, io, false)
      const [view, error] = await session.run()

      expect(error).toBeNull()
      expect(view?.operations.length).toBe(1)

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("TITLE: Login behavior")
      expect(text).toContain("The component shall accept a valid login.")
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)

      const output = io.output.join("\n")
      expect(output).not.toMatch(/(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS)-/)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("renames an item in refactor mode and keeps the lock untouched", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      const change = await runChange(target, "Update sample behavior", {
        mode: "refactor",
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })
      expect(change.code).toBe(0)
      git.state = { branch: "spec/update-sample-behavior", commit: "base123", clean: true }

      const io = new FakeTerminalIO(["Rename", "Sample behavior", "Updated behavior", "Finish"])
      const prompt = new TerminalPrompt(io)
      const renderer = new TerminalRenderer(io, false)
      const service = new WorkbenchService(target, { gitRepository: git })
      const session = new TerminalProposalSession(service, prompt, renderer, io, true)
      const [view, error] = await session.run()

      expect(error).toBeNull()
      expect(view?.operations.length).toBe(1)

      const text = await readFile(join(target, "spec", "requirements", "core.sdoc"), "utf8")
      expect(text).toContain("TITLE: Updated behavior")
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("stops at end of input and leaves the proposal open", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      await runStart(target, "Add session expiry", {
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })
      git.state = { branch: "spec/add-session-expiry", commit: "base123", clean: true }

      const io = new FakeTerminalIO([])
      const prompt = new TerminalPrompt(io)
      const renderer = new TerminalRenderer(io, false)
      const service = new WorkbenchService(target, { gitRepository: git })
      const session = new TerminalProposalSession(service, prompt, renderer, io, false)
      const [view, error] = await session.run()

      expect(error).toBeNull()
      expect(view).not.toBeNull()
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
