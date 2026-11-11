import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { attempt } from "../core/result"
import type { Diagnostic } from "../core/types"
import { EvidenceFactory } from "../evidence"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

interface LikeC4ErrorPayload {
  message: string
  file?: unknown
  line?: unknown
  range?: unknown
}

interface LikeC4Payload {
  valid: boolean
  errors?: LikeC4ErrorPayload[]
  stats?: unknown
}

export class LikeC4Adapter implements NativeAdapter {
  readonly id = "likec4"
  readonly tool = "likec4"
  readonly requiredTools = ["likec4"]

  async detect(target: string): Promise<boolean> {
    const modelFiles = await this.collectModelFiles(join(target, "spec", "architecture"))

    return modelFiles.length > 0
  }

  async run(context: AdapterContext): Promise<AdapterRun> {
    const executable = await context.toolLocator.resolve(this.tool)
    if (executable === null) return { ran: false, diagnostics: [] }

    const architectureDirectory = join(context.target, "spec", "architecture")
    const architectureFiles = await this.collectModelFiles(architectureDirectory)
    const commandArguments = ["validate", "--json", architectureDirectory]
    const [commandResult, commandError] = await context.processRunner.run({
      executable,
      arguments: commandArguments,
      workingDirectory: context.target,
    })
    if (commandError) {
      return this.withEvidence(context, architectureFiles, {
        ran: true,
        diagnostics: [this.failure(commandError.code, commandError.message)],
      }, [this.tool, ...commandArguments])
    }
    if (commandResult === null) {
      return this.withEvidence(context, architectureFiles, {
        ran: true,
        diagnostics: [this.failure("ARCH-LIKEC4", "likec4 produced no result")],
      }, [this.tool, ...commandArguments])
    }

    return this.withEvidence(
      context,
      architectureFiles,
      this.parseResult(commandResult.stdout, commandResult.stderr, commandResult.exitCode),
      [this.tool, ...commandArguments],
    )
  }

  private async withEvidence(
    context: AdapterContext,
    architectureFiles: string[],
    run: AdapterRun,
    command: string[],
  ): Promise<AdapterRun> {
    const inputs = await new EvidenceFactory().inputs(context.target, architectureFiles)
    const failed = run.diagnostics.some((diagnostic) => diagnostic.level === "error")

    return {
      ...run,
      evidence: [
        new EvidenceFactory().create({
          id: "EVD-ARCH-LIKEC4",
          kind: "architecture",
          method: "analysis",
          tool: this.tool,
          result: failed ? "fail" : "pass",
          inputs,
          command,
          ...(failed ? { details: this.diagnosticDetails(run.diagnostics) } : {}),
        }),
      ],
    }
  }

  private diagnosticDetails(diagnostics: Diagnostic[]): string {
    return diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n")
  }

  private parseResult(stdout: string, stderr: string, exitCode: number): AdapterRun {
    const [payload, parseError] = attempt(() => JSON.parse(stdout) as unknown)
    if (parseError) {
      return {
        ran: true,
        diagnostics: [
          this.outputFailure(`likec4 produced invalid JSON: ${parseError}`, stderr),
        ],
      }
    }
    if (!this.isPayload(payload)) {
      return {
        ran: true,
        diagnostics: [this.outputFailure("likec4 produced an unexpected payload", stderr)],
      }
    }

    const diagnostics = (payload.errors ?? []).map((error) => this.errorDiagnostic(error))
    if (!payload.valid && diagnostics.length === 0) {
      diagnostics.push(
        this.failure("ARCH-LIKEC4", "likec4 reported an invalid model without error details"),
      )
    }
    if (payload.valid) {
      const totalFiles = this.readTotalFiles(payload)
      if (totalFiles === undefined) {
        diagnostics.push(
          this.outputFailure("likec4 did not report the number of validated files", stderr),
        )
      }
      if (totalFiles === 0) {
        diagnostics.push(
          this.failure("ARCH-LIKEC4", "no LikeC4 sources found under spec/architecture"),
        )
      }
    }
    if (exitCode !== 0 && payload.valid) {
      diagnostics.push(this.failure("ARCH-LIKEC4", `likec4 exited with status ${exitCode}`))
    }

    return { ran: true, diagnostics }
  }

  private outputFailure(message: string, stderr: string): Diagnostic {
    const detail = stderr.trim().slice(0, 500)
    return this.failure("ARCH-LIKEC4-OUTPUT", detail ? `${message}: ${detail}` : message)
  }

  private readTotalFiles(payload: LikeC4Payload): number | undefined {
    if (!this.isRecord(payload.stats)) return undefined

    return typeof payload.stats.totalFiles === "number" ? payload.stats.totalFiles : undefined
  }

  private errorDiagnostic(error: LikeC4ErrorPayload): Diagnostic {
    return {
      level: "error",
      code: "ARCH-LIKEC4",
      message: error.message,
      file: this.readFile(error),
      line: this.readLine(error),
    }
  }

  private readFile(error: LikeC4ErrorPayload): string | undefined {
    return typeof error.file === "string" ? error.file : undefined
  }

  private readLine(error: LikeC4ErrorPayload): number | undefined {
    const line = this.readRawLine(error)

    return line === undefined ? undefined : line + 1
  }

  private readRawLine(error: LikeC4ErrorPayload): number | undefined {
    if (typeof error.line === "number") return error.line
    if (!this.isRecord(error.range)) return undefined

    const start = error.range.start
    if (!this.isRecord(start)) return undefined

    return typeof start.line === "number" ? start.line : undefined
  }

  private async collectModelFiles(directory: string): Promise<string[]> {
    const directoryEntries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    const modelFiles: string[] = []

    for (const directoryEntry of directoryEntries) {
      const entryPath = join(directory, directoryEntry.name)
      if (directoryEntry.isDirectory()) {
        modelFiles.push(...(await this.collectModelFiles(entryPath)))
        continue
      }
      if (!directoryEntry.isFile()) continue
      if (!/\.(c4|likec4)$/.test(directoryEntry.name)) continue
      modelFiles.push(entryPath)
    }

    return modelFiles
  }

  private failure(code: string, message: string): Diagnostic {
    return { level: "error", code, message }
  }

  private isPayload(value: unknown): value is LikeC4Payload {
    if (!this.isRecord(value)) return false
    if (typeof value.valid !== "boolean") return false
    if (value.errors === undefined) return true

    return Array.isArray(value.errors) && value.errors.every((error) => this.isErrorPayload(error))
  }

  private isErrorPayload(value: unknown): value is LikeC4ErrorPayload {
    if (!this.isRecord(value)) return false

    return typeof value.message === "string"
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}
