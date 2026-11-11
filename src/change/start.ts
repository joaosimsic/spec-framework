import { SpecLockLoader } from "../approval/lock"
import { SpecConfigLoader } from "../core/config"
import type { ProcessRunner, ToolLocator } from "../core/runner"
import { runChange, type ProposalGit } from "./change"
import { StartReportRenderer } from "./start-report"
import type { ChangeReport } from "./types"

export const START_REPORT_VERSION = 1

const INTERVIEW_PROMPTS = [
  "Who uses this, and what outcome do they need?",
  "What is in scope, and what is explicitly out of scope?",
  "What constraints and quality attributes matter?",
  "What should happen when inputs, dependencies, or stores fail?",
  "How will each requirement be verified?",
] satisfies string[]

const NEXT_STEPS = [
  "Answer the prompts with your agent and record decisions and drafts in this proposal.",
  "Run spec check.",
  "Approve the reviewed feature slice with the CLI after checks pass.",
] satisfies string[]

export interface StartOptions {
  json?: boolean
  technical?: boolean
  author?: string
  now?: () => Date
  processRunner?: ProcessRunner
  toolLocator?: ToolLocator
  gitRepository?: ProposalGit
}

export interface ScratchBriefing {
  version: typeof START_REPORT_VERSION
  mode: "scratch"
  direction: string
  state: string
  prompts: string[]
  next: string[]
}

export interface StartReport {
  version: typeof START_REPORT_VERSION
  briefing: ScratchBriefing
  change: ChangeReport
}

export interface StartRun {
  report: StartReport | null
  output: string
  warnings: string[]
  code: number
}

export class ScratchBriefingFactory {
  static build(direction: string): ScratchBriefing {
    return {
      version: START_REPORT_VERSION,
      mode: "scratch",
      direction: direction.replace(/\s+/g, " ").trim(),
      state: "waiting for your answers",
      prompts: [...INTERVIEW_PROMPTS],
      next: [...NEXT_STEPS],
    }
  }
}

class StartFailures {
  static from(message: string): StartRun {
    return { report: null, output: `start failed: ${message}`, warnings: [], code: 1 }
  }
}

export async function runStart(
  target: string,
  goal: string,
  options: StartOptions = {},
): Promise<StartRun> {
  const direction = goal.trim()
  if (direction === "") return StartFailures.from("direction is required")

  const [config, configError] = await new SpecConfigLoader(target).load()
  if (configError !== null) return StartFailures.from(configError.message)
  if (config === null) return StartFailures.from("config loader returned no configuration")
  if (config.project.adoption === "existing") {
    return StartFailures.from("project was initialized as existing; use spec map --review")
  }

  const [lock, lockError] = await new SpecLockLoader(target).load()
  if (lockError !== null && lockError.code !== "SPEC-LOCK-NOT-FOUND") {
    return StartFailures.from(lockError.message)
  }
  if (lock !== null) return StartFailures.from("approved baseline exists; use spec refactor")

  const change = await runChange(target, direction, {
    mode: "scratch",
    author: options.author,
    now: options.now,
    processRunner: options.processRunner,
    toolLocator: options.toolLocator,
    gitRepository: options.gitRepository,
  })
  if (change.code !== 0 || change.report === null) {
    return {
      report: null,
      output: change.output.replace(/^change failed: /, "start failed: "),
      warnings: change.warnings,
      code: change.code,
    }
  }

  const briefing = ScratchBriefingFactory.build(direction)
  const report: StartReport = {
    version: START_REPORT_VERSION,
    briefing,
    change: change.report,
  }
  const output = options.json
    ? JSON.stringify(report, null, 2)
    : options.technical
      ? StartReportRenderer.technical(briefing, change.report)
      : StartReportRenderer.human(briefing)

  return { report, output, warnings: change.warnings, code: 0 }
}
