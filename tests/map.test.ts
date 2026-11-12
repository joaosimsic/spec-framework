import { describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { runMap } from "../src/core/map"
import type { Result } from "../src/core/result"
import type {
  CommandFailure,
  CommandResult,
  CommandSpec,
  ProcessRunner,
  ToolLocator,
} from "../src/core/runner"
import { RustDiscovery } from "../src/discovery/rust"

class FakeToolLocator implements ToolLocator {
  constructor(private readonly executable: string | null = "/bin/fake") {}

  async resolve(commandName: string): Promise<string | null> {
    void commandName

    return this.executable
  }
}

class FakeProcessRunner implements ProcessRunner {
  readonly calls: CommandSpec[] = []

  constructor(private readonly queuedResults: Result<CommandResult, CommandFailure>[]) {}

  async run(commandSpec: CommandSpec): Promise<Result<CommandResult, CommandFailure>> {
    this.calls.push(commandSpec)
    const callIndex = this.calls.length - 1

    return (
      this.queuedResults[Math.min(callIndex, this.queuedResults.length - 1)] ?? [
        { exitCode: 0, stdout: "", stderr: "" },
        null,
      ]
    )
  }
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), "map-"))
  await mkdir(join(target, "spec"), { recursive: true })
  await writeFile(
    join(target, "spec", "config.json"),
    JSON.stringify({
      version: 1,
      profile: "full",
      project: { name: "sample", adoption: "existing" },
      adapters: {},
      approval: { mode: "hash-lock", humanOnly: true },
    }),
  )

  return target
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value))
}

