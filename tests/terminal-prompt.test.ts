import { describe, expect, test } from "bun:test"
import { TerminalPrompt } from "../src/terminal/prompt"
import { FakeTerminalIO } from "./terminal-support"

describe("TerminalPrompt", () => {
  test("re-prompts when a visible name is ambiguous", async () => {
    const io = new FakeTerminalIO(["Same", "2"])
    const prompt = new TerminalPrompt(io)
    const selected = await prompt.select("Choose", [
      { value: "first", label: "Same" },
      { value: "second", label: "Same" },
    ])

    expect(selected).toBe("second")
    expect(io.output).toContain("That name is ambiguous. Choose a number.")
  })

  test("requires a non-empty value", async () => {
    const io = new FakeTerminalIO(["", "value"])
    const prompt = new TerminalPrompt(io)

    expect(await prompt.required("Name")).toBe("value")
    expect(io.output).toContain("A value is required.")
  })
})
