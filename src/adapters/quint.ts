import { readdir } from "node:fs/promises"
import { basename, join, relative } from "node:path"
import { attempt, attemptAsync } from "../core/result"
import type { Diagnostic } from "../core/types"
import { EvidenceFactory, type EvidenceRecord, type EvidenceResult } from "../evidence"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

interface VerifyManifest {
  maxSteps: number
  invariants: Map<string, string[]>
}

interface QuintRun {
  diagnostics: Diagnostic[]
  evidence: EvidenceRecord[]
}

export class QuintAdapter implements NativeAdapter {
  readonly id = "quint"
  readonly tool = "quint"
  readonly requiredTools = ["apalache", "java", "quint"]

  async detect(target: string): Promise<boolean> {
    const quintFiles = await this.collectQuintFiles(join(target, "spec", "formal"))

    return quintFiles.length > 0
  }

  async run(context: AdapterContext): Promise<AdapterRun> {
    const executable = await context.toolLocator.resolve(this.tool)
    if (executable === null) return { ran: false, diagnostics: [] }

    const formalDirectory = join(context.target, "spec", "formal")
    const quintFiles = await this.collectQuintFiles(formalDirectory)
    if (quintFiles.length === 0)
      return {
        ran: true,
        diagnostics: [
          this.failure("FORMAL-QUINT-NO-SOURCES", "no Quint sources found under spec/formal"),
        ],
      }

    const typecheckRun = await this.typecheckFiles(context, executable, quintFiles)

    const verifyManifest = await this.readVerifyManifest(context.target)
    const verifyRun = await this.verifyFiles(context, executable, quintFiles, verifyManifest)

    return {
      ran: true,
      diagnostics: [...typecheckRun.diagnostics, ...verifyRun.diagnostics],
      evidence: [...typecheckRun.evidence, ...verifyRun.evidence],
    }
  }

  private async typecheckFiles(
    context: AdapterContext,
    executable: string,
    quintFiles: string[],
  ): Promise<QuintRun> {
    const diagnostics: Diagnostic[] = []
    const evidence: EvidenceRecord[] = []
    for (const filePath of quintFiles) {
      const commandArguments = ["typecheck", filePath]
      const [commandResult, commandError] = await context.processRunner.run({
        executable,
        arguments: commandArguments,
        workingDirectory: context.target,
      })
      if (commandError) {
        const diagnostic = this.failure(commandError.code, commandError.message)
        diagnostics.push(diagnostic)
        evidence.push(
          await this.evidenceRecord(
            context,
            filePath,
            "TYPECHECK",
            "typecheck",
            "fail",
            diagnostic.message,
            [this.tool, "typecheck", relative(context.target, filePath)],
          ),
        )
        continue
      }
      if (commandResult === null) {
        const diagnostic = this.failure(
          "FORMAL-QUINT-TYPECHECK",
          "quint typecheck produced no result",
        )
        diagnostics.push(diagnostic)
        evidence.push(
          await this.evidenceRecord(
            context,
            filePath,
            "TYPECHECK",
            "typecheck",
            "fail",
            diagnostic.message,
            [this.tool, "typecheck", relative(context.target, filePath)],
          ),
        )
        continue
      }
      const typecheckDiagnostic = this.parseTypecheckResult(
        commandResult.stdout,
        commandResult.stderr,
        commandResult.exitCode,
        filePath,
      )
      if (typecheckDiagnostic !== null) diagnostics.push(typecheckDiagnostic)
      evidence.push(
        await this.evidenceRecord(
          context,
          filePath,
          "TYPECHECK",
          "typecheck",
          typecheckDiagnostic === null ? "pass" : "fail",
          typecheckDiagnostic?.message,
          [this.tool, "typecheck", relative(context.target, filePath)],
        ),
      )
    }
    return { diagnostics, evidence }
  }

