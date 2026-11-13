import pkg from "../package.json"
import { GeneratedBundleWriter } from "./bundle"
import { GeneratedCheck, VerificationRunRecorder } from "./checks"
import { InterpretationRunner } from "./interpretations"
import { GeneratedQuery, conceptualElements } from "./query"
import { GeneratedSpecWriter, type GeneratedSpec } from "./spec"
import { AnalysisRuntime } from "./workbench/analysis-runtime"
import { WorkbenchServer } from "./workbench/index"

const HELP = `spec-framework CLI

Usage:
  spec doctor [--json]
  spec analyze [--analysis-root <path>]... [--json]
  spec generate [--json]
  spec generated show <section> [--json]
  spec projects [list|add <path>|remove <id>] [--json]
  spec snapshots [list|show <id>|compare <from> <to>] [--json]
  spec export [--json]
  spec query [--name <text>] [--kind <kind>] [--section <name>] [--json]
  spec check [--json]
  spec interpret [--kind contract|verification|all] [--json]
  spec bundle [--output <dir>] [--force] [--json]
  spec workbench [--host <host>] [--port <port>] [--allowed-origin <origin>]... [--analysis-root <path>]...
  spec version
  spec help

Retired: init, map, architecture, start, change, refactor, next, approve.
`

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function withoutFlags(args: string[]): string[] {
  return args.filter((argument) => !argument.startsWith("-"))
}

function analysisRoots(args: string[]): string[] {
  const roots: string[] = []
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--analysis-root") continue
    const value = args[index + 1]
    if (value !== undefined && !value.startsWith("-")) roots.push(value)
  }

  return roots
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]

  return value === undefined || value.startsWith("-") ? undefined : value
}

async function commandDoctor(args: string[]): Promise<number> {
  const git = Bun.which("git")
  const bun = Bun.which("bun")
  const checks = [
    { name: "bun", available: bun !== null, path: bun },
    { name: "git", available: git !== null, path: git },
    {
      name: "spec-framework.json",
      available: await Bun.file("spec-framework.json").exists(),
      path: "spec-framework.json",
    },
  ]
  if (hasFlag(args, "--json")) {
    console.log(JSON.stringify({ checks }, null, 2))
  } else {
    for (const check of checks) console.log(`${check.available ? "ok" : "missing"}  ${check.name}`)
  }

  return checks.every((check) => check.available) ? 0 : 1
}

