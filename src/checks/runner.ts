import { join } from "node:path"
import { attempt, type Result, ok } from "../core/result"
import type { CheckConfig } from "../config"
import {
  GeneratedSpecIdentity,
  type GeneratedEvidence,
  type GeneratedVerificationRecord,
} from "../spec"

export interface CheckRun {
  records: GeneratedVerificationRecord[]
  evidence: GeneratedEvidence[]
  output: string[]
}

export class CheckRunner {
  async run(root: string, checks: CheckConfig[]): Promise<Result<CheckRun, string>> {
    const records: GeneratedVerificationRecord[] = []
    const evidence: GeneratedEvidence[] = []
    const output: string[] = []

    for (const check of checks) {
      const [result, runError] = attempt(() =>
        Bun.spawnSync(check.command, {
          cwd: join(root, check.workingDirectory),
          timeout: check.timeoutMs,
          stdout: "pipe",
          stderr: "pipe",
        }),
      )
      if (runError !== null || result === null) {
        records.push(this.record(check, "failed", "unknown", evidence))
        output.push(`${check.id}: ${runError ?? "command failed"}`)
        continue
      }
      const passed = result.exitCode === 0
      records.push(this.record(check, passed ? "passed" : "failed", "observed", evidence))
      const detail = Buffer.from(result.stderr.length > 0 ? result.stderr : result.stdout)
        .toString("utf8")
        .trim()
        .slice(-500)
      output.push(
        `${check.id}: ${passed ? "passed" : `failed (${result.exitCode})`}${detail === "" ? "" : `\n${detail}`}`,
      )
    }

    return ok({ records, evidence, output })
  }

  private record(
    check: CheckConfig,
    result: GeneratedVerificationRecord["result"],
    confidence: GeneratedVerificationRecord["confidence"],
    evidence: GeneratedEvidence[],
  ): GeneratedVerificationRecord {
    const item: GeneratedEvidence = {
      id: GeneratedSpecIdentity.evidence(`check:${check.id}:${result}`),
      kind: "command",
      reference: check.command.join(" "),
      file: "spec-framework.json",
      line: 1,
      hash: GeneratedSpecIdentity.digest(`${check.id}:${check.command.join(" ")}:${result}`),
    }
    evidence.push(item)

    return {
      id: GeneratedSpecIdentity.verification(`check:${check.id}`),
      method: check.kind === "typecheck" ? "compiler" : check.kind === "test" ? "test" : "external",
      title: check.id,
      target: check.command.join(" "),
      result,
      evidence: [item.id],
      confidence,
      status: confidence,
    }
  }
}
