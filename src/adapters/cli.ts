import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { attempt, attemptAsync } from "../core/result"
import type { Diagnostic } from "../core/types"
import { EvidenceFactory, type EvidenceRecord } from "../evidence"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

interface SnapshotSpec {
    id?: string
    command: string[]
    exitCode: number
    stdoutIncludes: string[]
    stdoutExcludes?: string[]
    stderrIncludes?: string[]
    stderrExcludes?: string[]
}

export class CliAdapter implements NativeAdapter {
    readonly id = "cli"
    readonly tool = "cli"
    readonly requiredTools: readonly string[] = []

    async detect(target: string): Promise<boolean> {
        const contractDirectory = join(target, "spec", "contracts", "cli")
        const snapshotPaths = await this.collectSnapshots(contractDirectory)

        return snapshotPaths.length > 0
    }

    async run(context: AdapterContext): Promise<AdapterRun> {
        const contractDirectory = join(context.target, "spec", "contracts", "cli")
        const snapshotPaths = await this.collectSnapshots(contractDirectory)
        if (snapshotPaths.length === 0) return { ran: true, diagnostics: [this.failure("CONTRACT-CLI-NO-SOURCES", "no CLI snapshots found under spec/contracts/cli")] }

        const diagnostics: Diagnostic[] = []
        const evidence: EvidenceRecord[] = []
        for (const snapshotPath of snapshotPaths) {
            const snapshotDiagnostics: Diagnostic[] = []
            const snapshot = await this.readSnapshot(snapshotPath, snapshotDiagnostics)
            diagnostics.push(...snapshotDiagnostics)
            if (snapshot === null) {
                evidence.push(await this.evidenceRecord(context, snapshotPath, snapshotDiagnostics, [], undefined))
                continue
            }
            diagnostics.push(...(await this.checkSnapshot(context, snapshot, snapshotPath)))
            evidence.push(await this.evidenceRecord(context, snapshotPath, diagnostics.filter((diagnostic) => diagnostic.file === snapshotPath), snapshot.command, snapshot.id))
        }

        return { ran: true, diagnostics, evidence }
    }

    private async checkSnapshot(context: AdapterContext, snapshot: SnapshotSpec, snapshotPath: string): Promise<Diagnostic[]> {
        const commandName = snapshot.command[0]
        if (commandName === undefined) {
            return [{ ...this.failure("CONTRACT-CLI-BAD-SNAPSHOT", `invalid CLI snapshot shape in ${basename(snapshotPath)}`), file: snapshotPath }]
        }
        const executable = await context.toolLocator.resolve(commandName)
        if (executable === null) {
            return [{ ...this.failure("CONTRACT-CLI-MISSING-TOOL", `command '${commandName}' is not available`), file: snapshotPath }]
        }
        const [commandResult, commandError] = await context.processRunner.run({ executable, arguments: snapshot.command.slice(1), workingDirectory: context.target })
        if (commandError) {
            return [{ ...this.failure(commandError.code, commandError.message), file: snapshotPath }]
        }
        if (commandResult === null) {
            return [{ ...this.failure("CONTRACT-CLI-INCOMPATIBLE", "cli probe produced no result"), file: snapshotPath }]
        }
        const probeDiagnostic = this.checkProbe(snapshot, snapshotPath, commandResult.exitCode, commandResult.stdout, commandResult.stderr)

        return probeDiagnostic === null ? [] : [probeDiagnostic]
    }

