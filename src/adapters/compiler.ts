import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { attempt, attemptAsync, type Result } from "../core/result"
import type { Diagnostic } from "../core/types"
import { EvidenceFactory, type EvidenceRecord } from "../evidence"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

interface CompileCheck {
  id: string
  command: string[]
  workingDirectory: string
  timeoutMs?: number
}

interface CompileConfig {
  checks: CompileCheck[]
}

type CompilerConfigFailureCode =
  "IMPL-COMPILE-NO-CONFIG" | "IMPL-COMPILE-BAD-CONFIG" | "IMPL-COMPILE-NO-CHECKS"

interface CompilerConfigFailure {
  code: CompilerConfigFailureCode
  message: string
}

class CompilerConfigLoader {
  private readonly configPath: string

  constructor(private readonly target: string) {
    this.configPath = join(target, "spec", "implementation", "compile.json")
  }

  async load(): Promise<Result<CompileConfig, CompilerConfigFailure>> {
    const [exists, existsError] = await attemptAsync(() => Bun.file(this.configPath).exists())
    if (existsError) {
      return [
        null,
        this.failure("IMPL-COMPILE-NO-CONFIG", `cannot read ${this.configPath}: ${existsError}`),
      ]
    }
    if (!exists) {
      return [
        null,
        this.failure(
          "IMPL-COMPILE-NO-CONFIG",
          `missing ${this.configPath}; add spec/implementation/compile.json`,
        ),
      ]
    }

    const [text, readError] = await attemptAsync(() => Bun.file(this.configPath).text())
    if (readError) {
      return [
        null,
        this.failure("IMPL-COMPILE-BAD-CONFIG", `cannot read ${this.configPath}: ${readError}`),
      ]
    }
    if (text === null) {
      return [null, this.failure("IMPL-COMPILE-BAD-CONFIG", `cannot read ${this.configPath}`)]
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError) {
      return [
        null,
        this.failure(
          "IMPL-COMPILE-BAD-CONFIG",
          `invalid JSON in ${this.configPath}: ${parseError}`,
        ),
      ]
    }

    return this.validate(parsed)
  }

  private validate(value: unknown): Result<CompileConfig, CompilerConfigFailure> {
    if (!this.isRecord(value)) {
      return [null, this.bad("configuration must be an object")]
    }
    if (!Array.isArray(value.checks)) {
      return [null, this.bad("checks must be an array")]
    }
    if (value.checks.length === 0) {
      return [null, this.failure("IMPL-COMPILE-NO-CHECKS", "configuration contains no checks")]
    }

    const checks: CompileCheck[] = []
    const identifiers = new Set<string>()
    for (const [index, candidate] of value.checks.entries()) {
      const [check, checkFailure] = this.readCheck(candidate, index)
      if (checkFailure) return [null, checkFailure]
      if (check === null) return [null, this.bad(`checks[${index}] produced no result`)]
      if (identifiers.has(check.id)) {
        return [null, this.bad(`duplicate check id '${check.id}'`)]
      }
      identifiers.add(check.id)
      checks.push(check)
    }

    return [{ checks }, null]
  }

  private readCheck(value: unknown, index: number): Result<CompileCheck, CompilerConfigFailure> {
    if (!this.isRecord(value)) {
      return [null, this.bad(`checks[${index}] must be an object`)]
    }
    if (typeof value.id !== "string" || value.id.trim() === "") {
      return [null, this.bad(`checks[${index}].id must be a non-empty string`)]
    }

    const [command, commandFailure] = this.readCommand(value.command)
    if (commandFailure) return [null, commandFailure]
    if (command === null) return [null, this.bad(`checks[${index}].command produced no result`)]

    const [workingDirectory, directoryFailure] = this.readWorkingDirectory(value.workingDirectory)
    if (directoryFailure) return [null, directoryFailure]
    if (workingDirectory === null) {
      return [null, this.bad(`checks[${index}].workingDirectory produced no result`)]
    }

    const [timeoutMs, timeoutFailure] = this.readTimeout(value.timeoutMs)
    if (timeoutFailure) return [null, timeoutFailure]

    return [{ id: value.id, command, workingDirectory, timeoutMs: timeoutMs ?? undefined }, null]
  }

  private readCommand(value: unknown): Result<string[], CompilerConfigFailure> {
    if (!this.isStringArray(value) || value.length === 0) {
      return [null, this.bad("command must be a non-empty string array")]
    }
    if (value[0].trim() === "") {
      return [null, this.bad("command executable must be a non-empty string")]
    }

    return [[...value], null]
  }

  private readWorkingDirectory(value: unknown): Result<string, CompilerConfigFailure> {
    if (value === undefined) return [".", null]
    if (typeof value !== "string" || value.trim() === "") {
      return [null, this.bad("workingDirectory must be a non-empty relative path")]
    }
    if (isAbsolute(value)) {
      return [null, this.bad(`workingDirectory must be relative: ${value}`)]
    }

    const resolvedDirectory = resolve(this.target, value)
    const relativeDirectory = relative(this.target, resolvedDirectory)
    const escapesTarget =
      relativeDirectory === ".." ||
      relativeDirectory.startsWith(`..${sep}`) ||
      isAbsolute(relativeDirectory)
    if (escapesTarget) {
      return [null, this.bad(`workingDirectory must stay inside the project: ${value}`)]
    }

    return [value, null]
  }

