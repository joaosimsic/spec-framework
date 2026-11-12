import { describe, expect, test } from "bun:test"
import {
  guardCommand,
  guardWrite,
  isApprovalCommand,
  isLockWrite,
  isSpecSourceWrite,
} from "../src/plugin"

describe("plugin guards", () => {
  test("blocks approval commands", () => {
    expect(isApprovalCommand("spec approve --scope 'Session expiry'")).toBe(true)
    expect(isApprovalCommand("bun run spec approve REQ-1")).toBe(true)
    expect(isApprovalCommand("spec check")).toBe(false)
    expect(guardCommand("spec approve REQ-1")).toContain("human-only")
  })

  test("blocks approval lock writes", () => {
    expect(isLockWrite("spec/spec.lock")).toBe(true)
    expect(isLockWrite("/repo/spec/spec.lock")).toBe(true)
    expect(guardWrite("spec/spec.lock", "spec-architect")).toContain("human-only")
  })

  test("blocks direct spec source writes for spec agents", () => {
    expect(isSpecSourceWrite("spec/requirements/core.sdoc")).toBe(true)
    expect(isSpecSourceWrite("spec/proposals/add-session.json")).toBe(false)
    expect(isSpecSourceWrite("src/change/change.ts")).toBe(false)
    expect(guardWrite("spec/requirements/core.sdoc", "spec-architect")).toContain("spec_propose")
    expect(guardWrite("spec/requirements/core.sdoc", "build")).toBeNull()
  })
})
