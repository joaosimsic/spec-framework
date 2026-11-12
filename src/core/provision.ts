import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { getToolStatuses, type ToolStatus } from "./doctor"
import { attemptAsync, type Result } from "./result"
import type { CommandResult, CommandSpec, ProcessRunner } from "./runner"
import {
  ToolchainLockStore,
  type ToolchainFailure,
  type ToolchainLock,
  type ToolchainStatus,
} from "./toolchain"

type ProvisionRecipe = { kind: "bun"; packageName: string } | { kind: "uv"; packageName: string }

const RECIPES: Record<string, ProvisionRecipe> = {
  likec4: { kind: "bun", packageName: "likec4" },
  quint: { kind: "bun", packageName: "@informalsystems/quint" },
  strictdoc: { kind: "uv", packageName: "strictdoc" },
}

const PROVISION_TIMEOUT_MS = 300_000
const FAILURE_DETAIL_LIMIT = 500

export type ProvisionDiagnosticCode =
  | "TOOL-UNSUPPORTED"
  | "TOOL-UNPINNED"
  | "TOOL-PREREQUISITE-MISSING"
  | "TOOL-PROVISION-FAILED"
  | "TOOLCHAIN-WRITE-FAILED"

export interface ProvisionedTool {
  name: string
  version: string
}

export interface ProvisionDiagnostic {
  name: string
  code: ProvisionDiagnosticCode
  message: string
}

export interface ProvisionOutcome {
  statuses: ToolStatus[]
  provisioned: ProvisionedTool[]
  skipped: ProvisionDiagnostic[]
  failed: ProvisionDiagnostic[]
  lockStatus: ToolchainStatus | null
}

type ToolAttempt =
  | { kind: "provisioned"; tool: ProvisionedTool }
  | { kind: "skipped"; diagnostic: ProvisionDiagnostic }
  | { kind: "failed"; diagnostic: ProvisionDiagnostic }

type StatusReader = (target: string) => ToolStatus[]

export class ToolProvisioner {
  constructor(
    private readonly target: string,
    private readonly processRunner: ProcessRunner,
    private readonly readStatuses: StatusReader = getToolStatuses,
  ) {}

  async provision(): Promise<Result<ProvisionOutcome, ToolchainFailure>> {
    const store = new ToolchainLockStore(this.target)
    const [lock, lockError] = await store.load()
    if (lockError !== null) return [null, lockError]
    if (lock === null) {
      return [null, { code: "TOOLCHAIN-BAD-LOCK", message: "toolchain lock produced no result" }]
    }

    const statuses = this.readStatuses(this.target)
    const missing = statuses.filter((tool) => tool.required && !tool.present)
    const attempts: ToolAttempt[] = []
    for (const tool of missing) {
      attempts.push(await this.attemptTool(tool, lock, statuses))
    }
    const provisioned = this.collectProvisioned(attempts)
    const skipped = this.collectDiagnostics(attempts, "skipped")
    const failed = this.collectDiagnostics(attempts, "failed")

    const finalStatuses = this.readStatuses(this.target)
    const required = finalStatuses.filter((tool) => tool.required)
    const present = required.filter((tool) => tool.present).length
    const status = ToolchainLockStore.statusFor(required.length, present)
    const [savedLock, saveError] = await store.save({ ...lock, status })
    if (saveError !== null) {
      failed.push({
        name: "toolchain.lock.json",
        code: "TOOLCHAIN-WRITE-FAILED",
        message: saveError.message,
      })
    }

    return [
      {
        statuses: finalStatuses,
        provisioned,
        skipped,
        failed,
        lockStatus: savedLock?.status ?? null,
      },
      null,
    ]
  }

