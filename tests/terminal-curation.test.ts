import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runMapReview } from "../src/core/map-review"
import { MappingSnapshotStore } from "../src/discovery/mapping-store"
import { TerminalCurationSession } from "../src/terminal/curation"
import { TerminalPrompt } from "../src/terminal/prompt"
import { TerminalRenderer } from "../src/terminal/render"
import { WorkbenchService } from "../src/workbench/service"
import { FakeProposalGit, FakeTerminalIO } from "./terminal-support"

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "existing" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "terminal-curation-"))
  await mkdir(join(target, "spec"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "app" })}\n`)

  return target
}

function fixedNow(): Date {
  return new Date("2026-11-12T12:00:00.000Z")
}

describe("TerminalCurationSession", () => {
  test("records a curation action by visible name without writing the lock", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      const run = await runMapReview(target, {
        author: "tester",
        gitRepository: git,
        now: fixedNow,
      })
      expect(run.code).toBe(0)
      git.state = { branch: "spec/review-sample-mapping", commit: "base123", clean: true }

      const io = new FakeTerminalIO(["Keep this area", "Finish curation", "Finish curation"])
      const prompt = new TerminalPrompt(io)
      const renderer = new TerminalRenderer(io, false)
      const service = new WorkbenchService(target, { gitRepository: git })
      const session = new TerminalCurationSession(service, prompt, renderer, io)
      const [view, error] = await session.run()

      expect(error).toBeNull()
      expect(view?.areas.some((area) => area.state === "Confirmed")).toBe(true)

      const [snapshot, snapshotError] = await new MappingSnapshotStore(target).load(
        "spec/review-sample-mapping",
      )
      expect(snapshotError).toBeNull()
      expect(snapshot?.decisions.some((decision) => decision.action.kind === "accept")).toBe(true)
      expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)

      const output = io.output.join("\n")
      expect(output).not.toMatch(/(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS)-/)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("stops at end of input", async () => {
    const target = await createTarget()
    try {
      const git = new FakeProposalGit()
      await runMapReview(target, { author: "tester", gitRepository: git, now: fixedNow })
      git.state = { branch: "spec/review-sample-mapping", commit: "base123", clean: true }

      const io = new FakeTerminalIO([])
      const prompt = new TerminalPrompt(io)
      const renderer = new TerminalRenderer(io, false)
      const service = new WorkbenchService(target, { gitRepository: git })
      const session = new TerminalCurationSession(service, prompt, renderer, io)
      const [view, error] = await session.run()

      expect(error).toBeNull()
      expect(view).not.toBeNull()
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
