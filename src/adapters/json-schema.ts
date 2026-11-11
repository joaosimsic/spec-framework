import Ajv, { type Schema } from "ajv"
import addMetaSchema2020 from "ajv/dist/refs/json-schema-2020-12/index.js"
import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { attempt, attemptAsync } from "../core/result"
import type { Diagnostic } from "../core/types"
import { EvidenceFactory, type EvidenceRecord } from "../evidence"
import type { AdapterContext, AdapterRun, NativeAdapter } from "./types"

type Compatibility = "none" | "backward" | "forward" | "full"

export class JsonSchemaAdapter implements NativeAdapter {
    readonly id = "json-schema"
    readonly tool = "json-schema"
    readonly requiredTools: readonly string[] = []

    async detect(target: string): Promise<boolean> {
        const contractsDirectory = join(target, "spec", "contracts")
        const schemaFiles = await this.collectSchemaFiles(contractsDirectory)

        return schemaFiles.length > 0
    }

    async run(context: AdapterContext): Promise<AdapterRun> {
        const validator = new Ajv({ strict: false })
        addMetaSchema2020.call(validator)

        const contractsDirectory = join(context.target, "spec", "contracts")
        const schemaFiles = await this.collectSchemaFiles(contractsDirectory)
        if (schemaFiles.length === 0) return { ran: true, diagnostics: [this.failure("CONTRACT-JSONSCHEMA-NO-SOURCES", "no JSON Schema contracts found under spec/contracts")] }

        const diagnostics: Diagnostic[] = []
        const evidence: EvidenceRecord[] = []
        for (const filePath of schemaFiles) {
            const schemaDiagnostics = await this.checkSchema(validator, context.target, filePath)
            diagnostics.push(...schemaDiagnostics)
            evidence.push(await this.evidenceRecord(context, filePath, schemaDiagnostics))
        }
        return { ran: true, diagnostics, evidence }
    }

    private async checkSchema(validator: Ajv, target: string, filePath: string): Promise<Diagnostic[]> {
        const diagnostics: Diagnostic[] = []
        const [fileText, readError] = await attemptAsync(() => Bun.file(filePath).text())
        if (readError) {
            return [{ level: "error", code: "CONTRACT-JSONSCHEMA-READ", message: readError, file: filePath }]
        }
        if (fileText === null) {
            return [{ level: "error", code: "CONTRACT-JSONSCHEMA-READ", message: `unreadable schema file ${filePath}`, file: filePath }]
        }

        const schemaDiagnostic = this.validateSchemaFile(validator, filePath, fileText)
        if (schemaDiagnostic !== null) return [schemaDiagnostic]

        const sidecarDiagnostic = await this.validateSidecar(filePath)
        if (sidecarDiagnostic !== null) return [sidecarDiagnostic]

        const baselineDiagnostic = await this.checkBaseline(target, filePath, fileText)
        if (baselineDiagnostic !== null) diagnostics.push(baselineDiagnostic)

        return diagnostics
    }

