import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ToolchainLockStore } from "../src/core/toolchain"

async function createTarget(content?: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "toolchain-"))
  await mkdir(join(target, "spec"), { recursive: true })
  if (content !== undefined) {
    await writeFile(join(target, "spec", "toolchain.lock.json"), content)
  }

  return target
}

describe("ToolchainLockStore", () => {
  test("accepts exact versions only", () => {
    expect(ToolchainLockStore.isPinnedVersion("1.60.0")).toBe(true)
    expect(ToolchainLockStore.isPinnedVersion("0.33.1-rc.1")).toBe(true)
    expect(ToolchainLockStore.isPinnedVersion("latest")).toBe(false)
    expect(ToolchainLockStore.isPinnedVersion("^1.60.0")).toBe(false)
  })

  test("derives the provisioning status from required and present tools", () => {
    expect(ToolchainLockStore.statusFor(0, 0)).toBe("provisioned")
    expect(ToolchainLockStore.statusFor(3, 3)).toBe("provisioned")
    expect(ToolchainLockStore.statusFor(3, 0)).toBe("unprovisioned")
    expect(ToolchainLockStore.statusFor(3, 1)).toBe("partial")
  })

  test("rejects a floating version", async () => {
    const target = await createTarget(
      JSON.stringify({ schema: 1, status: "unprovisioned", tools: { likec4: "latest" } }),
    )
    try {
      const [lock, error] = await new ToolchainLockStore(target).load()

      expect(lock).toBeNull()
      expect(error?.code).toBe("TOOLCHAIN-BAD-LOCK")
      expect(error?.message).toContain("must be exact")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("writes tools in deterministic order with a trailing newline", async () => {
    const target = await createTarget()
    try {
      const store = new ToolchainLockStore(target)
      const [saved, error] = await store.save({
        schema: 1,
        status: "partial",
        tools: { strictdoc: "0.30.4", likec4: "1.60.0" },
      })

      expect(error).toBeNull()
      expect(saved?.status).toBe("partial")
      expect(await readFile(join(target, "spec", "toolchain.lock.json"), "utf8")).toBe(
        `{\n  "schema": 1,\n  "status": "partial",\n  "tools": {\n    "likec4": "1.60.0",\n    "strictdoc": "0.30.4"\n  }\n}\n`,
      )
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