describe("runMap", () => {
  test("discovers package boundaries, nesting, local dependencies, and data stores", async () => {
    const target = await createTarget()
    try {
      await writeJson(join(target, "package.json"), {
        name: "root-app",
        workspaces: ["packages/*"],
        dependencies: {
          "@sample/core": "1.0.0",
          "better-sqlite3": "11.0.0",
          express: "5.0.0",
        },
      })
      await writeJson(join(target, "packages", "core", "package.json"), {
        name: "@sample/core",
        dependencies: { "@sample/util": "1.0.0" },
      })
      await writeJson(join(target, "packages", "util", "package.json"), {
        name: "@sample/util",
      })

      const run = await runMap(target)
      expect(run.code).toBe(0)
      expect(run.report).not.toBeNull()

      const elements = run.report?.elements ?? []
      const byId = new Map(elements.map((element) => [element.id, element]))
      expect([...byId.keys()]).toEqual([
        "CMP-ROOT-APP",
        "CMP-SAMPLE-CORE",
        "CMP-SAMPLE-UTIL",
        "DAT-BETTER-SQLITE3",
        "SYS-SAMPLE",
      ])

      const root = byId.get("CMP-ROOT-APP")
      expect(root?.links).toContainEqual({
        type: "depends_on",
        to: "CMP-SAMPLE-CORE",
        confidence: "observed",
        provenance: "code:package.json#dependencies",
      })
      expect(root?.links).toContainEqual({
        type: "depends_on",
        to: "DAT-BETTER-SQLITE3",
        confidence: "inferred",
        provenance: "code:package.json#dependencies",
      })
      expect(byId.get("CMP-SAMPLE-CORE")?.links).toContainEqual({
        type: "part_of",
        to: "CMP-ROOT-APP",
        confidence: "observed",
        provenance: "code:package.json",
      })
      expect(byId.get("DAT-BETTER-SQLITE3")?.confidence).toBe("inferred")
      expect(run.report?.gaps.externalDependencies).toEqual(["CMP-ROOT-APP -> express"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("falls back to top-level directories when no manifests exist", async () => {
    const target = await createTarget()
    try {
      await mkdir(join(target, "src"), { recursive: true })
      await mkdir(join(target, "docs"), { recursive: true })
      await mkdir(join(target, "node_modules", "ignored"), { recursive: true })

      const run = await runMap(target)
      const elements = run.report?.elements ?? []
      expect(elements.map((element) => element.id)).toEqual(["CMP-DOCS", "CMP-SRC", "SYS-SAMPLE"])
      expect(elements.filter((element) => element.kind === "component")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "CMP-SRC", confidence: "ambiguous" }),
          expect.objectContaining({ id: "CMP-DOCS", confidence: "ambiguous" }),
        ]),
      )
      expect(run.report?.findings.some((finding) => finding.code === "MAP-NO-MANIFESTS")).toBe(true)
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports unresolved requirement component links", async () => {
    const target = await createTarget()
    try {
      await writeJson(join(target, "package.json"), { name: "root-app" })
      await mkdir(join(target, "spec", "requirements"), { recursive: true })
      await writeFile(
        join(target, "spec", "requirements", "core.sdoc"),
        `[REQUIREMENT]\nUID: REQ-SAMPLE-001\nTITLE: Sample\nSTATUS: Draft\nSTATEMENT: The sample shall work.\nCOMPONENT: CMP-ROOT-APP CMP-MISSING\nPROVENANCE: human:test@2026-11-10\nOWNER: test\n`,
      )

      const run = await runMap(target)
      expect(run.report?.gaps.unresolvedRequirementLinks).toEqual(["REQ-SAMPLE-001 -> CMP-MISSING"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("writes only the generated draft model", async () => {
    const target = await createTarget()
    try {
      await writeJson(join(target, "package.json"), { name: "root-app" })
      await mkdir(join(target, "spec", "architecture"), { recursive: true })
      await writeFile(join(target, "spec", "architecture", "model.c4"), "manual model")

      const run = await runMap(target, { draft: true })
      expect(run.code).toBe(0)
      expect(run.draftPath).toBe(join("spec", "generated", "draft.gen.c4"))

      const draft = await readFile(join(target, "spec", "generated", "draft.gen.c4"), "utf8")
      expect(draft).toContain("view mapDraft")
      expect(draft).toContain("sysSample -> cmpRootApp 'contains'")
      expect(await readFile(join(target, "spec", "architecture", "model.c4"), "utf8")).toBe(
        "manual model",
      )

      const preview = await runMap(target)
      expect(preview.draftPath).toBeNull()
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("emits a deterministic JSON report", async () => {
    const target = await createTarget()
    try {
      await writeJson(join(target, "package.json"), { name: "root-app" })

      const first = await runMap(target, { json: true })
      const second = await runMap(target, { json: true })

      expect(first.output).toBe(second.output)
      const report = JSON.parse(first.output) as {
        version: number
        draftPath: string | null
        elements: Array<{ id: string }>
      }
      expect(report.version).toBe(1)
      expect(report.draftPath).toBeNull()
      expect(report.elements.map((element) => element.id)).toEqual(["CMP-ROOT-APP", "SYS-SAMPLE"])
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("fails when the spec configuration is missing", async () => {
    const target = await mkdtemp(join(tmpdir(), "map-"))
    try {
      const run = await runMap(target)
      expect(run.code).toBe(1)
      expect(run.output).toContain("missing")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})

describe("RustDiscovery", () => {
  test("maps workspace packages and path dependencies", async () => {
    const target = await mkdtemp(join(tmpdir(), "map-rust-"))
    try {
      await writeFile(join(target, "Cargo.toml"), "[workspace]\nmembers = ['crates/*']\n")
      const alphaManifest = join(target, "crates", "alpha", "Cargo.toml")
      const betaManifest = join(target, "crates", "beta", "Cargo.toml")
      const metadata = {
        workspace_members: ["path+file:///alpha#0.1.0", "path+file:///beta#0.1.0"],
        packages: [
          {
            id: "path+file:///alpha#0.1.0",
            name: "alpha",
            manifest_path: alphaManifest,
            dependencies: [],
          },
          {
            id: "path+file:///beta#0.1.0",
            name: "beta",
            manifest_path: betaManifest,
            dependencies: [{ name: "alpha", path: join(target, "crates", "alpha") }],
          },
        ],
      }
      const success: Result<CommandResult, CommandFailure> = [
        { exitCode: 0, stdout: JSON.stringify(metadata), stderr: "" },
        null,
      ]
      const processRunner = new FakeProcessRunner([success])

      const contribution = await new RustDiscovery(processRunner, new FakeToolLocator()).discover(
        target,
        "SYS-SAMPLE",
      )

      expect(contribution.elements.map((element) => element.id)).toEqual(["CMP-ALPHA", "CMP-BETA"])
      expect(contribution.elements[1]?.links).toContainEqual({
        type: "depends_on",
        to: "CMP-ALPHA",
        confidence: "observed",
        provenance: "code:cargo metadata#beta",
      })
      expect(processRunner.calls[0]?.arguments).toContain("metadata")
      expect(processRunner.calls[0]?.arguments).toContain("--no-deps")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })

  test("reports missing cargo and returns no elements", async () => {
    const target = await mkdtemp(join(tmpdir(), "map-rust-"))
    try {
      await writeFile(join(target, "Cargo.toml"), "[workspace]\nmembers = []\n")

      const contribution = await new RustDiscovery(
        new FakeProcessRunner([]),
        new FakeToolLocator(null),
      ).discover(target, "SYS-SAMPLE")

      expect(contribution.elements).toEqual([])
      expect(contribution.findings[0]?.code).toBe("MAP-RUST-MISSING-TOOL")
    } finally {
      await rm(target, { recursive: true, force: true })
    }
  })
})