  private async attemptTool(
    tool: ToolStatus,
    lock: ToolchainLock,
    statuses: ToolStatus[],
  ): Promise<ToolAttempt> {
    const version = lock.tools[tool.name]
    const recipe = RECIPES[tool.name]
    if (recipe === undefined) {
      const detail =
        version === undefined ? tool.install : `${tool.name} ${version}; ${tool.install}`

      return this.skip(tool, "TOOL-UNSUPPORTED", detail)
    }

    if (version === undefined) {
      return this.skip(
        tool,
        "TOOL-UNPINNED",
        `no exact version in spec/toolchain.lock.json; ${tool.install}`,
      )
    }
    if (!ToolchainLockStore.isPinnedVersion(version)) {
      return this.skip(tool, "TOOL-UNPINNED", `version '${version}' is not exact; ${tool.install}`)
    }

    const prerequisite = recipe.kind === "bun" ? "bun" : "uv"
    const prerequisiteStatus = statuses.find((candidate) => candidate.name === prerequisite)
    if (prerequisiteStatus?.present !== true) {
      return this.skip(
        tool,
        "TOOL-PREREQUISITE-MISSING",
        `${prerequisite} is required to provision ${tool.name}; ${tool.install}`,
      )
    }

    const [, prepareError] = await this.prepare(recipe)
    if (prepareError !== null) {
      return this.fail(tool.name, prepareError)
    }

    const [commandResult, commandError] = await this.processRunner.run(
      this.commandFor(recipe, version),
    )
    if (commandError !== null) {
      return this.fail(tool.name, `${tool.name} provisioning failed: ${commandError.message}`)
    }
    if (commandResult === null) {
      return this.fail(tool.name, `${tool.name} provisioning produced no result`)
    }
    if (commandResult.exitCode !== 0) {
      return this.fail(tool.name, this.commandFailure(tool.name, commandResult))
    }

    return { kind: "provisioned", tool: { name: tool.name, version } }
  }

  private async prepare(recipe: ProvisionRecipe): Promise<Result<null, string>> {
    const toolsDirectory = join(this.target, ".spec", "tools")
    const [, toolsError] = await attemptAsync(() => mkdir(toolsDirectory, { recursive: true }))
    if (toolsError !== null) return [null, toolsError]
    if (recipe.kind === "uv") {
      const [, binError] = await attemptAsync(() =>
        mkdir(join(toolsDirectory, "bin"), { recursive: true }),
      )
      if (binError !== null) return [null, binError]

      const [, uvError] = await attemptAsync(() =>
        mkdir(join(toolsDirectory, "uv"), { recursive: true }),
      )
      if (uvError !== null) return [null, uvError]

      return [null, null]
    }

    return this.prepareBunProject(toolsDirectory)
  }

  private async prepareBunProject(toolsDirectory: string): Promise<Result<null, string>> {
    const packagePath = join(toolsDirectory, "package.json")
    const [exists, existsError] = await attemptAsync(() => Bun.file(packagePath).exists())
    if (existsError !== null) return [null, existsError]
    if (exists) return [null, null]

    const [, writeError] = await attemptAsync(() =>
      Bun.write(packagePath, `${JSON.stringify({ private: true }, null, 2)}\n`),
    )

    return writeError === null ? [null, null] : [null, writeError]
  }

  private commandFor(recipe: ProvisionRecipe, version: string): CommandSpec {
    if (recipe.kind === "bun") {
      return {
        executable: "bun",
        arguments: ["add", "--exact", "--ignore-scripts", `${recipe.packageName}@${version}`],
        workingDirectory: join(this.target, ".spec", "tools"),
        timeoutMs: PROVISION_TIMEOUT_MS,
      }
    }

    return {
      executable: "uv",
      arguments: ["tool", "install", "--force", `${recipe.packageName}==${version}`],
      workingDirectory: this.target,
      timeoutMs: PROVISION_TIMEOUT_MS,
      environment: {
        UV_TOOL_DIR: join(this.target, ".spec", "tools", "uv"),
        UV_TOOL_BIN_DIR: join(this.target, ".spec", "tools", "bin"),
      },
    }
  }

  private commandFailure(name: string, result: CommandResult): string {
    const detail = `${result.stderr}\n${result.stdout}`.trim().slice(0, FAILURE_DETAIL_LIMIT)
    if (detail.length === 0) {
      return `${name} provisioning failed with exit code ${result.exitCode}`
    }

    return `${name} provisioning failed with exit code ${result.exitCode}: ${detail}`
  }

  private skip(tool: ToolStatus, code: ProvisionDiagnosticCode, message: string): ToolAttempt {
    return { kind: "skipped", diagnostic: { name: tool.name, code, message } }
  }

  private fail(name: string, message: string): ToolAttempt {
    return {
      kind: "failed",
      diagnostic: { name, code: "TOOL-PROVISION-FAILED", message },
    }
  }

  private collectProvisioned(attempts: ToolAttempt[]): ProvisionedTool[] {
    return attempts
      .filter((attempt) => attempt.kind === "provisioned")
      .map((attempt) => attempt.tool)
  }

  private collectDiagnostics(
    attempts: ToolAttempt[],
    kind: "skipped" | "failed",
  ): ProvisionDiagnostic[] {
    return attempts.reduce<ProvisionDiagnostic[]>((diagnostics, attempt) => {
      if (attempt.kind !== kind) return diagnostics

      return [...diagnostics, attempt.diagnostic]
    }, [])
  }
}
