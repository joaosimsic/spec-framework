import { join } from "node:path"
import { attempt, attemptAsync, type Result } from "./result"

export type ConfigFailureCode = "SPEC-NO-CONFIG" | "SPEC-BAD-CONFIG"

export interface ConfigFailure {
  code: ConfigFailureCode
  message: string
}

export interface SpecConfig {
  version: number
  profile: string
  project: {
    name: string
    adoption: string
  }
  adapters: {
    architecture?: string
    requirements?: string
    formal?: string
    implementation?: string
    contracts?: string[]
  }
  approval: {
    mode: string
    humanOnly: boolean
  }
}

export class SpecConfigLoader {
  private readonly configPath: string

  constructor(target: string) {
    this.configPath = join(target, "spec", "config.json")
  }

  async load(): Promise<Result<SpecConfig, ConfigFailure>> {
    const [exists, existsError] = await attemptAsync(() => Bun.file(this.configPath).exists())
    if (existsError) {
      return [
        null,
        this.failure("SPEC-NO-CONFIG", `cannot read ${this.configPath}: ${existsError}`),
      ]
    }
    if (!exists) {
      return [null, this.failure("SPEC-NO-CONFIG", `missing ${this.configPath}; run spec init`)]
    }

    const [text, readError] = await attemptAsync(() => Bun.file(this.configPath).text())
    if (readError) {
      return [null, this.failure("SPEC-NO-CONFIG", `cannot read ${this.configPath}: ${readError}`)]
    }
    if (text === null) {
      return [null, this.failure("SPEC-NO-CONFIG", `cannot read ${this.configPath}`)]
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError) {
      return [
        null,
        this.failure("SPEC-BAD-CONFIG", `invalid JSON in ${this.configPath}: ${parseError}`),
      ]
    }

    return this.validate(parsed)
  }

  private validate(value: unknown): Result<SpecConfig, ConfigFailure> {
    if (!this.isRecord(value)) {
      return [null, this.failure("SPEC-BAD-CONFIG", "config must be a JSON object")]
    }

    if (!this.isInteger(value.version)) {
      return [null, this.failure("SPEC-BAD-CONFIG", "version must be an integer")]
    }
    if (typeof value.profile !== "string") {
      return [null, this.failure("SPEC-BAD-CONFIG", "profile must be a string")]
    }

    const project = this.readProject(value.project)
    if ("code" in project) return [null, project]

    const adapters = this.readAdapters(value.adapters)
    if ("code" in adapters) return [null, adapters]

    const approval = this.readApproval(value.approval)
    if ("code" in approval) return [null, approval]

    return [
      {
        version: value.version,
        profile: value.profile,
        project,
        adapters,
        approval,
      },
      null,
    ]
  }

  private readProject(value: unknown): SpecConfig["project"] | ConfigFailure {
    if (!this.isRecord(value)) {
      return this.failure("SPEC-BAD-CONFIG", "project must be an object")
    }
    if (typeof value.name !== "string" || typeof value.adoption !== "string") {
      return this.failure("SPEC-BAD-CONFIG", "project name and adoption must be strings")
    }

    return { name: value.name, adoption: value.adoption }
  }

  private readAdapters(value: unknown): SpecConfig["adapters"] | ConfigFailure {
    if (!this.isRecord(value)) {
      return this.failure("SPEC-BAD-CONFIG", "adapters must be an object")
    }

    for (const key of ["architecture", "requirements", "formal", "implementation"] as const) {
      const adapter = value[key]
      if (adapter !== undefined && typeof adapter !== "string") {
        return this.failure("SPEC-BAD-CONFIG", `adapters.${key} must be a string`)
      }
    }

    const contracts = this.readContractAdapters(value.contracts)
    if (!Array.isArray(contracts)) return contracts

    return {
      architecture: typeof value.architecture === "string" ? value.architecture : undefined,
      requirements: typeof value.requirements === "string" ? value.requirements : undefined,
      formal: typeof value.formal === "string" ? value.formal : undefined,
      implementation: typeof value.implementation === "string" ? value.implementation : undefined,
      contracts,
    }
  }

  private readContractAdapters(value: unknown): string[] | ConfigFailure {
    if (value === undefined) return []
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
      return this.failure("SPEC-BAD-CONFIG", "adapters.contracts must be an array of strings")
    }

    return [...value]
  }

  private readApproval(value: unknown): SpecConfig["approval"] | ConfigFailure {
    if (!this.isRecord(value)) {
      return this.failure("SPEC-BAD-CONFIG", "approval must be an object")
    }
    if (typeof value.mode !== "string" || typeof value.humanOnly !== "boolean") {
      return this.failure(
        "SPEC-BAD-CONFIG",
        "approval mode must be a string and humanOnly a boolean",
      )
    }

    return { mode: value.mode, humanOnly: value.humanOnly }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  private isInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value)
  }

  private failure(code: ConfigFailureCode, message: string): ConfigFailure {
    return { code, message }
  }
}
