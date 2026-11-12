import pkg from "../package.json"
import { runApproval } from "./approval/approve"
import { TerminalApprovalConfirmation } from "./approval/confirmation"
import { GitApproverResolver, GitCleanlinessReader } from "./approval/git"
import { ApprovalScopeLoader } from "./approval/scope"
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
import { ArchitectureModelGenerator } from "./core/architecture-generate"
import { initProject } from "./core/init"
import { formatStatuses, getToolStatuses, missingRequiredDiagnostics } from "./core/doctor"
import { ToolProvisioner, type ProvisionOutcome } from "./core/provision"
import { BunProcessRunner } from "./core/runner"
import { runCheck } from "./core/check"
import { runMap } from "./core/map"
import { runMapCheck } from "./core/map-check"
import { runMapPromote } from "./core/map-promote"
import { runMapReview } from "./core/map-review"
import { CurationParser } from "./discovery/curation-parser"
import type { CurationAction } from "./discovery/curation-types"
import { runBundle } from "./bundle/index"
import { runQuery, type QueryView } from "./query/index"
import { WorkbenchServer, WorkbenchService } from "./workbench/index"
import {
  ReadlineTerminalIO,
  TerminalCurationSession,
  TerminalMode,
  TerminalNextReporter,
  TerminalPrompt,
  TerminalProposalSession,
  TerminalRenderer,
} from "./terminal/index"
import { join } from "node:path"