  private async verifyFiles(
    context: AdapterContext,
    executable: string,
    quintFiles: string[],
    verifyManifest: VerifyManifest,
  ): Promise<QuintRun> {
    const diagnostics: Diagnostic[] = []
    const evidence: EvidenceRecord[] = []
    for (const filePath of quintFiles) {
      const baseName = basename(filePath)
      const invariantNames = verifyManifest.invariants.get(baseName) ?? []
      if (invariantNames.length === 0) {
        diagnostics.push({
          level: "warning",
          code: "FORMAL-QUINT-SKIPPED-VERIFY",
          message: `no invariant mapping for ${baseName}; add spec/formal/quint.json entry`,
          file: filePath,
        })
        evidence.push(
          await this.evidenceRecord(
            context,
            filePath,
            "VERIFY",
            "model-check",
            "skipped",
            `no invariant mapping for ${baseName}`,
            [this.tool, "verify", relative(context.target, filePath)],
          ),
        )
        continue
      }
      const verifyRun = await this.verifySingle(
        context,
        executable,
        filePath,
        invariantNames,
        verifyManifest.maxSteps,
      )
      diagnostics.push(...verifyRun.diagnostics)
      evidence.push(...verifyRun.evidence)
    }
    return { diagnostics, evidence }
  }

  private async verifySingle(
    context: AdapterContext,
    executable: string,
    filePath: string,
    invariantNames: string[],
    maxSteps: number,
  ): Promise<QuintRun> {
    const commandArguments = [
      "verify",
      filePath,
      "--invariant",
      invariantNames.join(","),
      "--max-steps",
      String(maxSteps),
    ]
    const canonicalCommand = [
      this.tool,
      "verify",
      relative(context.target, filePath),
      "--invariant",
      invariantNames.join(","),
      "--max-steps",
      String(maxSteps),
    ]
    const javaExecutable = await context.toolLocator.resolve("java")
    if (javaExecutable === null) {
      const diagnostic = this.failure(
        "FORMAL-QUINT-MISSING-BACKEND",
        "quint verify requires java; install a Java runtime and ensure java is on PATH",
      )
      return {
        diagnostics: [diagnostic],
        evidence: await this.invariantEvidence(
          context,
          filePath,
          invariantNames,
          "fail",
          diagnostic.message,
          canonicalCommand,
        ),
      }
    }
    const [commandResult, commandError] = await context.processRunner.run({
      executable,
      arguments: commandArguments,
      workingDirectory: context.target,
      timeoutMs: 300_000,
    })
    if (commandError) {
      const diagnostic = this.failure(commandError.code, commandError.message)
      return {
        diagnostics: [diagnostic],
        evidence: await this.invariantEvidence(
          context,
          filePath,
          invariantNames,
          "fail",
          diagnostic.message,
          canonicalCommand,
        ),
      }
    }
    if (commandResult === null) {
      const diagnostic = this.failure("FORMAL-QUINT-VERIFY", "quint verify produced no result")
      return {
        diagnostics: [diagnostic],
        evidence: await this.invariantEvidence(
          context,
          filePath,
          invariantNames,
          "fail",
          diagnostic.message,
          canonicalCommand,
        ),
      }
    }
    const verifyFailed = this.verifyFailed(commandResult)
    if (!verifyFailed) {
      return {
        diagnostics: [],
        evidence: await this.invariantEvidence(
          context,
          filePath,
          invariantNames,
          "pass",
          undefined,
          canonicalCommand,
        ),
      }
    }
    const tailOutput = this.truncatedTail(commandResult.stdout, commandResult.stderr)
    const message = tailOutput === "" ? `quint verify failed for ${filePath}` : tailOutput
    const diagnostic = {
      level: "error" as const,
      code: "FORMAL-QUINT-VERIFY",
      message,
      file: filePath,
    }
    return {
      diagnostics: [diagnostic],
      evidence: await this.invariantEvidence(
        context,
        filePath,
        invariantNames,
        "fail",
        message,
        canonicalCommand,
      ),
    }
  }

  private verifyFailed(result: { exitCode: number; stdout: string; stderr: string }): boolean {
    if (result.exitCode !== 0) return true

    const output = result.stdout.toLowerCase()
    const outcome = /the outcome is:\s*([a-z]+)/i.exec(result.stdout)?.[1]?.toLowerCase()
    if (outcome !== undefined && outcome !== "noerror") return true
    if (output.includes("no violation found")) return false

    return output.includes("violation") || output.includes("invariant violated")
  }

