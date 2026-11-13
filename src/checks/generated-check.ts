import { fail, ok, type Result } from "../core/result"
import { SpecFrameworkConfigLoader } from "../config"
import { GeneratedSpecValidator, type GeneratedSpec } from "../spec"
import { CheckRunner } from "./runner"

export interface GeneratedCheckResult {
  errors: number
  warnings: number
  findings: string[]
  output: string[]
}

export class GeneratedCheck {
  async run(root: string, spec: GeneratedSpec): Promise<Result<GeneratedCheckResult, string>> {
    const findings: string[] = []
    const validator = new GeneratedSpecValidator()
    const [validated, validationError] = validator.check(spec)
    if (validationError !== null) findings.push(validationError)
    if (validated !== null) {
      const [, referenceError] = validator.checkReferences(validated)
      if (referenceError !== null) findings.push(referenceError)
    }
    const [config, configError] = await new SpecFrameworkConfigLoader(root).load()
    if (configError !== null || config === null) return fail(configError ?? "config unavailable")
    const [checks, checkError] = await new CheckRunner().run(root, config.checks)
    if (checkError !== null || checks === null) return fail(checkError ?? "checks unavailable")
    for (const record of checks.records) {
      if (record.result === "failed") findings.push(`${record.title}: failed`)
    }
    findings.push(...checks.output.filter((line) => line.includes(": failed")))

    return ok({ errors: findings.length, warnings: 0, findings, output: checks.output })
  }
}