  private readTimeout(value: unknown): Result<number | null, CompilerConfigFailure> {
    if (value === undefined) return [null, null]
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      return [null, this.bad("timeoutMs must be a positive integer")]
    }

    return [value, null]
  }

  private isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string")
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  private bad(message: string): CompilerConfigFailure {
    return this.failure("IMPL-COMPILE-BAD-CONFIG", message)
  }

  private failure(code: CompilerConfigFailureCode, message: string): CompilerConfigFailure {
    return { code, message }
  }
}

export class CompilerAdapter implements NativeAdapter {
  readonly id = "compiler"
  readonly tool = "compiler"
  readonly requiredTools: readonly string[] = []

  async detect(target: string): Promise<boolean> {
    const configPath = join(target, "spec", "implementation", "compile.json")
    const [exists, existsError] = await attemptAsync(() => Bun.file(configPath).exists())
    if (existsError) return false

    return exists === true
  }

  async run(context: AdapterContext): Promise<AdapterRun> {
    const configPath = join(context.target, "spec", "implementation", "compile.json")
    const [config, configError] = await new CompilerConfigLoader(context.target).load()
    if (configError) {
      return { ran: true, diagnostics: [this.configFailure(configError, configPath)] }
    }
    if (config === null) {
      return {
        ran: true,
        diagnostics: [
          this.failure("IMPL-COMPILE-BAD-CONFIG", "configuration produced no result", configPath),
        ],
      }
    }

    const diagnostics: Diagnostic[] = []
    const evidence: EvidenceRecord[] = []
    for (const check of config.checks) {
      const checkDiagnostics = await this.runCheck(context, check, configPath)
      diagnostics.push(...checkDiagnostics)
      evidence.push(await this.evidenceRecord(context, check, checkDiagnostics))
    }

    return { ran: true, diagnostics, evidence }
  }

  private async evidenceRecord(
    context: AdapterContext,
    check: CompileCheck,
    diagnostics: Diagnostic[],
  ): Promise<EvidenceRecord> {
    const inputs = await new EvidenceFactory().inputs(context.target, [
      join(context.target, "spec", "implementation", "compile.json"),
      join(context.target, "spec", "toolchain.lock.json"),
    ])
    const failed = diagnostics.some((diagnostic) => diagnostic.level === "error")
    const checkId = check.id.toUpperCase().replace(/[^A-Z0-9]+/g, "-")

    return new EvidenceFactory().create({
      id: `EVD-IMPL-${checkId}`,
      kind: "implementation",
      method: "preflight",
      tool: check.command[0] ?? this.tool,
      result: failed ? "fail" : "pass",
      inputs,
      command: [...check.command],
      ...(failed
        ? {
            details: diagnostics
              .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
              .join("\n"),
          }
        : {}),
    })
  }

  private async runCheck(
    context: AdapterContext,
    check: CompileCheck,
    configPath: string,
  ): Promise<Diagnostic[]> {
    const executable = await context.toolLocator.resolve(check.command[0])
    if (executable === null) {
      return [
        this.failure(
          "IMPL-COMPILE-MISSING-TOOL",
          `${check.id}: executable '${check.command[0]}' is not available`,
          configPath,
        ),
      ]
    }

    const [commandResult, commandError] = await context.processRunner.run({
      executable,
      arguments: check.command.slice(1),
      workingDirectory: resolve(context.target, check.workingDirectory),
      timeoutMs: check.timeoutMs,
    })
    if (commandError) {
      return [
        this.failure(
          "IMPL-COMPILE-RUN",
          `${check.id}: ${commandError.code}: ${commandError.message}`,
          configPath,
        ),
      ]
    }
    if (commandResult === null) {
      return [
        this.failure("IMPL-COMPILE-RUN", `${check.id}: command produced no result`, configPath),
      ]
    }
    if (commandResult.exitCode === 0) return []

    return [
      this.failure("IMPL-COMPILE-FAILED", this.failedMessage(check.id, commandResult), configPath),
    ]
  }

  private failedMessage(
    checkId: string,
    result: { stdout: string; stderr: string; exitCode: number },
  ): string {
    const message = `${checkId} failed with exit code ${result.exitCode}`
    const tail = this.truncatedTail(result.stdout, result.stderr)

    return tail === "" ? message : `${message}: ${tail}`
  }

  private truncatedTail(stdout: string, stderr: string): string {
    return `${stdout}\n${stderr}`.trim().slice(-500).trim()
  }

  private configFailure(failure: CompilerConfigFailure, configPath: string): Diagnostic {
    return { level: "error", code: failure.code, message: failure.message, file: configPath }
  }

  private failure(code: string, message: string, file?: string): Diagnostic {
    return { level: "error", code, message, file }
  }
}
