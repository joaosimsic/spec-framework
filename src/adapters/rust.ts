import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve } from "node:path"
import { attempt, attemptAsync, type Result } from "../core/result"
import type { Diagnostic } from "../core/types"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

type Compatibility = "none" | "backward" | "forward" | "full"
type BaselineKind = "version" | "rev" | "root"

interface RustBaseline {
    kind: BaselineKind
    value: string
}

interface RustContractPolicy {
    id: string
    owner: string
    consumers: string[]
    compatibility: Compatibility
    packageName: string
    manifestPath: string
    baseline: RustBaseline | null
}

const IGNORED_DIRECTORIES = new Set([
    ".git",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "spec",
    "target",
    "vendor",
])

export class RustAdapter implements NativeAdapter {
    readonly id = "rust"
    readonly tool = "cargo"
    readonly requiredTools = ["cargo", "cargo-public-api"]

    async detect(target: string): Promise<boolean> {
        const contractDirectory = join(target, "spec", "contracts", "rust")
        const contractFiles = await this.collectContractFiles(contractDirectory)
        if (contractFiles.length > 0) return true

        return this.hasCargoManifest(target)
    }

    async run(context: AdapterContext): Promise<AdapterRun> {
        const contractDirectory = join(context.target, "spec", "contracts", "rust")
        const contractFiles = await this.collectContractFiles(contractDirectory)
        if (contractFiles.length === 0) {
            return {
                ran: true,
                diagnostics: [
                    this.failure(
                        "CONTRACT-RUST-NO-SOURCES",
                        "no Rust contract sidecars found under spec/contracts/rust",
                    ),
                ],
            }
        }

        const diagnostics: Diagnostic[] = []
        for (const contractFile of contractFiles) {
            diagnostics.push(...(await this.checkContract(context, contractFile)))
        }

        return { ran: true, diagnostics }
    }

    private async checkContract(
        context: AdapterContext,
        contractFile: string,
    ): Promise<Diagnostic[]> {
        const [policyText, readError] = await attemptAsync(() => Bun.file(contractFile).text())
        if (readError) return [this.policyFailure(contractFile, readError)]
        if (policyText === null) {
            return [this.policyFailure(contractFile, "contract sidecar is unreadable")]
        }

        const [policy, policyDiagnostic] = this.readPolicy(policyText, contractFile, context.target)
        if (policyDiagnostic !== null) return [policyDiagnostic]
        if (policy === null) {
            return [this.policyFailure(contractFile, "contract sidecar parsed to an empty value")]
        }

        const publicApiExecutable = await context.toolLocator.resolve("cargo-public-api")
        if (publicApiExecutable === null) {
            return [
                this.failure(
                    "CONTRACT-RUST-MISSING-TOOL",
                    "cargo-public-api is required for Rust contracts; install cargo-public-api",
                    contractFile,
                ),
            ]
        }

        const [publicApiResult, publicApiError] = await context.processRunner.run({
            executable: publicApiExecutable,
            arguments: [
                "--manifest-path",
                policy.manifestPath,
                "--package",
                policy.packageName,
                "-sss",
                "--color",
                "never",
            ],
            workingDirectory: context.target,
        })
        if (publicApiError) {
            return [this.failure(publicApiError.code, publicApiError.message, contractFile)]
        }
        if (publicApiResult === null) {
            return [
                this.failure(
                    "CONTRACT-RUST-PUBLIC-API",
                    "cargo-public-api produced no result",
                    contractFile,
                ),
            ]
        }
        if (publicApiResult.exitCode !== 0) {
            return [
                this.failure(
                    "CONTRACT-RUST-PUBLIC-API",
                    this.outputTail(
                        "cargo-public-api failed",
                        publicApiResult.stdout,
                        publicApiResult.stderr,
                    ),
                    contractFile,
                ),
            ]
        }

        const publicApi = this.normalizePublicApi(publicApiResult.stdout)
        if (publicApi === "") {
            return [
                this.failure(
                    "CONTRACT-RUST-PUBLIC-API",
                    "cargo-public-api returned an empty public API",
                    contractFile,
                ),
            ]
        }

        const diagnostics: Diagnostic[] = []
        const baselineDiagnostic = await this.checkBaseline(
            context.target,
            contractFile,
            publicApi,
            policy.compatibility,
        )
        if (baselineDiagnostic !== null) diagnostics.push(baselineDiagnostic)

        if (policy.compatibility !== "none") {
            const semverDiagnostic = await this.checkCompatibility(context, contractFile, policy)
            if (semverDiagnostic !== null) diagnostics.push(semverDiagnostic)
        }

        return diagnostics
    }