async function commandAnalyze(args: string[]): Promise<number> {
  const json = hasFlag(args, "--json")
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`analyze: ${runtimeError ?? "analysis runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  if (project === null) {
    runtime.close()
    console.error("analyze: project unavailable")
    return 1
  }
  const [job, jobError] = runtime.jobs.start(project)
  if (jobError !== null || job === null) {
    runtime.close()
    console.error(`analyze: ${jobError ?? "analysis did not start"}`)
    return 1
  }
  let phase = ""
  let current = job
  for (let attempt = 0; attempt < 6000; attempt++) {
    const next = runtime.jobs.get(job.id)
    if (next !== null) current = next
    if (!json && current.phase !== phase) {
      console.log(`${current.phase}: ${current.message}`)
      phase = current.phase
    }
    if (["succeeded", "failed", "cancelled"].includes(current.state)) break
    await Bun.sleep(50)
  }
  const spec = current.snapshotId === null ? null : runtime.generatedSpecs.find(current.snapshotId)
  if (json)
    console.log(
      JSON.stringify(
        { job: current, snapshot: current.snapshotId, spec: spec?.snapshot ?? null },
        null,
        2,
      ),
    )
  else if (current.state === "succeeded") {
    console.log(`analysis complete: ${current.snapshotId ?? "no snapshot"}`)
    if (spec !== null) {
      console.log(
        `${conceptualElements(spec).length} conceptual elements, ${spec.requirements.length} behavior records, ${spec.findings.length} findings`,
      )
    }
  } else console.error(`analysis ${current.state}: ${current.error ?? current.message}`)
  runtime.close()

  return current.state === "succeeded" ? 0 : 1
}

async function commandGenerate(args: string[]): Promise<number> {
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`generate: ${runtimeError ?? "analysis runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  const spec = project === null ? null : runtime.spec(project)
  if (project === null || spec === null) {
    runtime.close()
    console.error("generate: no generated snapshot is available")
    return 1
  }
  const [path, writeError] = await new GeneratedSpecWriter(project.repositoryPath).write(spec)
  runtime.close()
  if (writeError !== null || path === null) {
    console.error(`generate: ${writeError ?? "write failed"}`)
    return 1
  }
  if (hasFlag(args, "--json")) console.log(JSON.stringify({ path }, null, 2))
  else console.log(`generated ${path}`)

  return 0
}

async function commandGenerated(args: string[]): Promise<number> {
  const positional = withoutFlags(args).slice(1)
  if (positional[0] !== "show" || positional[1] === undefined) {
    console.error("generated show requires a section")
    return 2
  }
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`generated: ${runtimeError ?? "runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  const spec = project === null ? null : runtime.spec(project)
  runtime.close()
  if (spec === null) {
    console.error("generated: no generated spec is available")
    return 1
  }
  const value = section(spec, positional[1])
  if (value === null) {
    console.error(`generated: unknown section ${positional[1]}`)
    return 1
  }
  console.log(JSON.stringify(value, null, 2))

  return 0
}

function section(spec: GeneratedSpec, name: string): unknown {
  const values: Record<string, unknown> = {
    project: spec.project,
    snapshot: spec.snapshot,
    architecture: spec.architecture,
    implementation: spec.implementation,
    mappings: spec.mappings,
    hypotheses: spec.hypotheses,
    requirements: spec.requirements,
    contracts: spec.contracts,
    verification: spec.verification,
    flows: spec.flows,
    findings: spec.findings,
    evidence: spec.evidence,
    unknowns: spec.unknowns,
  }

  return values[name] ?? null
}

async function commandProjects(args: string[]): Promise<number> {
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`projects: ${runtimeError ?? "runtime unavailable"}`)
    return 1
  }
  const positional = withoutFlags(args).slice(1)
  const action = positional[0] ?? "list"
  if (action === "add") {
    const path = positional[1]
    if (path === undefined) {
      runtime.close()
      console.error("projects add requires a path")
      return 2
    }
    const [project, error] = await runtime.projects.register({ repositoryPath: path })
    runtime.close()
    if (error !== null || project === null) {
      console.error(`projects: ${error ?? "registration failed"}`)
      return 1
    }
    console.log(`registered ${project.name} (${project.id})`)
    return 0
  }
  if (action === "remove") {
    const id = positional[1]
    if (id === undefined) {
      runtime.close()
      console.error("projects remove requires an id")
      return 2
    }
    const [, error] = runtime.projects.remove(id)
    runtime.close()
    if (error !== null) {
      console.error(`projects: ${error}`)
      return 1
    }
    console.log(`removed ${id}`)
    return 0
  }
  const projects = runtime.projects.list()
  runtime.close()
  if (hasFlag(args, "--json")) console.log(JSON.stringify(projects, null, 2))
  else
    for (const project of projects)
      console.log(`${project.id}  ${project.name}  ${project.repositoryPath}`)

  return 0
}

async function commandSnapshots(args: string[]): Promise<number> {
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`snapshots: ${runtimeError ?? "runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  if (project === null) {
    runtime.close()
    console.error("snapshots: project unavailable")
    return 1
  }
  const positional = withoutFlags(args).slice(1)
  const action = positional[0] ?? "list"
  if (action === "compare") {
    const fromId = positional[1]
    const toId = positional[2]
    if (fromId === undefined || toId === undefined) {
      runtime.close()
      console.error("snapshots compare requires two snapshot ids")
      return 2
    }
    const comparison = runtime.compare(fromId, toId)
    runtime.close()
    if (comparison === null) {
      console.error("snapshots: comparison unavailable")
      return 1
    }
    console.log(JSON.stringify(comparison, null, 2))
    return 0
  }
  if (action === "show") {
    const id = positional[1]
    const snapshot = id === undefined ? null : runtime.snapshots.find(id)
    runtime.close()
    if (snapshot === null) {
      console.error("snapshots: snapshot not found")
      return 1
    }
    console.log(JSON.stringify(snapshot, null, 2))
    return 0
  }
  const snapshots = runtime.snapshots.list(project.id)
  runtime.close()
  if (hasFlag(args, "--json")) console.log(JSON.stringify(snapshots, null, 2))
  else
    for (const snapshot of snapshots)
      console.log(`${snapshot.id}  ${snapshot.commit.slice(0, 8)}  ${snapshot.nodeCount} nodes`)

  return 0
}

async function commandExport(args: string[]): Promise<number> {
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`export: ${runtimeError ?? "runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  const spec = project === null ? null : runtime.spec(project)
  if (project === null || spec === null) {
    runtime.close()
    console.error("export: no generated spec is available")
    return 1
  }
  const [path, error] = await new GeneratedSpecWriter(project.repositoryPath).write(spec)
  runtime.close()
  if (error !== null || path === null) {
    console.error(`export: ${error ?? "export failed"}`)
    return 1
  }
  if (hasFlag(args, "--json"))
    console.log(JSON.stringify({ path, snapshot_id: spec.snapshot.id }, null, 2))
  else console.log(`exported ${path}`)

  return 0
}

async function commandQuery(args: string[]): Promise<number> {
  const [run, error] = await new GeneratedQuery(process.cwd()).run({
    json: hasFlag(args, "--json"),
    name: option(args, "--name"),
    kind: option(args, "--kind"),
    section: option(args, "--section"),
  })
  if (error !== null || run === null) {
    console.error(`query: ${error ?? "query failed"}`)
    return 1
  }
  console.log(run.output)
  return run.code
}

async function commandCheck(args: string[]): Promise<number> {
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`check: ${runtimeError ?? "runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  const spec = project === null ? null : runtime.spec(project)
  if (project === null || spec === null) {
    runtime.close()
    console.error("check: no generated spec is available")
    return 1
  }
  const snapshot = runtime.latest(project)
  if (snapshot === null) {
    runtime.close()
    console.error("check: no analysis snapshot is available")
    return 1
  }
  const [result, checkError] = await new GeneratedCheck().run(project.repositoryPath, spec)
  if (checkError !== null || result === null) {
    runtime.close()
    console.error(`check: ${checkError ?? "check failed"}`)
    return 1
  }
  const [verification, verificationError] = await new VerificationRunRecorder(
    runtime.verificationRuns,
  ).record(project.repositoryPath, { project, snapshot, spec, check: result })
  runtime.close()
  if (verificationError !== null || verification === null) {
    console.error(`check: ${verificationError ?? "verification run was not saved"}`)
    return 1
  }
  if (hasFlag(args, "--json")) console.log(JSON.stringify({ ...result, verification }, null, 2))
  else
    console.log(
      [
        `errors: ${result.errors}`,
        `warnings: ${result.warnings}`,
        `verification: ${verification.run.id} (${verification.run.result})`,
        ...result.findings,
        ...result.output,
      ].join("\n"),
    )

  return result.errors === 0 ? 0 : 1
}

async function commandInterpret(args: string[]): Promise<number> {
  const requested = option(args, "--kind") ?? "all"
  if (requested !== "contract" && requested !== "verification" && requested !== "all") {
    console.error("interpret: --kind must be contract, verification, or all")
    return 2
  }
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`interpret: ${runtimeError ?? "runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  const spec = project === null ? null : runtime.spec(project)
  const snapshot = project === null ? null : runtime.latest(project)
  const interpreter = runtime.interpreter()
  if (project === null || spec === null || snapshot === null) {
    runtime.close()
    console.error("interpret: no generated spec is available")
    return 1
  }
  if (interpreter === null) {
    runtime.close()
    console.error("interpret: AI is not configured")
    return 1
  }
  const verification = requested === "contract" ? null : runtime.latestVerification(project)
  if (requested !== "contract" && verification === null) {
    runtime.close()
    console.error("interpret: no verification run is available; run spec check first")
    return 1
  }
  const [result, error] = await new InterpretationRunner(
    interpreter,
    runtime.interpretationRuns,
  ).run({
    root: project.repositoryPath,
    project,
    snapshot,
    spec,
    kind: requested,
    verification,
    elements: runtime.elements.list(snapshot.id),
    relationships: runtime.relationships.list(snapshot.id),
    files: runtime.artifacts.list(snapshot.id).map((artifact) => artifact.path),
  })
  runtime.close()
  if (error !== null || result === null) {
    console.error(`interpret: ${error ?? "interpretation failed"}`)
    return 1
  }
  if (hasFlag(args, "--json")) console.log(JSON.stringify(result, null, 2))
  else
    console.log(
      [
        `interpretations: ${result.interpretations.length}`,
        `failures: ${result.run.failures.length}`,
        ...result.interpretations.map(
          (item) => `${item.targetKind} ${item.targetId}: ${item.text}`,
        ),
        ...result.run.failures,
      ].join("\n"),
    )

  return result.run.failures.length === 0 ? 0 : 1
}

async function commandBundle(args: string[]): Promise<number> {
  const [runtime, runtimeError] = await AnalysisRuntime.create(process.cwd(), {
    analysisRoots: analysisRoots(args),
  })
  if (runtimeError !== null || runtime === null) {
    console.error(`bundle: ${runtimeError ?? "runtime unavailable"}`)
    return 1
  }
  const project = runtime.currentProject()
  const spec = project === null ? null : runtime.spec(project)
  if (project === null || spec === null) {
    runtime.close()
    console.error("bundle: no generated spec is available")
    return 1
  }
  const [result, error] = await new GeneratedBundleWriter().write(project.repositoryPath, spec, {
    output: option(args, "--output"),
    force: hasFlag(args, "--force"),
    verification: runtime.latestVerification(project),
    interpretations: runtime.latestInterpretation(project),
  })
  runtime.close()
  if (error !== null || result === null) {
    console.error(`bundle: ${error ?? "bundle failed"}`)
    return 1
  }
  if (hasFlag(args, "--json")) console.log(JSON.stringify(result, null, 2))
  else console.log(`bundle ${result.path}`)

  return 0
}

interface WorkbenchArguments {
  host: string
  port: number
  allowedOrigins: string[]
  analysisRoots: string[]
  error?: string
}

function parseWorkbenchArguments(args: string[]): WorkbenchArguments {
  let host = "127.0.0.1"
  let port = 4173
  const allowedOrigins: string[] = []
  const roots: string[] = []
  let index = args[0] === "workbench" ? 1 : 0
  while (index < args.length) {
    const argument = args[index]
    if (argument === "--host") {
      host = args[index + 1] ?? host
      index += 2
      continue
    }
    if (argument === "--port") {
      const parsed = Number(args[index + 1])
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535)
        return { host, port, allowedOrigins, analysisRoots: roots, error: "invalid port" }
      port = parsed
      index += 2
      continue
    }
    if (argument === "--allowed-origin") {
      const value = args[index + 1]
      if (value === undefined)
        return { host, port, allowedOrigins, analysisRoots: roots, error: "missing origin" }
      allowedOrigins.push(value)
      index += 2
      continue
    }
    if (argument === "--analysis-root") {
      const value = args[index + 1]
      if (value === undefined)
        return { host, port, allowedOrigins, analysisRoots: roots, error: "missing analysis root" }
      roots.push(value)
      index += 2
      continue
    }
    return {
      host,
      port,
      allowedOrigins,
      analysisRoots: roots,
      error: `unknown workbench option: ${argument}`,
    }
  }

  return { host, port, allowedOrigins, analysisRoots: roots }
}

async function commandWorkbench(args: string[]): Promise<number> {
  const parsed = parseWorkbenchArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }
  const server = new WorkbenchServer({
    target: process.cwd(),
    host: parsed.host,
    port: parsed.port,
    allowedOrigins: parsed.allowedOrigins,
    analysisRoots: parsed.analysisRoots,
  })
  const [handle, error] = await server.start()
  if (error !== null || handle === null) {
    console.error(`workbench: ${error ?? "server did not start"}`)
    return 1
  }
  console.log(`workbench: ${handle.url}`)
  console.log("workbench: press Ctrl-C to stop")

  return new Promise<number>((resolve) => {
    const stop = (): void => {
      handle.close()
      resolve(0)
    }
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
  })
}

const RETIRED = new Set([
  "init",
  "map",
  "architecture",
  "start",
  "change",
  "refactor",
  "next",
  "approve",
])

export async function main(args: string[]): Promise<number> {
  const [command = "help"] = withoutFlags(args)
  if (RETIRED.has(command)) {
    console.error(`retired command: ${command}. Use spec analyze and generated output.`)
    return 2
  }
  switch (command) {
    case "doctor":
      return commandDoctor(args)
    case "analyze":
      return commandAnalyze(args)
    case "generate":
      return commandGenerate(args)
    case "generated":
      return commandGenerated(args)
    case "projects":
      return commandProjects(args)
    case "snapshots":
      return commandSnapshots(args)
    case "export":
      return commandExport(args)
    case "query":
      return commandQuery(args)
    case "check":
      return commandCheck(args)
    case "interpret":
      return commandInterpret(args)
    case "bundle":
      return commandBundle(args)
    case "workbench":
      return commandWorkbench(args)
    case "version":
      console.log(pkg.version)
      return 0
    case "help":
    case "--help":
    case "-h":
      console.log(HELP)
      return 0
    default:
      console.error(`unknown command: ${command}`)
      console.error(HELP)
      return 2
  }
}
