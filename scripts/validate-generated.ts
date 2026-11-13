import { createHash } from "node:crypto"
import { mkdir, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { AnalysisRuntime } from "../src/workbench/analysis-runtime"
import { WorkbenchServer } from "../src/workbench"
import {
  GeneratedSpecQualityCheck,
  ValidationReportWriter,
  type ApiTiming,
  type RepositoryValidation,
} from "../src/validation"
import type { GeneratedSpec } from "../src/spec"

const ROOT = "/tmp/spec-framework-validation"
const REPOSITORIES = [
  {
    name: "boring",
    source: "/home/joao/projects/boring",
    targets: { analysisMs: 5000, depth2Ms: 300, depth4Ms: 800 },
  },
  {
    name: "llm-ruler",
    source: "/home/joao/projects/llm-ruler",
    targets: { analysisMs: 30000, depth2Ms: 500, depth4Ms: 1500 },
  },
  {
    name: "TiCrafter",
    source: "/home/joao/projects/TiCrafter",
    targets: { analysisMs: 120000, depth2Ms: 1000, depth4Ms: 3000 },
  },
]

async function main(): Promise<number> {
  const selected = process.argv.slice(2)
  const repositories =
    selected.length === 0
      ? REPOSITORIES
      : REPOSITORIES.filter((repository) => selected.includes(repository.name))
  if (repositories.length === 0) {
    console.error("no matching validation repositories")
    return 1
  }
  await mkdir(ROOT, { recursive: true })
  const results: RepositoryValidation[] = []

  for (const repository of repositories) {
    console.log(`validating ${repository.name}`)
    const [result, error] = await validateRepository(repository)
    if (error !== null || result === null) {
      console.error(`${repository.name}: ${error ?? "validation failed"}`)
      return 1
    }
    results.push(result)
    console.log(
      `${repository.name}: ${result.issues.length} issues, ${result.warnings.length} warnings, ${(result.timing.milliseconds / 1000).toFixed(2)}s`,
    )
  }

  const report = {
    generatedAt: new Date().toISOString(),
    analyzerVersion: "typescript:1",
    repositories: results,
  }
  await Bun.write(join(ROOT, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
  await Bun.write(join(ROOT, "report.md"), `${ValidationReportWriter.markdown(report)}\n`)
  console.log(`report: ${join(ROOT, "report.md")}`)

  return results.every((item) => item.issues.length === 0) ? 0 : 1
}

async function validateRepository(
  repository: (typeof REPOSITORIES)[number],
): Promise<[RepositoryValidation | null, string | null]> {
  const clonePath = join(ROOT, `${repository.name}-${Date.now()}`)
  await rm(clonePath, { recursive: true, force: true })
  const [clone, cloneError] = await runGit(
    ["clone", "--quiet", "--no-hardlinks", repository.source, clonePath],
    ROOT,
  )
  if (cloneError !== null || clone === null) return [null, cloneError ?? "clone failed"]
  const [commit, commitError] = await runGit(["rev-parse", "HEAD"], clonePath)
  if (commitError !== null || commit === null) return [null, commitError ?? "commit unavailable"]
  const cleanBefore = await gitClean(repository.source)
  await prepareClone(clonePath, repository.name)

  const first = await analyze(clonePath)
  if (first.error !== null || first.spec === null || first.runtime === null)
    return [null, first.error ?? "analysis failed"]
  const firstSpec = first.spec
  const firstRuntime = first.runtime
  const specHash = hash(JSON.stringify(firstSpec))
  const specBytes = (await stat(join(clonePath, "spec", "generated", "spec.gen.json"))).size
  const databaseBytes = (await stat(join(clonePath, ".spec", "analysis.sqlite"))).size
  const quality = new GeneratedSpecQualityCheck().check(
    firstSpec,
    clonePath,
    specBytes,
    databaseBytes,
  )
  const api = await measureApi(clonePath)
  firstRuntime.close()

  await rm(join(clonePath, ".spec"), { recursive: true, force: true })
  await rm(join(clonePath, "spec"), { recursive: true, force: true })
  const second = await analyze(clonePath)
  if (second.error !== null || second.spec === null || second.runtime === null)
    return [null, second.error ?? "second analysis failed"]
  const secondSpecHash = hash(JSON.stringify(second.spec))
  second.runtime.close()
  const cleanAfter = await gitClean(repository.source)
  const warnings = [...quality.warnings]
  const depth2 = api.find((entry) => entry.path.includes("depth=2"))
  const depth4 = api.find((entry) => entry.path.includes("depth=4"))
  if (first.timing.milliseconds > repository.targets.analysisMs)
    warnings.push(`analysis exceeded ${repository.targets.analysisMs}ms`)
  if (depth2 !== undefined && depth2.medianMs > repository.targets.depth2Ms)
    warnings.push(`graph depth 2 exceeded ${repository.targets.depth2Ms}ms`)
  if (depth4 !== undefined && depth4.medianMs > repository.targets.depth4Ms)
    warnings.push(`graph depth 4 exceeded ${repository.targets.depth4Ms}ms`)

  return [
    {
      name: repository.name,
      source: repository.source,
      commit,
      clonePath,
      cleanBefore,
      cleanAfter,
      counts: quality.counts,
      timing: first.timing,
      api,
      issues: [
        ...quality.issues,
        ...(specHash === secondSpecHash ? [] : ["generated spec is not deterministic"]),
        ...(cleanBefore === cleanAfter ? [] : ["original repository cleanliness changed"]),
      ],
      warnings,
      deterministic: specHash === secondSpecHash,
      specHash,
      secondSpecHash,
    },
    null,
  ]
}

async function analyze(root: string): Promise<{
  runtime: AnalysisRuntime | null
  spec: GeneratedSpec | null
  timing: { milliseconds: number; rss: number }
  error: string | null
}> {
  const started = performance.now()
  const [runtime, runtimeError] = await AnalysisRuntime.create(root, { analysisRoots: [root] })
  if (runtimeError !== null || runtime === null)
    return { runtime: null, spec: null, timing: { milliseconds: 0, rss: 0 }, error: runtimeError }
  const project = runtime.currentProject()
  if (project === null)
    return {
      runtime,
      spec: null,
      timing: { milliseconds: 0, rss: 0 },
      error: "project unavailable",
    }
  const [job, jobError] = runtime.jobs.start(project)
  if (jobError !== null || job === null)
    return { runtime, spec: null, timing: { milliseconds: 0, rss: 0 }, error: jobError }
  for (let attempt = 0; attempt < 6000; attempt++) {
    const current = runtime.jobs.get(job.id)
    if (current !== null && ["succeeded", "failed", "cancelled"].includes(current.state)) break
    await Bun.sleep(100)
  }
  const finished = runtime.jobs.get(job.id)
  if (finished === null || finished.state !== "succeeded") {
    return {
      runtime,
      spec: null,
      timing: { milliseconds: performance.now() - started, rss: process.memoryUsage().rss },
      error: finished?.error ?? "analysis did not succeed",
    }
  }
  const spec = project === null ? null : runtime.spec(project)

  return {
    runtime,
    spec,
    timing: { milliseconds: performance.now() - started, rss: process.memoryUsage().rss },
    error: spec === null ? "generated spec unavailable" : null,
  }
}

async function measureApi(root: string): Promise<ApiTiming[]> {
  const server = new WorkbenchServer({ target: root, port: 0, logger: { log: () => undefined } })
  const [handle, startError] = await server.start()
  if (startError !== null || handle === null) return []
  const paths = [
    "/api/session",
    "/api/v1/projects/current/architecture",
    "/api/v1/projects/current/graph?depth=2",
    "/api/v1/projects/current/graph?depth=4",
    "/api/v1/projects/current/spec",
  ]
  const results: ApiTiming[] = []
  try {
    for (const path of paths) {
      const times: number[] = []
      let bytes = 0
      let status = 0
      for (let run = 0; run < 5; run++) {
        const started = performance.now()
        const response = await fetch(`${handle.url}${path}`)
        const body = await response.arrayBuffer()
        times.push(performance.now() - started)
        bytes = body.byteLength
        status = response.status
      }
      times.sort((left, right) => left - right)
      results.push({
        path,
        medianMs: times[2] ?? 0,
        maxMs: times.at(-1) ?? 0,
        bytes,
        status,
      })
    }
  } finally {
    handle.close()
  }

  return results
}

async function prepareClone(clonePath: string, name: string): Promise<void> {
  const excludePath = join(clonePath, ".git", "info", "exclude")
  const [existing] = await read(excludePath)
  await Bun.write(excludePath, `${existing ?? ""}\n.spec/\nspec/\nspec-framework.json\n`)
  await Bun.write(
    join(clonePath, "spec-framework.json"),
    `${JSON.stringify(
      {
        version: 1,
        project: { name },
        analysis: { roots: ["."], exclude: [], flow_analysis: true },
        diagnostics: {},
        checks: [],
      },
      null,
      2,
    )}\n`,
  )
}

async function gitClean(path: string): Promise<boolean> {
  const [status, error] = await runGit(["status", "--porcelain"], path)

  return error === null && status !== null && status.trim() === ""
}

async function runGit(
  argumentsList: string[],
  cwd: string,
): Promise<[string | null, string | null]> {
  const process = Bun.spawnSync(["git", ...argumentsList], { cwd, stdout: "pipe", stderr: "pipe" })
  if (process.exitCode !== 0) return [null, Buffer.from(process.stderr).toString("utf8").trim()]
  return [Buffer.from(process.stdout).toString("utf8"), null]
}

async function read(path: string): Promise<[string | null]> {
  const file = Bun.file(path)
  if (!(await file.exists())) return [null]

  return [await file.text()]
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

const code = await main()
process.exit(code)
