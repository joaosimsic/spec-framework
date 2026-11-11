import pkg from "../package.json"
import { runApproval } from "./approval/approve"
import { TerminalApprovalConfirmation } from "./approval/confirmation"
import { GitApproverResolver, GitCleanlinessReader } from "./approval/git"
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
  spec approve <ids...> [--approver <name>] [--allow-dirty]
  spec version
  spec help

Commands:
  init      Create the full-stack spec scaffold
  doctor    Report required and optional tools
  check     Run structural checks, then native checks
  map       Discover draft architecture from the repository
  approve   Hash-lock proposed elements after human confirmation
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

interface ApproveArguments {
  ids: string[]
  approver?: string
  allowDirty: boolean
  error?: string
}

function parseApproveArguments(args: string[]): ApproveArguments {
  const ids: string[] = []
  let approver: string | undefined
  let allowDirty = false
  let index = args[0] === "approve" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--approver") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("-")) {
        return { ids, allowDirty, error: "--approver requires a name" }
      }
      approver = value
      index += 2
      continue
    }
    if (argument === "--allow-dirty") {
      allowDirty = true
      index += 1
      continue
    }
    if (argument.startsWith("-")) {
      index += 1
      continue
    }

    ids.push(argument)
    index += 1
  }

  return { ids, approver, allowDirty }
}

async function commandApprove(args: string[]): Promise<number> {
  const parsed = parseApproveArguments(args)
  if (parsed.error) {
    console.error(parsed.error)
    return 2
  }
  if (parsed.ids.length === 0) {
    console.error("usage: spec approve <ids...> [--approver <name>] [--allow-dirty]")
    return 2
  }

  const target = process.cwd()
  const check = await runCheck(target, { verifyApprovals: false })
  if (check.result.errors > 0) {
    console.log(check.output)
    return 1
  }

  const [approver, identityError] = await new GitApproverResolver().resolve(parsed.approver)
  if (identityError !== null || approver === null) {
    console.error(identityError ?? "approver identity unavailable")
    return 1
  }

  const run = await runApproval(target, parsed.ids, {
    approver,
    allowDirty: parsed.allowDirty,
    confirmation: new TerminalApprovalConfirmation(),
    gitStatus: new GitCleanlinessReader(),
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
    case "approve":
      return commandApprove(args)
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
