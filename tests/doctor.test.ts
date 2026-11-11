import { describe, expect, test } from "bun:test"
import { missingRequiredDiagnostics, type ToolStatus } from "../src/core/doctor"

const statuses: ToolStatus[] = [
  {
    name: "likec4",
    command: "likec4",
    required: true,
    present: false,
    install: "install likec4",
  },
  {
    name: "cargo",
    command: "cargo",
    required: false,
    present: false,
    install: "install Rust",
  },
  {
    name: "cargo-semver-checks",
    command: "cargo-semver-checks",
    required: false,
    present: false,
    install: "install cargo-semver-checks",
  },
]

describe("missingRequiredDiagnostics", () => {
  test("reports only missing tools required by active adapters", () => {
    const diagnostics = missingRequiredDiagnostics(statuses, ["cargo-semver-checks"])

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.message).toContain("cargo-semver-checks")
    expect(diagnostics.some((item) => item.message.includes("likec4"))).toBe(false)
  })

  test("reports no missing tools when no adapters are active", () => {
    expect(missingRequiredDiagnostics(statuses, [])).toEqual([])
  })

  test("falls back to globally required tools when no list is provided", () => {
    const diagnostics = missingRequiredDiagnostics(statuses)

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.message).toContain("likec4")
  })
})