    private async checkCompatibility(
        context: AdapterContext,
        contractFile: string,
        policy: RustContractPolicy,
    ): Promise<Diagnostic | null> {
        if (policy.baseline === null) {
            return this.policyFailure(
                contractFile,
                `compatibility '${policy.compatibility}' requires a baseline`,
            )
        }

        const semverExecutable = await context.toolLocator.resolve("cargo-semver-checks")
        if (semverExecutable === null) {
            return this.failure(
                "CONTRACT-RUST-MISSING-TOOL",
                "cargo-semver-checks is required for Rust compatibility checks; " +
                    "install cargo-semver-checks",
                contractFile,
            )
        }

        const [semverResult, semverError] = await context.processRunner.run({
            executable: semverExecutable,
            arguments: this.compatibilityArguments(policy),
            workingDirectory: context.target,
        })
        if (semverError) {
            return this.failure(semverError.code, semverError.message, contractFile)
        }
        if (semverResult === null) {
            return this.failure(
                "CONTRACT-RUST-INCOMPATIBLE",
                "cargo-semver-checks produced no result",
                contractFile,
            )
        }
        if (semverResult.exitCode === 0) return null

        return this.failure(
            "CONTRACT-RUST-INCOMPATIBLE",
            this.outputTail(
                `cargo-semver-checks rejected ${policy.packageName}`,
                semverResult.stdout,
                semverResult.stderr,
            ),
            contractFile,
        )
    }

    private compatibilityArguments(policy: RustContractPolicy): string[] {
        const argumentsList = [
            "check-release",
            "--manifest-path",
            policy.manifestPath,
            "--package",
            policy.packageName,
        ]
        if (policy.baseline === null) return argumentsList

        return [...argumentsList, `--baseline-${policy.baseline.kind}`, policy.baseline.value]
    }

    private async checkBaseline(
        target: string,
        contractFile: string,
        publicApi: string,
        compatibility: Compatibility,
    ): Promise<Diagnostic | null> {
        const contractBaseName = basename(contractFile).slice(0, -".contract.json".length)
        const baselinePath = join(
            target,
            "spec",
            "contracts",
            ".baselines",
            `${contractBaseName}.rust-public-api.sha256`,
        )
        const actualHash = createHash("sha256").update(publicApi, "utf8").digest("hex")

        const [baselineText, readError] = await attemptAsync(() => Bun.file(baselinePath).text())
        if (readError || baselineText === null) {
            if (compatibility === "none") return null

            return {
                level: "warning",
                code: "CONTRACT-RUST-NO-BASELINE",
                message:
                    `no Rust public API baseline for ${basename(contractFile)}; ` +
                    "approval will record one",
                file: contractFile,
            }
        }

        const baselineHash = baselineText.trim()
        if (baselineHash === actualHash) return null

        return {
            level: "error",
            code: "CONTRACT-RUST-CHANGED",
            message:
                `Rust public API hash changed for ${basename(contractFile)}: ` +
                `expected ${baselineHash}, found ${actualHash}`,
            file: contractFile,
        }
    }

    private readPolicy(
        text: string,
        contractFile: string,
        target: string,
    ): Result<RustContractPolicy, Diagnostic> {
        const [parsedValue, parseError] = attempt(() => JSON.parse(text) as unknown)
        if (parseError) {
            return [null, this.policyFailure(contractFile, `invalid JSON: ${parseError}`)]
        }
        if (!this.isRecord(parsedValue)) {
            return [null, this.policyFailure(contractFile, "contract sidecar must be an object")]
        }

        const id = parsedValue["id"]
        if (typeof id !== "string" || id.trim() === "") {
            return [null, this.policyFailure(contractFile, 'invalid field "id"')]
        }
        const owner = parsedValue["owner"]
        if (typeof owner !== "string" || owner.trim() === "") {
            return [null, this.policyFailure(contractFile, 'invalid field "owner"')]
        }
        const consumers = parsedValue["consumers"]
        if (!this.isStringList(consumers)) {
            return [null, this.policyFailure(contractFile, 'invalid field "consumers"')]
        }
        const compatibility = parsedValue["compatibility"]
        if (!this.isCompatibility(compatibility)) {
            return [null, this.policyFailure(contractFile, 'invalid field "compatibility"')]
        }
        const packageName = parsedValue["package"]
        if (typeof packageName !== "string" || packageName.trim() === "") {
            return [null, this.policyFailure(contractFile, 'invalid field "package"')]
        }

        const manifestValue = parsedValue["manifest"]
        if (manifestValue !== undefined && typeof manifestValue !== "string") {
            return [null, this.policyFailure(contractFile, 'invalid field "manifest"')]
        }
        const manifestPath = this.resolveProjectPath(
            target,
            typeof manifestValue === "string" ? manifestValue : "Cargo.toml",
        )
        if (manifestPath === null) {
            return [null, this.policyFailure(contractFile, 'invalid field "manifest"')]
        }

        const [baseline, baselineDiagnostic] = this.readBaseline(
            parsedValue["baseline"],
            contractFile,
            target,
        )
        if (baselineDiagnostic !== null) return [null, baselineDiagnostic]
        if (compatibility !== "none" && baseline === null) {
            return [
                null,
                this.policyFailure(
                    contractFile,
                    `compatibility '${compatibility}' requires a baseline`,
                ),
            ]
        }

        return [
            {
                id,
                owner,
                consumers,
                compatibility,
                packageName,
                manifestPath,
                baseline,
            },
            null,
        ]
    }

