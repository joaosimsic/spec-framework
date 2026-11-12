import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TerminalNextReporter } from "../src/terminal/next"
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
  const target = await mkdtemp(join(tmpdir(), "terminal-next-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), "")
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "app" })}\n`)

  return target
}

describe("TerminalNextReporter", () => {
  test("shows the next CLI step without an active proposal", async () => {
    const target = await createTarget()
    try {
      const service = new WorkbenchService(target, {
        gitRepository: new FakeProposalGit(),
      })
      const [view, error] = await new TerminalNextReporter(service).read()

      expect(error).toBeNull()
      expect(view?.mode).toBe("read-only")
      expect(view?.context.next).toEqual(["Open a proposal from the CLI to begin planning."])

      const io = new FakeTerminalIO([])
      new TerminalRenderer(io, false).next(view!.context)
      const output = io.output.join("\n")
      expect(output).toContain("mode: read-only")
      expect(output).toContain("Open a proposal from the CLI to begin planning.")
      expect(output).not.toMatch(/(?:REQ|AC|CMP|CAP|VOBJ|VER|PROP|CON|EVD|UNK|WVR|DEC|SYS)-/)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports a closed prompt on end of input", async () => {
    const io = new FakeTerminalIO([])
    const prompt = new TerminalPrompt(io)

    expect(await prompt.text("Question")).toBeNull()
    expect(prompt.isClosed).toBe(true)
  })
})
