import { describe, expect, test } from "bun:test"
import { TerminalMode } from "../src/terminal/mode"

describe("TerminalMode", () => {
  test("uses a terminal by default when both streams are TTYs", () => {
    expect(
      TerminalMode.resolve({
        json: false,
        scripted: false,
        stdinIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(true)
  })

  test("stays non-interactive without a TTY", () => {
    expect(
      TerminalMode.resolve({
        json: false,
        scripted: false,
        stdinIsTTY: false,
        stdoutIsTTY: true,
      }),
    ).toBe(false)
  })

  test("disables prompting for JSON and scripted input", () => {
    expect(
      TerminalMode.resolve({
        json: true,
        scripted: false,
        stdinIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false)
    expect(
      TerminalMode.resolve({
        json: false,
        scripted: true,
        stdinIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false)
  })

  test("honors explicit interactive and non-interactive flags", () => {
    expect(
      TerminalMode.resolve({
        interactive: true,
        json: false,
        scripted: true,
        stdinIsTTY: false,
        stdoutIsTTY: false,
      }),
    ).toBe(true)
    expect(
      TerminalMode.resolve({
        interactive: false,
        json: false,
        scripted: false,
        stdinIsTTY: true,
        stdoutIsTTY: true,
      }),
    ).toBe(false)
  })
})