  private async invariantEvidence(
    context: AdapterContext,
    filePath: string,
    invariantNames: string[],
    result: EvidenceResult,
    details: string | undefined,
    command: string[],
  ): Promise<EvidenceRecord[]> {
    const records: EvidenceRecord[] = []
    for (const invariantName of invariantNames) {
      records.push(
        await this.evidenceRecord(
          context,
          filePath,
          invariantName,
          "model-check",
          result,
          details,
          command,
        ),
      )
    }
    return records
  }

  private async evidenceRecord(
    context: AdapterContext,
    filePath: string,
    suffix: string,
    kind: string,
    result: EvidenceResult,
    details: string | undefined,
    command: string[],
  ): Promise<EvidenceRecord> {
    const moduleName = basename(filePath, ".qnt")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
    const evidenceSuffix = suffix.toUpperCase().replace(/[^A-Z0-9]+/g, "-")
    const inputs = await new EvidenceFactory().inputs(context.target, [
      filePath,
      join(context.target, "spec", "formal", "quint.json"),
    ])
    return new EvidenceFactory().create({
      id: `EVD-QUINT-${moduleName}-${evidenceSuffix}`,
      kind,
      method: "formal",
      tool: this.tool,
      result,
      inputs,
      command,
      ...(details === undefined ? {} : { details }),
    })
  }

  private parseTypecheckResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    filePath: string,
  ): Diagnostic | null {
    const combinedOutput = `${stdout}\n${stderr}`.toLowerCase()
    const typecheckFailed =
      exitCode !== 0 || combinedOutput.includes("error") || combinedOutput.includes("fail")
    if (!typecheckFailed) return null
    const tailOutput = this.truncatedTail(stdout, stderr)
    const message = tailOutput === "" ? `quint typecheck failed for ${filePath}` : tailOutput
    return { level: "error", code: "FORMAL-QUINT-TYPECHECK", message, file: filePath }
  }

  private truncatedTail(stdout: string, stderr: string): string {
    return `${stdout}\n${stderr}`.trim().slice(-500).trim()
  }

  private async collectQuintFiles(directory: string): Promise<string[]> {
    const directoryEntries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    const quintFiles: string[] = []
    for (const directoryEntry of directoryEntries) {
      const entryPath = join(directory, directoryEntry.name)
      if (directoryEntry.isDirectory()) {
        quintFiles.push(...(await this.collectQuintFiles(entryPath)))
        continue
      }
      if (directoryEntry.isFile() && directoryEntry.name.endsWith(".qnt"))
        quintFiles.push(entryPath)
    }
    return quintFiles
  }

  private async readVerifyManifest(target: string): Promise<VerifyManifest> {
    const fallbackManifest: VerifyManifest = { maxSteps: 10, invariants: new Map() }
    const manifestPath = join(target, "spec", "formal", "quint.json")
    const [manifestText, readError] = await attemptAsync(() => Bun.file(manifestPath).text())
    if (readError) return fallbackManifest
    if (manifestText === null) return fallbackManifest
    const [parsedManifest, parseError] = attempt(() => JSON.parse(manifestText) as unknown)
    if (parseError) return fallbackManifest
    if (parsedManifest === null || !this.isRecord(parsedManifest)) return fallbackManifest
    const maxStepsCandidate = parsedManifest["maxSteps"]
    const maxSteps =
      typeof maxStepsCandidate === "number" && Number.isFinite(maxStepsCandidate)
        ? maxStepsCandidate
        : 10
    const invariants = new Map<string, string[]>()
    if (!this.isRecord(parsedManifest["invariants"])) return { maxSteps, invariants }
    for (const [fileName, invariantValue] of Object.entries(parsedManifest["invariants"])) {
      if (!this.isStringList(invariantValue)) continue
      if (invariantValue.length === 0) continue
      invariants.set(fileName, [...invariantValue])
    }
    return { maxSteps, invariants }
  }

  private isStringList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string")
  }
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
  private failure(code: string, message: string): Diagnostic {
    return { level: "error", code, message }
  }
}
