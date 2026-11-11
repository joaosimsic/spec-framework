import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { attempt, attemptAsync } from "../core/result"
import type { Diagnostic } from "../core/types"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

interface VerifyManifest {
    maxSteps: number
    invariants: Map<string, string[]>
}

export class QuintAdapter implements NativeAdapter {
    readonly id = "quint"
    readonly tool = "quint"

    async run(context: AdapterContext): Promise<AdapterRun> {
        const executable = await context.toolLocator.resolve(this.tool)
        if (executable === null) return { ran: false, diagnostics: [] }

        const formalDirectory = join(context.target, "spec", "formal")
        const quintFiles = await this.collectQuintFiles(formalDirectory)
        if (quintFiles.length === 0) return { ran: true, diagnostics: [this.failure("FORMAL-QUINT-NO-SOURCES", "no Quint sources found under spec/formal")] }

        const typecheckDiagnostics = await this.typecheckFiles(context, executable, quintFiles)

        const verifyManifest = await this.readVerifyManifest(context.target)
        const verifyDiagnostics = await this.verifyFiles(context, executable, quintFiles, verifyManifest)

        return { ran: true, diagnostics: [...typecheckDiagnostics, ...verifyDiagnostics] }
    }

    private async typecheckFiles(context: AdapterContext, executable: string, quintFiles: string[]): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = []
        for (const filePath of quintFiles) {
            const [commandResult, commandError] = await context.processRunner.run({ executable, arguments: ["typecheck", filePath], workingDirectory: context.target })
            if (commandError) {
                diagnostics.push(this.failure(commandError.code, commandError.message))
                continue
            }
            if (commandResult === null) {
                diagnostics.push(this.failure("FORMAL-QUINT-TYPECHECK", "quint typecheck produced no result"))
                continue
            }
            const typecheckDiagnostic = this.parseTypecheckResult(commandResult.stdout, commandResult.stderr, commandResult.exitCode, filePath)
            if (typecheckDiagnostic !== null) diagnostics.push(typecheckDiagnostic)
        }
        return diagnostics
    }

    private async verifyFiles(context: AdapterContext, executable: string, quintFiles: string[], verifyManifest: VerifyManifest): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = []
        for (const filePath of quintFiles) {
            const baseName = basename(filePath)
            const invariantNames = verifyManifest.invariants.get(baseName) ?? []
            if (invariantNames.length === 0) {
                diagnostics.push({ level: "warning", code: "FORMAL-QUINT-SKIPPED-VERIFY", message: `no invariant mapping for ${baseName}; add spec/formal/quint.json entry`, file: filePath })
                continue
            }
            const verifyDiagnostic = await this.verifySingle(context, executable, filePath, invariantNames, verifyManifest.maxSteps)
            if (verifyDiagnostic !== null) diagnostics.push(verifyDiagnostic)
        }
        return diagnostics
    }

    private async verifySingle(context: AdapterContext, executable: string, filePath: string, invariantNames: string[], maxSteps: number): Promise<Diagnostic | null> {
        const javaExecutable = await context.toolLocator.resolve("java")
        if (javaExecutable === null) return this.failure("FORMAL-QUINT-MISSING-BACKEND", "quint verify requires java; install a Java runtime and ensure java is on PATH")
        const [commandResult, commandError] = await context.processRunner.run({ executable, arguments: ["verify", filePath, "--invariant", invariantNames.join(","), "--max-steps", String(maxSteps)], workingDirectory: context.target, timeoutMs: 300_000 })
        if (commandError) return this.failure(commandError.code, commandError.message)
        if (commandResult === null) return this.failure("FORMAL-QUINT-VERIFY", "quint verify produced no result")
        const combinedOutput = `${commandResult.stdout}\n${commandResult.stderr}`.toLowerCase()
        const verifyFailed = commandResult.exitCode !== 0 || combinedOutput.includes("error") || combinedOutput.includes("fail") || combinedOutput.includes("violation")
        if (!verifyFailed) return null
        const tailOutput = this.truncatedTail(commandResult.stdout, commandResult.stderr)
        const message = tailOutput === "" ? `quint verify failed for ${filePath}` : tailOutput
        return { level: "error", code: "FORMAL-QUINT-VERIFY", message, file: filePath }
    }

    private parseTypecheckResult(stdout: string, stderr: string, exitCode: number, filePath: string): Diagnostic | null {
        const combinedOutput = `${stdout}\n${stderr}`.toLowerCase()
        const typecheckFailed = exitCode !== 0 || combinedOutput.includes("error") || combinedOutput.includes("fail")
        if (!typecheckFailed) return null
        const tailOutput = this.truncatedTail(stdout, stderr)
        const message = tailOutput === "" ? `quint typecheck failed for ${filePath}` : tailOutput
        return { level: "error", code: "FORMAL-QUINT-TYPECHECK", message, file: filePath }
    }

    private truncatedTail(stdout: string, stderr: string): string { return `${stdout}\n${stderr}`.trim().slice(-500).trim() }

    private async collectQuintFiles(directory: string): Promise<string[]> {
        const directoryEntries = await readdir(directory, { withFileTypes: true }).catch(() => [])
        const quintFiles: string[] = []
        for (const directoryEntry of directoryEntries) {
            const entryPath = join(directory, directoryEntry.name)
            if (directoryEntry.isDirectory()) {
                quintFiles.push(...(await this.collectQuintFiles(entryPath)))
                continue
            }
            if (directoryEntry.isFile() && directoryEntry.name.endsWith(".qnt")) quintFiles.push(entryPath)
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
        const maxSteps = typeof maxStepsCandidate === "number" && Number.isFinite(maxStepsCandidate) ? maxStepsCandidate : 10
        const invariants = new Map<string, string[]>()
        if (!this.isRecord(parsedManifest["invariants"])) return { maxSteps, invariants }
        for (const [fileName, invariantValue] of Object.entries(parsedManifest["invariants"])) {
            if (!this.isStringList(invariantValue)) continue
            if (invariantValue.length === 0) continue
            invariants.set(fileName, [...invariantValue])
        }
        return { maxSteps, invariants }
    }

    private isStringList(value: unknown): value is string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string") }
    private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
    private failure(code: string, message: string): Diagnostic { return { level: "error", code, message } }
}
