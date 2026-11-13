import { fail, ok, type Result } from "../core/result"
import { EvidenceHasher } from "./hash"
import {
  EVIDENCE_VERSION,
  type EvidenceFailure,
  type EvidenceMethod,
  type EvidenceRecord,
  type EvidenceResult,
} from "./types"

const METHODS: EvidenceMethod[] = [
  "formal",
  "test",
  "analysis",
  "inspection",
  "demonstration",
  "preflight",
  "contract",
]

const RESULTS: EvidenceResult[] = ["pass", "fail", "incompatible", "compatible", "skipped"]

const EVIDENCE_ID = /^EVD-[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/

export class EvidenceCollector {
  collect(records: EvidenceRecord[]): Result<EvidenceRecord[], EvidenceFailure> {
    const byId = new Map<string, EvidenceRecord>()

    for (const record of records) {
      const [validated, validationError] = this.validate(record)
      if (validationError !== null) return fail(validationError)
      if (validated === null) return fail(this.failure("EVIDENCE-BAD-RECORD", "record failed"))
      if (byId.has(validated.id)) {
        return fail(
          this.failure("EVIDENCE-DUPLICATE-ID", `duplicate evidence id '${validated.id}'`),
        )
      }

      byId.set(validated.id, validated)
    }

    return ok([...byId.values()].sort((left, right) => left.id.localeCompare(right.id)))
  }

  validate(value: unknown): Result<EvidenceRecord, EvidenceFailure> {
    if (!this.isRecord(value)) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", "evidence must be an object"))
    }
    if (value["version"] !== EVIDENCE_VERSION) {
      return fail(
        this.failure(
          "EVIDENCE-BAD-RECORD",
          `unsupported evidence version '${String(value["version"])}'`,
        ),
      )
    }
    if (!this.isNonEmptyString(value["id"]) || !EVIDENCE_ID.test(value["id"])) {
      return fail(
        this.failure("EVIDENCE-BAD-RECORD", "evidence id must be a safe EVD-* identifier"),
      )
    }
    if (!this.isNonEmptyString(value["kind"])) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${value["id"]} kind is invalid`))
    }
    if (!METHODS.includes(value["method"] as EvidenceMethod)) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${value["id"]} method is invalid`))
    }
    if (!this.isNonEmptyString(value["tool"])) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${value["id"]} tool is invalid`))
    }
    if (!RESULTS.includes(value["result"] as EvidenceResult)) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${value["id"]} result is invalid`))
    }
    if (!this.isNonEmptyString(value["hash"]) || !this.isNonEmptyString(value["input_hash"])) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${value["id"]} hashes are invalid`))
    }

    const [inputs, inputError] = this.readInputs(value["inputs"], value["id"])
    if (inputError !== null) return fail(inputError)
    if (inputs === null) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${value["id"]} inputs failed`))
    }

    const [command, commandError] = this.readCommand(value["command"], value["id"])
    if (commandError !== null) return fail(commandError)

    const details = value["details"]
    if (details !== undefined && typeof details !== "string") {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${value["id"]} details is invalid`))
    }

    const record: EvidenceRecord = {
      version: EVIDENCE_VERSION,
      id: value["id"],
      kind: value["kind"],
      method: value["method"] as EvidenceMethod,
      tool: value["tool"],
      result: value["result"] as EvidenceResult,
      hash: value["hash"],
      input_hash: value["input_hash"],
      inputs,
      ...(command === null ? {} : { command }),
      ...(details === undefined ? {} : { details }),
    }

    if (EvidenceHasher.recordHash(record) !== record.hash) {
      return fail(
        this.failure("EVIDENCE-BAD-HASH", `evidence ${record.id} hash does not match its content`),
      )
    }
    if (EvidenceHasher.inputHash(record.inputs) !== record.input_hash) {
      return fail(
        this.failure("EVIDENCE-BAD-HASH", `evidence ${record.id} input hash does not match`),
      )
    }

    return ok(record)
  }

  private readInputs(
    value: unknown,
    id: string,
  ): Result<EvidenceRecord["inputs"], EvidenceFailure> {
    if (!Array.isArray(value)) {
      return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${id} inputs must be an array`))
    }

    const inputs: EvidenceRecord["inputs"] = []
    for (const candidate of value) {
      if (!this.isRecord(candidate)) {
        return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${id} input must be an object`))
      }
      if (!this.isNonEmptyString(candidate["path"]) || !this.isNonEmptyString(candidate["hash"])) {
        return fail(this.failure("EVIDENCE-BAD-RECORD", `evidence ${id} input is invalid`))
      }
      inputs.push({ path: candidate["path"], hash: candidate["hash"] })
    }

    return ok(inputs)
  }

  private readCommand(value: unknown, id: string): Result<string[] | null, EvidenceFailure> {
    if (value === undefined) return ok(null)
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
      return fail(
        this.failure("EVIDENCE-BAD-RECORD", `evidence ${id} command must be a string array`),
      )
    }

    return ok([...value])
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim() !== ""
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  private failure(code: EvidenceFailure["code"], message: string): EvidenceFailure {
    return { code, message }
  }
}