const HELP = `spec-framework CLI

Usage:
  spec init [--existing] [--force]
  spec doctor [--fix] [--json]
  spec check [--structural] [--json]
  spec next [--technical] [--json]
  spec map [--draft] [--review [--interactive|--no-interactive] [--action <json|file>]...] [--promote [--scope <name>]...] [--check] [--technical] [--json]
  spec architecture generate [--check]
  spec start "<goal>" [--interactive|--no-interactive] [--json] [--technical]
  spec query [--id <id>] [--kind <kind>] [--status <status>] [--view <identity|experience>] [--technical] [--json] [--allow-dirty]
  spec change "<direction>" [--mode <scratch|mapping|refactor>] [--interactive|--no-interactive] [--op <json|file>]... [--simulate] [--technical] [--json]
  spec change [--interactive|--no-interactive] [--op <json|file>]... [--simulate] [--technical] [--json]
  spec change --status [--technical] [--json]
  spec refactor "<direction>" [--interactive|--no-interactive] [--op <json|file>]... [--simulate] [--technical] [--json]
  spec bundle [--allow-dirty] [--output <dir>] [--force] [--json]
  spec workbench [--host <host>] [--port <port>] [--allowed-origin <origin>]...
  spec approve [--scope <name>]... <ids...> [--approver <name>] [--technical] [--allow-dirty]
  spec version
  spec help

Commands:
  init      Create the full-stack spec scaffold
  doctor    Report or provision required and optional tools
  check     Run structural checks, then native checks
  next      Show the next decisions and checks in the active mode
  map       Discover draft architecture, review it, promote it, or check drift
  architecture Generate a code-derived architecture draft without touching curated sources
  start     Open a scratch-mode proposal from a goal
  query     Read the unified spec graph
  change    Create or inspect a same-worktree proposal
  refactor  Alias for spec change in refactor mode
  bundle    Generate the readable audit bundle
  workbench Start the local proposal workbench
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
  const target = process.cwd()
  const json = hasFlag(args, "--json")
  const fix = hasFlag(args, "--fix")
  let statuses = getToolStatuses(target)
  let provision: ProvisionOutcome | null = null
  let provisionFailure: string | null = null

  if (fix) {
    const [outcome, error] = await new ToolProvisioner(target, new BunProcessRunner()).provision()
    if (error !== null) {
      provisionFailure = `${error.code}: ${error.message}`
    } else if (outcome !== null) {
      provision = outcome
      statuses = outcome.statuses
    }
  }

  const missing = missingRequiredDiagnostics(statuses)

  if (json) {
    const payload: Record<string, unknown> = { tools: statuses, missing: missing.length }
    if (provision !== null) {
      payload.provision = {
        status: provision.lockStatus,
        provisioned: provision.provisioned,
        skipped: provision.skipped,
        failed: provision.failed,
      }
    }
    if (provisionFailure !== null) payload.error = provisionFailure
    console.log(JSON.stringify(payload, null, 2))
  } else {
    printProvisioning(provision, provisionFailure)
    console.log(formatStatuses(statuses))
    console.log("")
    console.log(`${missing.length} required tool(s) missing`)
  }

  if (provisionFailure !== null) return 1
  if (missing.length === 0) return 0

  return fix ? 2 : 1
}

function printProvisioning(
  provision: ProvisionOutcome | null,
  provisionFailure: string | null,
): void {
  if (provisionFailure !== null) {
    console.error(`doctor: ${provisionFailure}`)
    console.error("")
    return
  }
  if (provision === null) return

  for (const tool of provision.provisioned) {
    console.log(`provisioned ${tool.name} ${tool.version}`)
  }
  for (const item of provision.skipped) {
    console.log(`skipped ${item.name}: ${item.message} [${item.code}]`)
  }
  for (const item of provision.failed) {
    console.error(`failed ${item.name}: ${item.message} [${item.code}]`)
  }
  if (provision.provisioned.length > 0 || provision.skipped.length > 0) {
    console.log("")
  }
}

async function commandCheck(args: string[]): Promise<number> {
  const run = await runCheck(process.cwd(), {
    structural: hasFlag(args, "--structural"),
    json: hasFlag(args, "--json"),
  })
  console.log(run.output)
  return run.code
}

interface NextArguments {
  technical: boolean
  json: boolean
  error?: string
}

function parseNextArguments(args: string[]): NextArguments {
  let technical = false
  let json = false
  let index = args[0] === "next" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--technical") {
      technical = true
      index += 1
      continue
    }
    if (argument === "--json") {
      json = true
      index += 1
      continue
    }

    return { technical, json, error: `unknown next option: ${argument}` }
  }

  return { technical, json }
}

async function commandNext(args: string[]): Promise<number> {
  const parsed = parseNextArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }

  const service = new WorkbenchService(process.cwd())
  const [view, error] = await new TerminalNextReporter(service).read()
  if (error !== null || view === null) {
    console.error(`next failed: ${error ?? "no view"}`)
    return 1
  }

  if (parsed.json) {
    console.log(JSON.stringify(view, null, 2))
    return 0
  }

  const io = new ReadlineTerminalIO()
  new TerminalRenderer(io, parsed.technical).next(view.context)
  io.close()
  return 0
}

interface MapArguments {
  review: boolean
  draft: boolean
  promote: boolean
  check: boolean
  actions: CurationAction[]
  scopes: string[]
  technical: boolean
  json: boolean
  interactive?: boolean
  error?: string
}

async function readActionSource(value: string): Promise<[CurationAction[] | null, string | null]> {
  const [exists, existsError] = await attemptAsync(() => Bun.file(value).exists())
  if (existsError === null && exists === true) {
    const [text, readError] = await attemptAsync(() => Bun.file(value).text())
    if (readError !== null || text === null) {
      return [null, readError === null ? `cannot read ${value}` : readError]
    }

    return CurationParser.parseJson(text)
  }

  return CurationParser.parseJson(value)
}

async function parseMapArguments(args: string[]): Promise<MapArguments> {
  let review = false
  let draft = false
  let promote = false
  let check = false
  const actions: CurationAction[] = []
  const scopes: string[] = []
  let technical = false
  let json = false
  let interactive: boolean | undefined
  let index = args[0] === "map" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    switch (argument) {
      case "--interactive":
        interactive = true
        index += 1
        break
      case "--no-interactive":
        interactive = false
        index += 1
        break
      case "--review":
        review = true
        index += 1
        break
      case "--draft":
        draft = true
        index += 1
        break
      case "--promote":
        promote = true
        index += 1
        break
      case "--check":
        check = true
        index += 1
        break
      case "--scope": {
        const value = args[index + 1]
        if (value === undefined || value.startsWith("-")) {
          return {
            review,
            draft,
            promote,
            check,
            actions,
            scopes,
            technical,
            json,
            error: "--scope requires a name",
          }
        }
        scopes.push(value)
        index += 2
        break
      }
      case "--technical":
        technical = true
        index += 1
        break
      case "--json":
        json = true
        index += 1
        break
      case "--action": {
        const value = args[index + 1]
        if (value === undefined || value.startsWith("-")) {
          return {
            review,
            draft,
            promote,
            check,
            actions,
            scopes,
            technical,
            json,
            error: "--action requires JSON or a file path",
          }
        }
        const [parsed, parseError] = await readActionSource(value)
        if (parseError !== null || parsed === null) {
          return {
            review,
            draft,
            promote,
            check,
            actions,
            scopes,
            technical,
            json,
            error: parseError ?? "cannot parse actions",
          }
        }
        actions.push(...parsed)
        index += 2
        break
      }
      default:
        if (argument.startsWith("-")) {
          return {
            review,
            draft,
            promote,
            check,
            actions,
            scopes,
            technical,
            json,
            error: `unknown map option: ${argument}`,
          }
        }
        index += 1
    }
  }

  return { review, draft, promote, check, actions, scopes, technical, json, interactive }
}

async function commandMap(args: string[]): Promise<number> {
  const parsed = await parseMapArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }

  if (parsed.actions.length > 0 && !parsed.review) {
    console.error("map: --action requires --review")
    return 2
  }

  if (parsed.interactive === true && parsed.json) {
    console.error("map: --interactive cannot be combined with --json")
    return 2
  }

  if (parsed.interactive === true && parsed.actions.length > 0) {
    console.error("map: --interactive cannot be combined with --action")
    return 2
  }

  if (parsed.review && (parsed.promote || parsed.check || parsed.draft)) {
    console.error("map: --review cannot be combined with --promote, --check, or --draft")
    return 2
  }

  if (parsed.promote && (parsed.check || parsed.draft)) {
    console.error("map: --promote cannot be combined with --check or --draft")
    return 2
  }

  if (parsed.check && parsed.draft) {
    console.error("map: --check cannot be combined with --draft")
    return 2
  }

  if (parsed.scopes.length > 0 && !parsed.promote) {
    console.error("map: --scope requires --promote")
    return 2
  }

  if (parsed.check) {
    const run = await runMapCheck(process.cwd(), {
      json: parsed.json,
      technical: parsed.technical,
    })
    console.log(run.output)
    return run.code
  }

  if (parsed.promote) {
    const run = await runMapPromote(process.cwd(), {
      scopes: parsed.scopes,
      json: parsed.json,
      technical: parsed.technical,
    })
    console.log(run.output)
    return run.code
  }

  if (parsed.review) {
    if (parsed.draft) {
      console.error("map: --review cannot be combined with --draft")
      return 2
    }

    const run = await runMapReview(process.cwd(), {
      actions: parsed.actions,
      json: parsed.json,
      technical: parsed.technical,
    })
    printWarnings(run.warnings)
    console.log(run.output)
    if (run.code !== 0) return run.code

    const interactive = TerminalMode.resolve({
      interactive: parsed.interactive,
      json: parsed.json,
      scripted: parsed.actions.length > 0,
    })
    if (interactive) return runCurationSession(process.cwd(), parsed.technical)

    return run.code
  }

  const run = await runMap(process.cwd(), {
    draft: parsed.draft,
    json: parsed.json,
  })
  console.log(run.output)
  return run.code
}

interface StartArguments {
  goal?: string
  technical: boolean
  json: boolean
  interactive?: boolean
  error?: string
}

function parseStartArguments(args: string[]): StartArguments {
  let goal: string | undefined
  let technical = false
  let json = false
  let interactive: boolean | undefined
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
    if (argument === "--interactive") {
      interactive = true
      index += 1
      continue
    }
    if (argument === "--no-interactive") {
      interactive = false
      index += 1
      continue
    }
    if (argument.startsWith("-")) {
      return { technical, json, interactive, error: `unknown start option: ${argument}` }
    }
    if (goal !== undefined) {
      return { goal, technical, json, interactive, error: "start accepts one goal" }
    }
    goal = argument
    index += 1
  }

  return { goal, technical, json, interactive }
}

async function commandStart(args: string[]): Promise<number> {
  const parsed = parseStartArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }
  if (parsed.goal === undefined) {
    console.error(
      'usage: spec start "<goal>" [--interactive|--no-interactive] [--json] [--technical]',
    )
    return 2
  }
  if (parsed.interactive === true && parsed.json) {
    console.error("start: --interactive cannot be combined with --json")
    return 2
  }

  const run = await runStart(process.cwd(), parsed.goal, {
    technical: parsed.technical,
    json: parsed.json,
  })
  printWarnings(run.warnings)
  console.log(run.output)
  if (run.code !== 0) return run.code

  const interactive = TerminalMode.resolve({
    interactive: parsed.interactive,
    json: parsed.json,
    scripted: false,
  })
  if (interactive) return runProposalSession(process.cwd(), true, parsed.technical)

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
  simulate: boolean
  technical: boolean
  json: boolean
  interactive?: boolean
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
  let simulate = false
  let technical = false
  let json = false
  let interactive: boolean | undefined
  let index = args[0] === "change" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--json") {
      json = true
      index += 1
      continue
    }
    if (argument === "--interactive") {
      interactive = true
      index += 1
      continue
    }
    if (argument === "--no-interactive") {
      interactive = false
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
    if (argument === "--simulate") {
      simulate = true
      index += 1
      continue
    }
    if (argument === "--mode") {
      const value = args[index + 1]
      if (value !== "scratch" && value !== "mapping" && value !== "refactor") {
        return {
          status,
          operations,
          simulate,
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
        return {
          status,
          operations,
          simulate,
          technical,
          json,
          error: "--op requires JSON or a file path",
        }
      }
      const [parsed, parseError] = await readOperationSource(value)
      if (parseError !== null || parsed === null) {
        return {
          status,
          operations,
          simulate,
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
      return {
        status,
        operations,
        simulate,
        technical,
        json,
        error: `unknown change option: ${argument}`,
      }
    }
    if (direction !== undefined) {
      return {
        status,
        operations,
        simulate,
        technical,
        json,
        error: "change accepts one direction",
      }
    }
    direction = argument
    index += 1
  }

  if (status && direction !== undefined) {
    return {
      status,
      operations,
      simulate,
      technical,
      json,
      error: "--status does not accept a direction",
    }
  }

  return { direction, status, mode, operations, simulate, technical, json, interactive }
}

async function commandChange(args: string[]): Promise<number> {
  const parsed = await parseChangeArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }

  if (parsed.interactive === true && parsed.json) {
    console.error("change: --interactive cannot be combined with --json")
    return 2
  }

  if (parsed.interactive === true && parsed.operations.length > 0) {
    console.error("change: --interactive cannot be combined with --op")
    return 2
  }

  const interactive = TerminalMode.resolve({
    interactive: parsed.interactive,
    json: parsed.json,
    scripted: parsed.operations.length > 0 || parsed.status,
  })

  if (parsed.status) {
    if (parsed.interactive === true) {
      console.error("change: --interactive cannot be combined with --status")
      return 2
    }

    const run = await runChangeStatus(process.cwd(), {
      technical: parsed.technical,
      json: parsed.json,
    })
    console.log(run.output)
    return run.code
  }

  if (parsed.direction === undefined && parsed.operations.length > 0) {
    const run = await runProposalOperations(process.cwd(), parsed.operations, {
      simulate: parsed.simulate,
      technical: parsed.technical,
      json: parsed.json,
    })
    printWarnings(run.warnings)
    console.log(run.output)
    return run.code
  }

  if (parsed.direction === undefined) {
    if (interactive) return runProposalSession(process.cwd(), true, parsed.technical)

    console.error('usage: spec change "<direction>" [--interactive] [--op <json|file>]...')
    console.error("       spec change [--interactive] [--op <json|file>]...")
    console.error("       spec change --status [--json]")
    return 2
  }

  const run = await runChange(process.cwd(), parsed.direction, {
    mode: parsed.mode,
    operations: parsed.operations,
    simulate: parsed.simulate,
    technical: parsed.technical,
    json: parsed.json,
  })
  printWarnings(run.warnings)
  console.log(run.output)
  if (run.code !== 0) return run.code

  if (interactive) {
    return runProposalSession(process.cwd(), true, parsed.technical)
  }

  return run.code
}

async function commandRefactor(args: string[]): Promise<number> {
  const rest = args[0] === "refactor" ? args.slice(1) : args
  if (rest.includes("--mode")) {
    console.error("refactor does not accept --mode")
    return 2
  }

  return commandChange([
    "change",
    "--mode",
    "refactor",
    ...(rest.includes("--simulate") ? rest : ["--simulate", ...rest]),
  ])
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

interface WorkbenchArguments {
  host: string
  port: number
  allowedOrigins: string[]
  error?: string
}

function parseWorkbenchArguments(args: string[]): WorkbenchArguments {
  let host = "127.0.0.1"
  let port = 4173
  const allowedOrigins: string[] = []
  let index = args[0] === "workbench" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--host") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("-")) {
        return { host, port, allowedOrigins, error: "--host requires a value" }
      }
      host = value
      index += 2
      continue
    }
    if (argument === "--port") {
      const value = args[index + 1]
      const parsed = value === undefined ? Number.NaN : Number(value)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
        return { host, port, allowedOrigins, error: "--port requires a valid port" }
      }
      port = parsed
      index += 2
      continue
    }
    if (argument === "--allowed-origin") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("-")) {
        return { host, port, allowedOrigins, error: "--allowed-origin requires a value" }
      }
      allowedOrigins.push(value)
      index += 2
      continue
    }

    return { host, port, allowedOrigins, error: `unknown workbench option: ${argument}` }
  }

  return { host, port, allowedOrigins }
}

async function commandWorkbench(args: string[]): Promise<number> {
  const parsed = parseWorkbenchArguments(args)
  if (parsed.error !== undefined) {
    console.error(parsed.error)
    return 2
  }

  const assets = join(import.meta.dir, "workbench", "web", "dist", "index.html")
  const [assetReady, assetError] = await attemptAsync(() => Bun.file(assets).exists())
  if (assetError !== null) {
    console.error(`workbench: cannot read assets: ${assetError}`)
    return 1
  }
  if (assetReady !== true) {
    console.error("workbench: assets are not built; run bun run build:workbench")
  }

  const server = new WorkbenchServer({
    target: process.cwd(),
    host: parsed.host,
    port: parsed.port,
    allowedOrigins: parsed.allowedOrigins,
  })
  const [handle, startError] = await server.start()
  if (startError !== null || handle === null) {
    console.error(`workbench: ${startError ?? "server did not start"}`)
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

function printWarnings(warnings: string[]): void {
  for (const warning of warnings) console.error(`warning: ${warning}`)
}

async function runCurationSession(target: string, technical: boolean): Promise<number> {
  const io = new ReadlineTerminalIO()
  const prompt = new TerminalPrompt(io)
  const renderer = new TerminalRenderer(io, technical)
  const session = new TerminalCurationSession(new WorkbenchService(target), prompt, renderer, io)
  const [view, error] = await session.run()
  io.close()
  if (error !== null) {
    console.error(`interactive curation failed: ${error}`)
    return 1
  }
  if (view === null) {
    console.error("interactive curation failed")
    return 1
  }

  return 0
}

async function runProposalSession(
  target: string,
  simulate: boolean,
  technical: boolean,
): Promise<number> {
  const io = new ReadlineTerminalIO()
  const prompt = new TerminalPrompt(io)
  const renderer = new TerminalRenderer(io, technical)
  const session = new TerminalProposalSession(
    new WorkbenchService(target),
    prompt,
    renderer,
    io,
    simulate,
  )
  const [view, error] = await session.run()
  io.close()
  if (error !== null) {
    console.error(`interactive proposal failed: ${error}`)
    return 1
  }
  if (view === null) {
    console.error("interactive proposal failed")
    return 1
  }

  return 0
}

interface ApproveArguments {
  ids: string[]
  scopes: string[]
  approver?: string
  technical: boolean
  allowDirty: boolean
  error?: string
}

function parseApproveArguments(args: string[]): ApproveArguments {
  const ids: string[] = []
  const scopes: string[] = []
  let approver: string | undefined
  let technical = false
  let allowDirty = false
  let index = args[0] === "approve" ? 1 : 0

  while (index < args.length) {
    const argument = args[index]
    if (argument === "--approver") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("-")) {
        return { ids, scopes, technical, allowDirty, error: "--approver requires a name" }
      }
      approver = value
      index += 2
      continue
    }
    if (argument === "--scope") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("-")) {
        return { ids, scopes, technical, allowDirty, error: "--scope requires a name" }
      }
      scopes.push(value)
      index += 2
      continue
    }
    if (argument === "--technical") {
      technical = true
      index += 1
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

  return { ids, scopes, approver, technical, allowDirty }
}

async function commandApprove(args: string[]): Promise<number> {
  const parsed = parseApproveArguments(args)
  if (parsed.error) {
    console.error(parsed.error)
    return 2
  }
  if (parsed.ids.length === 0 && parsed.scopes.length === 0) {
    console.error(
      "usage: spec approve [--scope <name>]... <ids...> [--approver <name>] [--technical] [--allow-dirty]",
    )
    return 2
  }

  const target = process.cwd()
  const check = await runCheck(target, { verifyApprovals: false })
  if (check.result.errors > 0) {
    console.log(check.output)
    return 1
  }

  const [scope, scopeError] =
    parsed.scopes.length === 0
      ? [{ ids: [], labels: {} }, null]
      : await new ApprovalScopeLoader(target).resolve(parsed.scopes)
  if (scopeError !== null || scope === null) {
    console.error(scopeError ?? "approval scope resolution failed")
    return 1
  }

  const resolvedIds = scope.ids.filter((id) => !parsed.ids.includes(id))
  const requestedIds = [...parsed.ids, ...resolvedIds]

  const [approver, identityError] = await new GitApproverResolver().resolve(parsed.approver)
  if (identityError !== null || approver === null) {
    console.error(identityError ?? "approver identity unavailable")
    return 1
  }

  const run = await runApproval(target, requestedIds, {
    approver,
    allowDirty: parsed.allowDirty,
    confirmation: new TerminalApprovalConfirmation(),
    gitStatus: new GitCleanlinessReader(),
    evidence: check.evidence,
    labels: scope.labels,
    technical: parsed.technical,
  })
  console.log(run.output)
  return run.code
}

async function commandArchitecture(args: string[]): Promise<number> {
  const target = process.cwd()
  const check = hasFlag(args, "--check") || args.includes("check")
  const generator = new ArchitectureModelGenerator(target)

  if (check) {
    const [run, error] = await generator.check()
    if (error !== null || run === null) {
      console.error(error ?? "architecture check failed")
      return 1
    }
    console.log(run.output)
    return run.code
  }

  const [run, error] = await generator.write()
  if (error !== null || run === null) {
    console.error(error ?? "architecture generation failed")
    return 1
  }
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
    case "next":
      return commandNext(args)
    case "map":
      return commandMap(args)
    case "architecture":
      return commandArchitecture(args)
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
    case "workbench":
      return commandWorkbench(args)
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
