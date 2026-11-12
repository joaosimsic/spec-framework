import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runStart } from "../src/change/start"
import { runMapReview } from "../src/core/map-review"
import { WorkbenchServer } from "../src/workbench/server"
import type {
  WorkbenchArchitectureGraphView,
  WorkbenchChangeView,
  WorkbenchContextView,
  WorkbenchMappingView,
  WorkbenchRepoGraphView,
  WorkbenchSession,
} from "../src/workbench/types"

const config = {
  version: 1,
  profile: "full",
  project: { name: "sample", adoption: "existing" },
  adapters: {},
  approval: { mode: "human", humanOnly: true },
}

async function runGit(target: string, argumentsList: string[]): Promise<void> {
  const process = Bun.spawn(["git", ...argumentsList], {
    cwd: target,
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await process.exited
  const stderr = await new Response(process.stderr).text()

  expect(exitCode, stderr).toBe(0)
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "workbench-server-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  await writeFile(join(target, "spec", "config.json"), `${JSON.stringify(config, null, 2)}\n`)
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), "")
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "app" })}\n`)
  await runGit(target, ["init", "-b", "main"])
  await runGit(target, ["config", "user.email", "tester@example.com"])
  await runGit(target, ["config", "user.name", "tester"])
  await runGit(target, ["add", "."])
  await runGit(target, ["commit", "-m", "initial"])

  return target
}

async function createScratchTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "workbench-scratch-"))
  await mkdir(join(target, "spec", "requirements"), { recursive: true })
  const scratchConfig = {
    ...config,
    project: { name: "sample", adoption: "greenfield" },
  }
  await writeFile(
    join(target, "spec", "config.json"),
    `${JSON.stringify(scratchConfig, null, 2)}\n`,
  )
  await writeFile(join(target, "spec", "requirements", "core.sdoc"), "")
  await writeFile(join(target, "package.json"), `${JSON.stringify({ name: "app" })}\n`)
  await runGit(target, ["init", "-b", "main"])
  await runGit(target, ["config", "user.email", "tester@example.com"])
  await runGit(target, ["config", "user.name", "tester"])
  await runGit(target, ["add", "."])
  await runGit(target, ["commit", "-m", "initial"])

  return target
}

function fixedNow(): Date {
  return new Date("2026-11-12T12:00:00.000Z")
}

describe("WorkbenchServer integration", () => {
  test("serves a read-only session without a proposal", async () => {
    const target = await createTarget()

    try {
      const server = new WorkbenchServer({
        target,
        port: 0,
        logger: { log: () => undefined },
      })
      const [handle, startError] = await server.start()
      expect(startError).toBeNull()
      if (handle === null) throw new Error("workbench server did not start")

      try {
        const response = await fetch(`${handle.url}/api/session`)
        const session = (await response.json()) as WorkbenchSession
        expect(response.status).toBe(200)
        expect(session.mode).toBe("read-only")
        expect(session.proposal).toBeNull()
        expect(session.views).toEqual(["architecture", "code", "overview"])
      } finally {
        handle.close()
      }
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("serves the curated architecture graph without a proposal", async () => {
    const target = await createTarget()

    try {
      await mkdir(join(target, "spec", "architecture"), { recursive: true })
      await writeFile(
        join(target, "spec", "architecture", "model.c4"),
        `specification {
  element system
  element component
  relationship depends_on
}

