import { describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WorkbenchServer } from "../src/workbench"

describe("generated workbench session", () => {
  test("serves generated views only", async () => {
    const target = await mkdtemp(join(tmpdir(), "workbench-generated-"))
    const server = new WorkbenchServer({
      target,
      port: 0,
      token: "test-token",
      assetDirectory: join(target, "missing"),
    })
    const [handle, error] = await server.start()
    expect(error).toBeNull()
    if (handle === null) return

    try {
      const response = await fetch(`${handle.url}/api/session`)
      const session = (await response.json()) as {
        mode: string
        views: string[]
        snapshot_id: string | null
      }
      expect(session.mode).toBe("generated")
      expect(session.views).toEqual(["system", "flows", "findings", "evolution", "documents"])
      expect(session.snapshot_id).toBeNull()
      const legacy = await fetch(`${handle.url}/api/graph`)
      expect(legacy.status).toBe(404)
    } finally {
      handle.close()
    }
  })
})
