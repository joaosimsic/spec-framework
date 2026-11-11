import pkg from "../package.json"
import { runApproval } from "./approval/approve"
import { TerminalApprovalConfirmation } from "./approval/confirmation"
import { GitApproverResolver, GitCleanlinessReader } from "./approval/git"
import {
  ProposalOperationParser,
  runChange,
  runChangeStatus,
  runProposalOperations,
  runStart,
  type ProposalMode,
  type ProposalOperation,
} from "./change/index"
import { attemptAsync } from "./core/result"
import { initProject } from "./core/init"
import { formatStatuses, getToolStatuses, missingRequiredDiagnostics } from "./core/doctor"
import { runCheck } from "./core/check"
import { runMap } from "./core/map"
import { runMapReview } from "./core/map-review"
import { runBundle } from "./bundle/index"
import { runQuery, type QueryView } from "./query/index"

const HELP = `spec-framework CLI

Usage:
  spec init [--existing] [--force]
  spec doctor [--fix] [--json]
  spec check [--structural] [--json]
  spec map [--draft] [--review [--technical]] [--json]
  spec start "<goal>" [--json] [--technical]
  spec query [--id <id>] [--kind <kind>] [--status <status>] [--view <identity|experience>] [--technical] [--json] [--allow-dirty]
  spec change "<direction>" [--mode <scratch|mapping|refactor>] [--op <json|file>]... [--technical] [--json]
  spec change --op <json|file> [--op <json|file>]... [--technical] [--json]
  spec change --status [--technical] [--json]
  spec refactor "<direction>" [--op <json|file>]... [--technical] [--json]
  spec bundle [--allow-dirty] [--output <dir>] [--force] [--json]
  spec approve <ids...> [--approver <name>] [--allow-dirty]
  spec version
  spec help

Commands:
  init      Create the full-stack spec scaffold
  doctor    Report required and optional tools
  check     Run structural checks, then native checks
  map       Discover draft architecture or open a mapping review
  start     Open a scratch-mode proposal from a goal
  query     Read the unified spec graph
  change    Create or inspect a same-worktree proposal
  refactor  Alias for spec change in refactor mode
  bundle    Generate the readable audit bundle
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
  const review = hasFlag(args, "--review")
  const draft = hasFlag(args, "--draft")

  if (review) {
    if (draft) {
      console.error("map: --review cannot be combined with --draft")
      return 2
    }

    const run = await runMapReview(process.cwd(), {
      json: hasFlag(args, "--json"),
      technical: hasFlag(args, "--technical"),
    })
    printWarnings(run.warnings)
    console.log(run.output)
    return run.code
  }

  const run = await runMap(process.cwd(), {
    draft,
    json: hasFlag(args, "--json"),
  })
  console.log(run.output)
  return run.code
}

interface StartArguments {
  goal?: string
  technical: boolean
  json: boolean
  error?: string
}

function parseStartArguments(args: string[]): StartArguments {
  let goal: string | undefined
  let technical = false
  let json = false
  let index = args[0] === "start" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--json") {
      json = true
      index += 1
      continue
    }
    if (argument === "--technical") {
      technical = true
      index += 1
      continue
    }
    if (argument.startsWith("-")) {
      return { technical, json, error: `unknown start option: ${argument}` }
    }
    if (goal !== undefined) {
      return { goal, technical, json, error: "start accepts one goal" }
    }
    goal = argument
    index += 1
  }

  return { goal, technical, json }
}

async function commandStart(args: string[]): Promise<number> {
  const parsed = parseStartArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }
  if (parsed.goal === undefined) {
    console.error('usage: spec start "<goal>" [--json] [--technical]')
    return 2
  }

  const run = await runStart(process.cwd(), parsed.goal, {
    technical: parsed.technical,
    json: parsed.json,
  })
  printWarnings(run.warnings)
  console.log(run.output)
  return run.code
}

interface QueryArguments {
  id?: string
  kind?: string
  status?: string
  view: QueryView
  technical: boolean
  json: boolean
  allowDirty: boolean
  error?: string
}

function parseQueryArguments(args: string[]): QueryArguments {
  let id: string | undefined
  let kind: string | undefined
  let status: string | undefined
  let view: QueryView = "identity"
  let technical = false
  let json = false
  let allowDirty = false
  let index = args[0] === "query" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    switch (argument) {
      case "--json":
        json = true
        index += 1
        break
      case "--technical":
        technical = true
        index += 1
        break
      case "--allow-dirty":
        allowDirty = true
        index += 1
        break
      case "--view": {
        const value = args[index + 1]
        if (value !== "identity" && value !== "experience") {
          return {
            id,
            kind,
            status,
            view,
            technical,
            json,
            allowDirty,
            error: "--view requires identity or experience",
          }
        }
        view = value
        index += 2
        break
      }
      case "--id":
      case "--kind":
      case "--status": {
        const value = args[index + 1]
        if (value === undefined || value.startsWith("-")) {
          return {
            id,
            kind,
            status,
            view,
            technical,
            json,
            allowDirty,
            error: `${argument} requires a value`,
          }
        }
        if (argument === "--id") id = value
        if (argument === "--kind") kind = value
        if (argument === "--status") status = value
        index += 2
        break
      }
      default:
        if (argument.startsWith("-")) {
          return {
            id,
            kind,
            status,
            view,
            technical,
            json,
            allowDirty,
            error: `unknown query option: ${argument}`,
          }
        }
        index += 1
    }
  }

  return { id, kind, status, view, technical, json, allowDirty }
}

async function commandQuery(args: string[]): Promise<number> {
  const parsed = parseQueryArguments(args)
  if (parsed.error) {
    console.error(parsed.error)
    return 2
  }

  const run = await runQuery(process.cwd(), {
    id: parsed.id,
    kind: parsed.kind,
    status: parsed.status,
    view: parsed.view,
    technical: parsed.technical,
    json: parsed.json,
    allowDirty: parsed.allowDirty,
  })
  console.log(run.output)
  return run.code
}

interface ChangeArguments {
  direction?: string
  status: boolean
  mode?: ProposalMode
  operations: ProposalOperation[]
  technical: boolean
  json: boolean
  error?: string
}

async function readOperationSource(
  value: string,
): Promise<[ProposalOperation[] | null, string | null]> {
  const [exists, existsError] = await attemptAsync(() => Bun.file(value).exists())
  if (existsError === null && exists === true) {
    const [text, readError] = await attemptAsync(() => Bun.file(value).text())
    if (readError !== null || text === null) {
      return [null, readError === null ? `cannot read ${value}` : readError]
    }

    return ProposalOperationParser.parseJson(text)
  }

  return ProposalOperationParser.parseJson(value)
}

async function parseChangeArguments(args: string[]): Promise<ChangeArguments> {
  let direction: string | undefined
  let status = false
  let mode: ProposalMode | undefined
  const operations: ProposalOperation[] = []
  let technical = false
  let json = false
  let index = args[0] === "change" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--json") {
      json = true
      index += 1
      continue
    }
    if (argument === "--status") {
      status = true
      index += 1
      continue
    }
    if (argument === "--technical") {
      technical = true
      index += 1
      continue
    }
    if (argument === "--mode") {
      const value = args[index + 1]
      if (value !== "scratch" && value !== "mapping" && value !== "refactor") {
        return {
          status,
          operations,
          technical,
          json,
          error: "--mode requires scratch, mapping, or refactor",
        }
      }
      mode = value
      index += 2
      continue
    }
    if (argument === "--op") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("-")) {
        return { status, operations, technical, json, error: "--op requires JSON or a file path" }
      }
      const [parsed, parseError] = await readOperationSource(value)
      if (parseError !== null || parsed === null) {
        return {
          status,
          operations,
          technical,
          json,
          error: parseError ?? "cannot parse operations",
        }
      }
      operations.push(...parsed)
      index += 2
      continue
    }
    if (argument.startsWith("-")) {
      return { status, operations, technical, json, error: `unknown change option: ${argument}` }
    }
    if (direction !== undefined) {
      return { status, operations, technical, json, error: "change accepts one direction" }
    }
    direction = argument
    index += 1
  }

  if (status && direction !== undefined) {
    return { status, operations, technical, json, error: "--status does not accept a direction" }
  }

  return { direction, status, mode, operations, technical, json }
}

async function commandChange(args: string[]): Promise<number> {
  const parsed = await parseChangeArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }

  if (parsed.status) {
    const run = await runChangeStatus(process.cwd(), {
      technical: parsed.technical,
      json: parsed.json,
    })
    console.log(run.output)
    return run.code
  }

  if (parsed.direction === undefined && parsed.operations.length > 0) {
    const run = await runProposalOperations(process.cwd(), parsed.operations, {
      technical: parsed.technical,
      json: parsed.json,
    })
    printWarnings(run.warnings)
    console.log(run.output)
    return run.code
  }

  if (parsed.direction === undefined) {
    console.error('usage: spec change "<direction>" [--op <json|file>]...')
    console.error("       spec change --op <json|file> [--op <json|file>]...")
    console.error("       spec change --status [--json]")
    return 2
  }

  const run = await runChange(process.cwd(), parsed.direction, {
    mode: parsed.mode,
    operations: parsed.operations,
    technical: parsed.technical,
    json: parsed.json,
  })
  printWarnings(run.warnings)
  console.log(run.output)
  return run.code
}

async function commandRefactor(args: string[]): Promise<number> {
  const rest = args[0] === "refactor" ? args.slice(1) : args
  if (rest.includes("--mode")) {
    console.error("refactor does not accept --mode")
    return 2
  }

  return commandChange(["change", "--mode", "refactor", ...rest])
}

interface BundleArguments {
  allowDirty: boolean
  output?: string
  force: boolean
  json: boolean
  error?: string
}

function parseBundleArguments(args: string[]): BundleArguments {
  let allowDirty = false
  let output: string | undefined
  let force = false
  let json = false
  let index = args[0] === "bundle" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--allow-dirty") {
      allowDirty = true
      index += 1
      continue
    }
    if (argument === "--force") {
      force = true
      index += 1
      continue
    }
    if (argument === "--json") {
      json = true
      index += 1
      continue
    }
    if (argument === "--output") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("-")) {
        return { allowDirty, force, json, error: "--output requires a directory" }
      }
      output = value
      index += 2
      continue
    }

    return { allowDirty, force, json, error: `unknown bundle option: ${argument}` }
  }

  return { allowDirty, force, json, output }
}

async function commandBundle(args: string[]): Promise<number> {
  const parsed = parseBundleArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }

  const run = await runBundle(process.cwd(), {
    allowDirty: parsed.allowDirty,
    output: parsed.output,
    force: parsed.force,
    json: parsed.json,
  })
  console.log(run.output)
  return run.code
}

function printWarnings(warnings: string[]): void {
  for (const warning of warnings) console.error(`warning: ${warning}`)
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
    evidence: check.evidence,
  })
  console.log(run.output)
  return run.code
}

export async function main(args: string[]): Promise<number> {
  const [command = "help"] = withoutFlags(args)

  switch (command) {
    case "init":
      return commandInit(args)
    case "doctor":
      return commandDoctor(args)
    case "check":
      return commandCheck(args)
    case "map":
      return commandMap(args)
    case "start":
      return commandStart(args)
    case "query":
      return commandQuery(args)
    case "change":
      return commandChange(args)
    case "refactor":
      return commandRefactor(args)
    case "bundle":
      return commandBundle(args)
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