model {
  // SYS-SAMPLE observed human:tester@2026-11-12
  sample = system 'Sample system'
  // CMP-SAMPLE-CORE observed human:tester@2026-11-12
  core = component 'Core'
  sample -> core 'contains'
  core -> sample 'reports to'
}
`,
      )

      const server = new WorkbenchServer({
        target,
        port: 0,
        logger: { log: () => undefined },
      })
      const [handle, startError] = await server.start()
      expect(startError).toBeNull()
      if (handle === null) throw new Error("workbench server did not start")

      try {
        const response = await fetch(`${handle.url}/api/architecture-graph`)
        const view = (await response.json()) as WorkbenchArchitectureGraphView
        expect(response.status).toBe(200)
        expect(view.nodes.map((node) => node.label).sort()).toEqual(["Core", "Sample system"])
        expect(view.nodes.find((node) => node.label === "Core")?.parentRef).not.toBeNull()
        expect(view.edges.map((edge) => edge.label)).toEqual(["reports to"])
        expect(JSON.stringify(view)).not.toMatch(/\b(?:SYS|CMP)-/)
      } finally {
        handle.close()
      }
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("serves the repo graph without a proposal", async () => {
    const target = await createTarget()

    try {
      await mkdir(join(target, "src", "core"), { recursive: true })
      await mkdir(join(target, "src", "change"), { recursive: true })
      await writeFile(join(target, "src", "core", "result.ts"), "export const result = 1\n")
      await writeFile(
        join(target, "src", "change", "operations.ts"),
        'import { result } from "../core/result"\nexport const value = result\n',
      )

      const server = new WorkbenchServer({
        target,
        port: 0,
        logger: { log: () => undefined },
      })
      const [handle, startError] = await server.start()
      expect(startError).toBeNull()
      if (handle === null) throw new Error("workbench server did not start")

      try {
        const response = await fetch(`${handle.url}/api/repo-graph`)
        const view = (await response.json()) as WorkbenchRepoGraphView
        expect(response.status).toBe(200)
        expect(view.nodes.some((node) => node.label === "core")).toBe(true)
        expect(view.nodes.some((node) => node.label === "operations.ts")).toBe(true)
        expect(
          view.edges.some(
            (edge) =>
              edge.type === "depends_on" &&
              view.nodes.find((node) => node.ref === edge.sourceRef)?.label === "operations.ts",
          ),
        ).toBe(true)
        expect(view.summary.files).toBe(2)
      } finally {
        handle.close()
      }
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("serves a real mapping proposal and records a curation action", async () => {
    const target = await createTarget()

    try {
      const review = await runMapReview(target, { author: "tester", now: fixedNow })
      expect(review.code).toBe(0)

      const server = new WorkbenchServer({
        target,
        port: 0,
        logger: { log: () => undefined },
      })
      const [handle, startError] = await server.start()
      expect(startError).toBeNull()
      if (handle === null) throw new Error("workbench server did not start")

      try {
        const sessionResponse = await fetch(`${handle.url}/api/session`)
        const session = (await sessionResponse.json()) as WorkbenchSession
        expect(sessionResponse.status).toBe(200)
        expect(session.mode).toBe("mapping")
        expect(session.proposal?.baseCommit).toBe(session.commit)
        expect(session.views).toContain("map")

        const mappingResponse = await fetch(`${handle.url}/api/mapping`)
        const mapping = (await mappingResponse.json()) as WorkbenchMappingView
        expect(mappingResponse.status).toBe(200)
        expect(mapping.areas.length).toBeGreaterThan(0)
        expect(JSON.stringify(mapping)).not.toMatch(/\b(?:CMP|SYS|DAT)-/)

        const area = mapping.areas[0]
        expect(area).toBeDefined()
        if (area === undefined) throw new Error("mapping area missing")

        const actionResponse = await fetch(`${handle.url}/api/mapping/actions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: handle.url,
            "x-csrf-token": session.csrf_token,
          },
          body: JSON.stringify({ actions: [{ kind: "accept", target: area.ref }] }),
        })
        const updated = (await actionResponse.json()) as WorkbenchMappingView
        expect(actionResponse.status).toBe(200)
        expect(updated.areas.find((candidate) => candidate.ref === area.ref)?.state).toBe(
          "Confirmed",
        )
      } finally {
        handle.close()
      }
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("edits a scratch proposal without writing the lock", async () => {
    const target = await createScratchTarget()

    try {
      const started = await runStart(target, "Add login", { author: "tester", now: fixedNow })
      expect(started.code).toBe(0)

      const server = new WorkbenchServer({
        target,
        port: 0,
        logger: { log: () => undefined },
      })
      const [handle, startError] = await server.start()
      expect(startError).toBeNull()
      if (handle === null) throw new Error("workbench server did not start")

      try {
        const sessionResponse = await fetch(`${handle.url}/api/session`)
        const session = (await sessionResponse.json()) as WorkbenchSession
        expect(session.mode).toBe("scratch")
        expect(session.views).toContain("compose")
        const proposal = session.proposal
        if (proposal === null) throw new Error("scratch proposal missing")

        const contextResponse = await fetch(`${handle.url}/api/context`)
        const context = (await contextResponse.json()) as WorkbenchContextView
        expect(contextResponse.status).toBe(200)
        expect(context.proposal?.mode).toBe("scratch")

        const headers = {
          "content-type": "application/json",
          origin: handle.url,
          "x-csrf-token": session.csrf_token,
        }

        const requirementResponse = await fetch(`${handle.url}/api/proposals/${proposal.ref}/ops`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            simulate: true,
            operations: [
              {
                kind: "add-record",
                recordKind: "requirement",
                record: {
                  TITLE: "Login behavior",
                  STATUS: "Draft",
                  STATEMENT: "The component shall accept a valid login.",
                },
              },
            ],
          }),
        })
        const requirementChange = (await requirementResponse.json()) as WorkbenchChangeView
        expect(requirementResponse.status).toBe(200)
        expect(requirementChange.diff.added.map((item) => item.label)).toContain("Login behavior")

        const acceptanceResponse = await fetch(`${handle.url}/api/proposals/${proposal.ref}/ops`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            simulate: true,
            operations: [
              {
                kind: "add-record",
                recordKind: "acceptance_criterion",
                record: {
                  TITLE: "Valid login succeeds",
                  STATUS: "Draft",
                  STATEMENT: "Given a valid login, the component returns success.",
                },
                acceptanceOf: "REQ-LOGIN-BEHAVIOR",
              },
            ],
          }),
        })
        const acceptanceChange = (await acceptanceResponse.json()) as WorkbenchChangeView
        expect(acceptanceResponse.status).toBe(200)
        expect(acceptanceChange.diff.added.map((item) => item.label)).toContain(
          "Valid login succeeds",
        )
        expect(JSON.stringify(acceptanceChange)).not.toMatch(/\b(?:REQ|AC)-LOGIN/)
        expect(await Bun.file(join(target, "spec", "spec.lock")).exists()).toBe(false)
      } finally {
        handle.close()
      }
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
