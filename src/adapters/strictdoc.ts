import { readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { attemptAsync } from "../core/result"
import type { Diagnostic } from "../core/types"
import { EvidenceFactory } from "../evidence"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

export class StrictDocAdapter implements NativeAdapter {
  readonly id = "strictdoc"
  readonly tool = "strictdoc"
  readonly requiredTools = ["strictdoc"]

  async detect(target: string): Promise<boolean> {
    const requirementFiles = await this.collectRequirementFiles(
      join(target, "spec", "requirements"),
    )

    return requirementFiles.length > 0
  }

  async run(context: AdapterContext): Promise<AdapterRun> {
    const executable = await context.toolLocator.resolve(this.tool)
    if (executable === null) {
      return { ran: false, diagnostics: [] }
    }

    const outputDirectory = join(tmpdir(), `strictdoc-${process.pid}-${Date.now()}`)
    const requirementsDirectory = join(context.target, "spec", "requirements")
    const requirementFiles = await this.collectRequirementFiles(requirementsDirectory)
    const commandArguments = [
      "export",
      requirementsDirectory,
      "--output-dir",
      outputDirectory,
      "--formats",
      "json",
      "--no-parallelization",
    ]
    const [commandResult, commandError] = await context.processRunner.run({
      executable,
      arguments: commandArguments,
      workingDirectory: context.target,
    })
    await attemptAsync(() => rm(outputDirectory, { recursive: true, force: true }))
    if (commandError) {
      return this.withEvidence(
        context,
        requirementFiles,
        {
          ran: true,
          diagnostics: [this.failure(commandError.code, commandError.message)],
        },
        [this.tool, ...commandArguments],
      )
    }
    if (commandResult === null) {
      return this.withEvidence(
        context,
        requirementFiles,
        {
          ran: true,
          diagnostics: [this.failure("REQ-STRICTDOC", "strictdoc produced no result")],
        },
        [this.tool, ...commandArguments],
      )
    }

    return this.withEvidence(
      context,
      requirementFiles,
      this.parseResult(commandResult.stdout, commandResult.stderr, commandResult.exitCode),
      [this.tool, ...commandArguments],
    )
  }

  private async withEvidence(
    context: AdapterContext,
    requirementFiles: string[],
    run: AdapterRun,
    command: string[],
  ): Promise<AdapterRun> {
    const inputs = await new EvidenceFactory().inputs(context.target, requirementFiles)
    const failed = run.diagnostics.some((diagnostic) => diagnostic.level === "error")

    return {
      ...run,
      evidence: [
        new EvidenceFactory().create({
          id: "EVD-REQ-STRICTDOC",
          kind: "requirements",
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
    const diagnostics = this.collectErrors(stdout)
    if (diagnostics.length > 0) {
      return { ran: true, diagnostics }
    }
    if (exitCode !== 0) {
      const diagnostic = this.outputFailure(
        `strictdoc exited with status ${exitCode}`,
        stdout,
        stderr,
      )
      return { ran: true, diagnostics: [diagnostic] }
    }

    return { ran: true, diagnostics: [] }
  }

  private collectErrors(stdout: string): Diagnostic[] {
    const lines = stdout.split("\n")
    const diagnostics: Diagnostic[] = []
    lines.forEach((line, lineIndex) => {
      const diagnostic = this.parseErrorLine(lines, line, lineIndex)
      if (diagnostic !== null) {
        diagnostics.push(diagnostic)
      }
    })

    return diagnostics
  }

  private parseErrorLine(lines: string[], line: string, lineIndex: number): Diagnostic | null {
    if (!line.startsWith("error:")) {
      return null
    }

    const location = this.findLocation(lines, line, lineIndex)

    return {
      level: "error",
      code: "REQ-STRICTDOC",
      message: this.buildMessage(lines, line, lineIndex),
      file: location.file,
      line: location.line,
    }
  }

  private buildMessage(lines: string[], line: string, lineIndex: number): string {
    const detail = (lines[lineIndex + 1] ?? "").trim()
    if (detail.startsWith("Semantic error:") || detail.startsWith("Error:")) {
      return `${line.trim()} ${detail}`
    }

    return line.trim()
  }

  private findLocation(
    lines: string[],
    line: string,
    lineIndex: number,
  ): {
    file?: string
    line?: number
  } {
    const window = lines.slice(lineIndex, lineIndex + 5)
    const locationLine = window.find((candidate) => candidate.startsWith("Location:"))
    if (locationLine !== undefined) {
      const location = this.parseLocationLine(locationLine)
      if (location !== null) {
        return location
      }
    }

    return { file: this.parseFileFromError(line), line: undefined }
  }

  private parseLocationLine(locationLine: string): { file?: string; line?: number } | null {
    const locationPattern = /^Location:\s*(.+):(\d+):(\d+)\s*$/
    const match = locationPattern.exec(locationLine)
    if (match === null) {
      return null
    }

    return { file: match[1], line: this.parseLineNumber(match[2]) }
  }

  private parseFileFromError(line: string): string | undefined {
    const filePattern = /could not parse file:\s*(\S+)/i
    const match = filePattern.exec(line)

    return match?.[1]?.replace(/\.$/, "")
  }

  private parseLineNumber(text: string | undefined): number | undefined {
    if (text === undefined) {
      return undefined
    }
    const parsed = Number.parseInt(text, 10)

    return Number.isNaN(parsed) ? undefined : parsed
  }

  private outputFailure(message: string, stdout: string, stderr: string): Diagnostic {
    const combined = `${stdout}\n${stderr}`.trim().slice(-500).trim()

    return this.failure("REQ-STRICTDOC-OUTPUT", combined ? `${message}: ${combined}` : message)
  }

  private async collectRequirementFiles(directory: string): Promise<string[]> {
    const directoryEntries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    const requirementFiles: string[] = []

    for (const directoryEntry of directoryEntries) {
      const entryPath = join(directory, directoryEntry.name)
      if (directoryEntry.isDirectory()) {
        requirementFiles.push(...(await this.collectRequirementFiles(entryPath)))
        continue
      }
      if (!directoryEntry.isFile()) continue
      if (!/\.(sdoc|md)$/.test(directoryEntry.name)) continue
      requirementFiles.push(entryPath)
    }

    return requirementFiles
  }

  private failure(code: string, message: string): Diagnostic {
    return { level: "error", code, message }
  }
}
