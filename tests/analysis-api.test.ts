import { describe, expect, test } from "bun:test"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WorkbenchServer } from "../src/workbench"

async function createRepository(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "analysis-api-"))
  await mkdir(join(target, "src"), { recursive: true })
  await writeFile(join(target, "src", "index.ts"), "export const value = 1\n")
  await writeFile(join(target, ".gitignore"), ".spec/\n")
  execFileSync("git", ["init"], { cwd: target, stdio: "ignore" })
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: target })
  execFileSync("git", ["config", "user.name", "Test"], { cwd: target })
  execFileSync("git", ["add", "."], { cwd: target })
  execFileSync("git", ["commit", "-m", "initial"], { cwd: target, stdio: "ignore" })

  return target
}

function headers(origin: string, token: string): Record<string, string> {
  return {
    "content-type": "application/json",
    origin,
    "x-csrf-token": token,
  }
}

describe("analysis API", () => {
  test("registers a project, streams a job, and returns a snapshot", async () => {
    const target = await createRepository()
    const token = "test-token"
    const server = new WorkbenchServer({
      target,
      port: 0,
      token,
      assetDirectory: join(target, "missing"),
    })
    const [handle, startError] = await server.start()
    expect(startError).toBeNull()
    if (handle === null) return
    const origin = handle.url

    try {
      const register = await fetch(`${origin}/api/v1/projects`, {
        method: "POST",
        headers: headers(origin, token),
        body: JSON.stringify({ name: "sample", repository_path: target }),
      })
      expect(register.status).toBe(201)
      const registered = (await register.json()) as { data: { id: string } }

      const analyze = await fetch(`${origin}/api/v1/projects/${registered.data.id}/analyze`, {
        method: "POST",
        headers: headers(origin, token),
        body: "{}",
      })
      expect(analyze.status).toBe(202)
      const started = (await analyze.json()) as { data: { id: string } }

      const events = await fetch(`${origin}/api/v1/jobs/${started.data.id}/events`)
      const stream = await events.text()
      expect(stream).toContain("event: queued")
      expect(stream).toContain("event: completed")

      const job = await fetch(`${origin}/api/v1/jobs/${started.data.id}`)
      const jobBody = (await job.json()) as { data: { state: string; snapshot_id: string } }
      expect(jobBody.data.state).toBe("succeeded")
      expect(jobBody.data.snapshot_id.startsWith("SNAP-")).toBe(true)

      const history = await fetch(`${origin}/api/v1/projects/${registered.data.id}/analysis`)
      const historyBody = (await history.json()) as {
        data: { snapshots: Array<{ id: string }> }
      }
      expect(historyBody.data.snapshots).toHaveLength(1)
      expect(await Bun.file(join(target, "spec", "generated", "analysis.gen.json")).exists()).toBe(
        true,
      )

      const generated = await fetch(`${origin}/api/v1/projects/${registered.data.id}/spec`)
      expect(generated.status).toBe(200)
      const generatedBody = (await generated.json()) as {
        data: { requirements: unknown[]; findings: unknown[]; unknowns: unknown[] }
      }
      expect(generatedBody.data).toHaveProperty("requirements")
      expect(JSON.stringify(generatedBody.data)).not.toContain('"approved"')

      const architecture = await fetch(
        `${origin}/api/v1/projects/${registered.data.id}/architecture`,
      )
      const architectureBody = (await architecture.json()) as {
        data: { root_id: string; summary: { nodes: number } }
      }
      expect(architectureBody.data.summary.nodes).toBeGreaterThan(0)

      const graph = await fetch(`${origin}/api/v1/projects/${registered.data.id}/graph?depth=4`)
      const graphBody = (await graph.json()) as {
        data: { nodes: Array<{ id: string; kind: string }> }
      }
      expect(graphBody.data.nodes.some((node) => node.kind === "file")).toBe(true)
    } finally {
      handle.close()
    }
  })
})