    private async evidenceRecord(context: AdapterContext, snapshotPath: string, diagnostics: Diagnostic[], command: string[], explicitId: string | undefined): Promise<EvidenceRecord> {
        const inputs = await new EvidenceFactory().inputs(context.target, [snapshotPath])
        const failed = diagnostics.some((diagnostic) => diagnostic.level === "error")
        const snapshotName = basename(snapshotPath, ".snapshot.json").toUpperCase().replace(/[^A-Z0-9]+/g, "-")

        return new EvidenceFactory().create({
            id: explicitId ?? `EVD-CLI-${snapshotName}`,
            kind: "cli",
            method: "contract",
            tool: this.tool,
            result: failed ? "fail" : "pass",
            inputs,
            ...(command.length === 0 ? {} : { command }),
            ...(failed ? { details: diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n") } : {}),
        })
    }

    private checkProbe(snapshot: SnapshotSpec, snapshotPath: string, exitCode: number, stdout: string, stderr: string): Diagnostic | null {
        const reasons: string[] = []
        if (exitCode !== snapshot.exitCode) reasons.push(`exit code ${exitCode}, expected ${snapshot.exitCode}`)
        for (const expectedText of snapshot.stdoutIncludes) {
            if (!stdout.includes(expectedText)) reasons.push(`stdout missing "${expectedText}"`)
        }
        for (const forbiddenText of snapshot.stdoutExcludes ?? []) {
            if (stdout.includes(forbiddenText)) reasons.push(`stdout contains excluded "${forbiddenText}"`)
        }
        for (const expectedText of snapshot.stderrIncludes ?? []) {
            if (!stderr.includes(expectedText)) reasons.push(`stderr missing "${expectedText}"`)
        }
        for (const forbiddenText of snapshot.stderrExcludes ?? []) {
            if (stderr.includes(forbiddenText)) reasons.push(`stderr contains excluded "${forbiddenText}"`)
        }
        if (reasons.length === 0) return null

        const tailOutput = this.truncatedTail(stdout, stderr)
        const baseMessage = `cli snapshot ${basename(snapshotPath)} failed: ${reasons.join("; ")}`
        const message = tailOutput === "" ? baseMessage : `${baseMessage}\n${tailOutput}`

        return { level: "error", code: "CONTRACT-CLI-INCOMPATIBLE", message, file: snapshotPath }
    }

    private async collectSnapshots(directory: string): Promise<string[]> {
        const directoryEntries = await readdir(directory, { withFileTypes: true }).catch(() => [])
        const snapshotPaths: string[] = []
        for (const directoryEntry of directoryEntries) {
            if (!directoryEntry.isFile()) continue
            if (!directoryEntry.name.endsWith(".snapshot.json")) continue
            snapshotPaths.push(join(directory, directoryEntry.name))
        }

        return snapshotPaths
    }

    private async readSnapshot(snapshotPath: string, diagnostics: Diagnostic[]): Promise<SnapshotSpec | null> {
        const [snapshotText, readError] = await attemptAsync(() => Bun.file(snapshotPath).text())
        if (readError) {
            diagnostics.push({ ...this.failure("CONTRACT-CLI-BAD-SNAPSHOT", `invalid CLI snapshot shape in ${basename(snapshotPath)}: ${readError}`), file: snapshotPath })
            return null
        }
        if (snapshotText === null) {
            diagnostics.push({ ...this.failure("CONTRACT-CLI-BAD-SNAPSHOT", `invalid CLI snapshot shape in ${basename(snapshotPath)}`), file: snapshotPath })
            return null
        }

        const [parsedValue, parseError] = attempt(() => JSON.parse(snapshotText) as unknown)
        if (parseError) {
            diagnostics.push({ ...this.failure("CONTRACT-CLI-BAD-SNAPSHOT", `invalid CLI snapshot shape in ${basename(snapshotPath)}: ${parseError}`), file: snapshotPath })
            return null
        }
        if (parsedValue === null || !this.isSnapshotSpec(parsedValue)) {
            diagnostics.push({ ...this.failure("CONTRACT-CLI-BAD-SNAPSHOT", `invalid CLI snapshot shape in ${basename(snapshotPath)}`), file: snapshotPath })
            return null
        }

        return parsedValue
    }

    private truncatedTail(stdout: string, stderr: string): string { return `${stdout}\n${stderr}`.trim().slice(-500).trim() }

    private isSnapshotSpec(value: unknown): value is SnapshotSpec {
        if (!this.isRecord(value)) return false
        if (value["id"] !== undefined && (typeof value["id"] !== "string" || value["id"].trim() === "")) return false
        if (!this.isStringList(value["command"])) return false
        if (value["command"].length === 0) return false
        if (typeof value["exitCode"] !== "number" || !Number.isInteger(value["exitCode"])) return false
        if (!this.isStringList(value["stdoutIncludes"])) return false
        if (value["stdoutExcludes"] !== undefined && !this.isStringList(value["stdoutExcludes"])) return false
        if (value["stderrIncludes"] !== undefined && !this.isStringList(value["stderrIncludes"])) return false
        if (value["stderrExcludes"] !== undefined && !this.isStringList(value["stderrExcludes"])) return false

        return true
    }

    private isStringList(value: unknown): value is string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string") }
    private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
    private failure(code: string, message: string): Diagnostic { return { level: "error", code, message } }
}