    private async evidenceRecord(context: AdapterContext, filePath: string, diagnostics: Diagnostic[]): Promise<EvidenceRecord> {
        const schemaBaseName = basename(filePath)
        const contractBaseName = schemaBaseName.slice(0, -".schema.json".length)
        const sidecarPath = join(dirname(filePath), `${contractBaseName}.contract.json`)
        const baselinePath = join(context.target, "spec", "contracts", ".baselines", `${contractBaseName}.sha256`)
        const inputs = await new EvidenceFactory().inputs(context.target, [filePath, sidecarPath, baselinePath])
        const failed = diagnostics.some((diagnostic) => diagnostic.level === "error")
        const contractId = (await this.readContractId(sidecarPath)) ?? `CON-${contractBaseName.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`

        return new EvidenceFactory().create({
            id: `EVD-${contractId}`,
            kind: "json-schema",
            method: "contract",
            tool: this.tool,
            result: failed ? "fail" : "pass",
            inputs,
            ...(failed ? { details: diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n") } : {}),
        })
    }

    private validateSchemaFile(validator: Ajv, filePath: string, text: string): Diagnostic | null {
        const [parsedSchema, parseError] = attempt(() => JSON.parse(text) as Schema)
        if (parseError) return { level: "error", code: "CONTRACT-JSONSCHEMA", message: this.truncatedTail(parseError), file: filePath }
        if (parsedSchema === null) return { level: "error", code: "CONTRACT-JSONSCHEMA", message: "schema parsed to an empty value", file: filePath }

        const [compiledSchema, compileError] = attempt(() => validator.compile(parsedSchema))
        if (compileError) return { level: "error", code: "CONTRACT-JSONSCHEMA", message: this.truncatedTail(compileError), file: filePath }
        if (compiledSchema === null) return { level: "error", code: "CONTRACT-JSONSCHEMA", message: `ajv could not compile schema ${filePath}`, file: filePath }

        return null
    }

    private async readContractId(sidecarPath: string): Promise<string | null> {
        const [text, readError] = await attemptAsync(() => Bun.file(sidecarPath).text())
        if (readError !== null || text === null) return null
        const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
        if (parseError !== null || !this.isRecord(parsed)) return null

        return typeof parsed["id"] === "string" && parsed["id"].trim() !== "" ? parsed["id"] : null
    }

    private async validateSidecar(schemaFilePath: string): Promise<Diagnostic | null> {
        const schemaBaseName = basename(schemaFilePath)
        const contractBaseName = schemaBaseName.slice(0, -".schema.json".length)
        const sidecarPath = join(dirname(schemaFilePath), `${contractBaseName}.contract.json`)

        const [sidecarText, readError] = await attemptAsync(() => Bun.file(sidecarPath).text())
        if (readError) return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: "contract without compatibility policy cannot be approved: missing sidecar", file: sidecarPath }
        if (sidecarText === null) return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: "contract without compatibility policy cannot be approved: unreadable sidecar", file: sidecarPath }

        const [parsedSidecar, parseError] = attempt(() => JSON.parse(sidecarText) as unknown)
        if (parseError) return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: `contract without compatibility policy cannot be approved: invalid JSON ${this.truncatedTail(parseError)}`, file: sidecarPath }
        if (!this.isRecord(parsedSidecar)) return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: "contract without compatibility policy cannot be approved: sidecar must be an object", file: sidecarPath }
        const contractId = parsedSidecar["id"]
        if (typeof contractId !== "string") return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: `contract without compatibility policy cannot be approved: invalid field "id"`, file: sidecarPath }
        const owner = parsedSidecar["owner"]
        if (typeof owner !== "string") return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: `contract without compatibility policy cannot be approved: invalid field "owner"`, file: sidecarPath }
        const consumers = parsedSidecar["consumers"]
        if (!this.isStringList(consumers)) return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: `contract without compatibility policy cannot be approved: invalid field "consumers"`, file: sidecarPath }
        const compatibility = parsedSidecar["compatibility"]
        if (!this.isCompatibility(compatibility)) return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: `contract without compatibility policy cannot be approved: invalid field "compatibility"`, file: sidecarPath }
        const schemaReference = parsedSidecar["schema"]
        if (typeof schemaReference !== "string") return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: `contract without compatibility policy cannot be approved: invalid field "schema"`, file: sidecarPath }
        if (schemaReference !== schemaBaseName) return { level: "error", code: "CONTRACT-JSONSCHEMA-POLICY", message: `contract without compatibility policy cannot be approved: schema mismatch expected ${schemaBaseName} found ${schemaReference}`, file: sidecarPath }

        return null
    }

    private async checkBaseline(target: string, filePath: string, text: string): Promise<Diagnostic | null> {
        const schemaBaseName = basename(filePath)
        const contractBaseName = schemaBaseName.slice(0, -".schema.json".length)
        const baselinePath = join(target, "spec", "contracts", ".baselines", `${contractBaseName}.sha256`)
        const actualHash = createHash("sha256").update(text, "utf8").digest("hex")

        const [baselineText, readError] = await attemptAsync(() => Bun.file(baselinePath).text())
        if (readError) return { level: "warning", code: "CONTRACT-JSONSCHEMA-NO-BASELINE", message: `no baseline hash for ${schemaBaseName}; approval will record one`, file: filePath }
        if (baselineText === null) return { level: "warning", code: "CONTRACT-JSONSCHEMA-NO-BASELINE", message: `no baseline hash for ${schemaBaseName}; approval will record one`, file: filePath }

        const baselineHash = baselineText.trim()
        if (baselineHash !== actualHash) return { level: "error", code: "CONTRACT-JSONSCHEMA-CHANGED", message: `schema hash changed for ${schemaBaseName}: expected ${baselineHash}, found ${actualHash}`, file: filePath }

        return null
    }

    private async collectSchemaFiles(directory: string): Promise<string[]> {
        const directoryEntries = await readdir(directory, { withFileTypes: true }).catch(() => [])
        const schemaFiles: string[] = []
        for (const directoryEntry of directoryEntries) {
            const entryPath = join(directory, directoryEntry.name)
            if (directoryEntry.isDirectory()) {
                schemaFiles.push(...(await this.collectSchemaFiles(entryPath)))
                continue
            }
            if (directoryEntry.isFile() && directoryEntry.name.endsWith(".schema.json")) schemaFiles.push(entryPath)
        }
        return schemaFiles
    }

    private truncatedTail(text: string): string { return text.trim().slice(-500).trim() }
    private isStringList(value: unknown): value is string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string") }
    private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) }
    private isCompatibility(value: unknown): value is Compatibility { return value === "none" || value === "backward" || value === "forward" || value === "full" }
    private failure(code: string, message: string): Diagnostic { return { level: "error", code, message } }
}
