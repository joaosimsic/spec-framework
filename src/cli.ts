import pkg from "../package.json"
import { initProject } from "./core/init"
import { formatStatuses, getToolStatuses, missingRequiredDiagnostics } from "./core/doctor"
import { runCheck } from "./core/check"
import { runMap } from "./core/map"

const HELP = `spec-framework CLI

Usage:
  spec init [--existing] [--force]
  spec doctor [--fix] [--json]
  spec check [--structural] [--json]
  spec map [--draft] [--json]
  spec version
  spec help

Commands:
  init      Create the full-stack spec scaffold
  doctor    Report required and optional tools
  check     Run structural checks, then native checks
  map       Discover draft architecture from the repository
  version   Print the CLI version
  help      Show this help
`

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function withoutFlags(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("-"))
}

async function commandInit(args: string[]): Promise<number> {
  const target = process.cwd()
  const existing = hasFlag(args, "--existing")
  const force = hasFlag(args, "--force")

  try {
    const created = await initProject(target, { existing, force })
    console.log(`initialized ${target}`)
    console.log(`profile: full${existing ? " (existing project)" : ""}`)
    for (const path of created) console.log(`created ${path}`)
    console.log("next: spec check --structural")
    return 0
  } catch (error) {
    console.error(`init failed: ${(error as Error).message}`)
    return 1
  }
}

async function commandDoctor(args: string[]): Promise<number> {
  const statuses = getToolStatuses()
  const missing = missingRequiredDiagnostics(statuses)
  const json = hasFlag(args, "--json")
  const fix = hasFlag(args, "--fix")

  if (json) {
    console.log(JSON.stringify({ tools: statuses, missing: missing.length }, null, 2))
  } else {
    console.log(formatStatuses(statuses))
    console.log("")
    console.log(`${missing.length} required tool(s) missing`)
  }

  if (missing.length === 0) return 0

  if (fix) {
    console.error("")
    console.error("provisioning plan (automatic execution is not implemented in this skeleton):")
    for (const item of missing) console.error(`- ${item.message}`)
    return 2
  }

  return 1
}

async function commandCheck(args: string[]): Promise<number> {
  const run = await runCheck(process.cwd(), {
    structural: hasFlag(args, "--structural"),
    json: hasFlag(args, "--json"),
  })
  console.log(run.output)
  return run.code
}

async function commandMap(args: string[]): Promise<number> {
  const run = await runMap(process.cwd(), {
    draft: hasFlag(args, "--draft"),
    json: hasFlag(args, "--json"),
  })
  console.log(run.output)
  return run.code
}

export async function main(args: string[]): Promise<number> {
  const [command = "help", ...rest] = withoutFlags(args)

  switch (command) {
    case "init":
      return commandInit(args)
    case "doctor":
      return commandDoctor(args)
    case "check":
      return commandCheck(args)
    case "map":
      return commandMap(args)
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
