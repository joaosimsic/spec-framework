import { isAbsolute, relative, resolve } from "node:path"
import { attempt, fail, type Result, ok } from "../core/result"
import type { CheckConfig } from "../config"
import {
  GeneratedSpecIdentity,
  type GeneratedEvidence,
  type GeneratedVerificationRecord,
} from "../spec"

export interface CheckExecution {
  checkId: string
  method: GeneratedVerificationRecord["method"]
  command: string[]
  workingDirectory: string
  result: GeneratedVerificationRecord["result"]
  confidence: GeneratedVerificationRecord["confidence"]
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  output: string
  outputHash: string
  inputHashes: string[]
}

export interface CheckRun {
  records: GeneratedVerificationRecord[]
  evidence: GeneratedEvidence[]
  output: string[]
  executions: CheckExecution[]
}

export class CheckRunner {
  async run(root: string, checks: CheckConfig[]): Promise<Result<CheckRun, string>> {
    const ids = new Set<string>()
    for (const check of checks) {
      if (check.id.trim() === "") return fail("check id must not be empty")
      if (ids.has(check.id)) return fail(`duplicate check id ${check.id}`)
      ids.add(check.id)
      if (!Number.isInteger(check.timeoutMs) || check.timeoutMs <= 0) {
        return fail(`check ${check.id} has an invalid timeout`)
      }
    }

    const records: GeneratedVerificationRecord[] = []
    const evidence: GeneratedEvidence[] = []
    const output: string[] = []
    const executions: CheckExecution[] = []

    for (const check of checks) {
      const workingDirectory = this.workingDirectory(root, check.workingDirectory)
      if (workingDirectory === null) {
        return fail(`check ${check.id} working directory escapes the repository`)
      }
      const started = performance.now()
      const [result, runError] = attempt(() =>
        Bun.spawnSync(check.command, {
          cwd: workingDirectory,
          timeout: check.timeoutMs,
          stdout: "pipe",
          stderr: "pipe",
        }),
      )
      const durationMs = Math.max(0, Math.round(performance.now() - started))
      const timedOut =
        result !== null && (result as { exitedDueToTimeout?: boolean }).exitedDueToTimeout === true
      const exitCode = result?.exitCode ?? null
      const passed = runError === null && result !== null && !timedOut && exitCode === 0
      const confidence: GeneratedVerificationRecord["confidence"] =
        runError === null && result !== null ? "observed" : "unknown"
      const text =
        result === null
          ? (runError ?? "command failed")
          : Buffer.from(result.stderr.length > 0 ? result.stderr : result.stdout).toString("utf8")
      const trimmed = text.trim()
      const detail = trimmed.slice(-500)
      const outputHash = GeneratedSpecIdentity.digest(
        `${check.id}\u0000${exitCode ?? "none"}\u0000${timedOut}\u0000${trimmed}`,
      )
      records.push(this.record(check, passed ? "passed" : "failed", confidence, evidence))
      executions.push({
        checkId: check.id,
        method: this.method(check),
        command: check.command,
        workingDirectory: check.workingDirectory,
        result: passed ? "passed" : "failed",
        confidence,
        exitCode,
        timedOut,
        durationMs,
        output: trimmed.slice(-4000),
        outputHash,
        inputHashes: [GeneratedSpecIdentity.digest(JSON.stringify(check))],
      })
      output.push(
        `${check.id}: ${passed ? "passed" : timedOut ? "timed out" : `failed (${exitCode ?? "no exit"})`}${detail === "" ? "" : `\n${detail}`}`,
      )
    }

    return ok({ records, evidence, output, executions })
  }

  private workingDirectory(root: string, value: string): string | null {
    const target = resolve(root, value)
    const relativePath = relative(root, target)

    return relativePath.startsWith("..") || isAbsolute(relativePath) ? null : target
  }

  private method(check: CheckConfig): GeneratedVerificationRecord["method"] {
    return check.kind === "typecheck" ? "compiler" : check.kind === "test" ? "test" : "external"
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
      method: this.method(check),
      title: check.id,
      target: check.command.join(" "),
      result,
      evidence: [item.id],
      confidence,
      status: confidence,
    }
  }
}