    private readBaseline(
        value: unknown,
        contractFile: string,
        target: string,
    ): Result<RustBaseline | null, Diagnostic> {
        if (value === undefined) return [null, null]
        if (!this.isRecord(value)) {
            return [null, this.policyFailure(contractFile, 'invalid field "baseline"')]
        }

        const kinds: BaselineKind[] = ["version", "rev", "root"]
        const presentKinds = kinds.filter((kind) => value[kind] !== undefined)
        if (presentKinds.length !== 1) {
            return [
                null,
                this.policyFailure(
                    contractFile,
                    'baseline must contain exactly one of "version", "rev", or "root"',
                ),
            ]
        }

        const kind = presentKinds[0]
        if (kind === undefined) {
            return [null, this.policyFailure(contractFile, 'invalid field "baseline"')]
        }
        const rawValue = value[kind]
        if (typeof rawValue !== "string" || rawValue.trim() === "") {
            return [
                null,
                this.policyFailure(contractFile, `invalid baseline field "${kind}"`),
            ]
        }

        if (kind !== "root") return [{ kind, value: rawValue }, null]

        const rootPath = this.resolveProjectPath(target, rawValue)
        if (rootPath === null) {
            return [null, this.policyFailure(contractFile, 'invalid baseline field "root"')]
        }

        return [{ kind, value: rootPath }, null]
    }

    private resolveProjectPath(target: string, value: string): string | null {
        if (value.trim() === "") return null
        if (isAbsolute(value)) return null

        const resolved = resolve(target, value)
        const relativePath = relative(target, resolved)
        if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
            return null
        }

        return resolved
    }

    private normalizePublicApi(text: string): string {
        const headerPattern = /^(Documenting|Finished|Public API (for|of)|note:|warning:)/i

        return text
            .split(/\r?\n/)
            .map((line) => line.trimEnd())
            .filter((line) => line.trim() !== "")
            .filter((line) => !headerPattern.test(line.trim()))
            .join("\n")
    }

    private async collectContractFiles(directory: string): Promise<string[]> {
        const directoryEntries = await readdir(directory, { withFileTypes: true }).catch(() => [])
        const contractFiles: string[] = []

        for (const directoryEntry of directoryEntries) {
            const entryPath = join(directory, directoryEntry.name)
            if (directoryEntry.isDirectory()) {
                contractFiles.push(...(await this.collectContractFiles(entryPath)))
                continue
            }
            if (!directoryEntry.isFile()) continue
            if (!directoryEntry.name.endsWith(".contract.json")) continue
            contractFiles.push(entryPath)
        }

        return contractFiles.sort()
    }

    private async hasCargoManifest(target: string): Promise<boolean> {
        const pending: Array<{ directory: string; depth: number }> = [
            { directory: target, depth: 0 },
        ]

        while (pending.length > 0) {
            const current = pending.pop()
            if (current === undefined) continue

            const directoryEntries = await readdir(current.directory, {
                withFileTypes: true,
            }).catch(() => [])
            for (const directoryEntry of directoryEntries) {
                if (directoryEntry.isFile() && directoryEntry.name === "Cargo.toml") return true
                if (!directoryEntry.isDirectory()) continue
                if (current.depth >= 4) continue
                if (IGNORED_DIRECTORIES.has(directoryEntry.name)) continue
                pending.push({
                    directory: join(current.directory, directoryEntry.name),
                    depth: current.depth + 1,
                })
            }
        }

        return false
    }

    private outputTail(message: string, stdout: string, stderr: string): string {
        const tail = `${stdout}\n${stderr}`.trim().slice(-500).trim()

        return tail === "" ? message : `${message}: ${tail}`
    }

    private policyFailure(contractFile: string, message: string): Diagnostic {
        return this.failure(
            "CONTRACT-RUST-POLICY",
            `contract without compatibility policy cannot be approved: ${message}`,
            contractFile,
        )
    }

    private failure(code: string, message: string, file?: string): Diagnostic {
        return { level: "error", code, message, file }
    }

    private isStringList(value: unknown): value is string[] {
        return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    }

    private isRecord(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value)
    }

    private isCompatibility(value: unknown): value is Compatibility {
        return value === "none" || value === "backward" || value === "forward" || value === "full"
    }
}
