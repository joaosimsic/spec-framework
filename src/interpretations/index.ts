import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { attemptAsync, fail, ok, type Result } from "../core/result"
import type { IrElement, IrRelationship } from "../analysis/ir"
import type { AiInterpreter } from "../ai/interpreter"
import { SecretRedactor } from "../ai/redaction"
import type {
  InterpretationRequestKind,
  InterpretationRunDetails,
  ProjectRecord,
  SnapshotRecord,
  VerificationRunDetails,
} from "../persistence"
import { AnalysisIds, InterpretationRunRepository } from "../persistence"
import type { GeneratedContractRecord, GeneratedEvidence, GeneratedSpec } from "../spec"

export interface InterpretationInput {
  root: string
  project: ProjectRecord
  snapshot: SnapshotRecord
  spec: GeneratedSpec
  kind: InterpretationRequestKind
  verification: VerificationRunDetails | null
  elements: IrElement[]
  relationships: IrRelationship[]
  files: string[]
  now?: string
}

export class InterpretationRunner {
  constructor(
    private readonly interpreter: AiInterpreter,
    private readonly runs: InterpretationRunRepository,
  ) {}

  async run(input: InterpretationInput): Promise<Result<InterpretationRunDetails, string>> {
    if (input.kind !== "contract" && input.verification === null) {
      return fail("latest verification run is unavailable")
    }
    const evidence = new Map(input.spec.evidence.map((item) => [item.id, item]))
    const knownFiles = this.knownFiles(input, evidence)
    const targets = this.targets(input)
    const createdAt = input.now ?? new Date().toISOString()
    const runId = AnalysisIds.interpretationRun(input.snapshot.id, createdAt)
    const interpretations: InterpretationRunDetails["interpretations"] = []
    const failures: string[] = []

    for (const target of targets) {
      const context = await this.context(input, target, evidence)
      const [result, error] = await this.interpreter.interpret(
        {
          root: input.root,
          snapshot: input.snapshot,
          elements: input.elements,
          relationships: input.relationships,
          files: knownFiles,
        },
        {
          kind: target.kind,
          id: target.id,
          title: target.title,
          prompt: target.prompt,
        },
        context,
      )
      if (error !== null || result === null) {
        failures.push(`${target.title}: ${error ?? "AI interpretation rejected"}`)
        continue
      }
      interpretations.push({
        id: AnalysisIds.interpretation(runId, target.kind, target.id),
        runId,
        targetKind: target.kind,
        targetId: target.id,
        title: target.title,
        text: result.interpretation.text,
        evidence: result.interpretation.evidence,
        confidence: result.interpretation.confidence,
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        inputHashes: result.inputHashes,
      })
    }

    const details: InterpretationRunDetails = {
      run: {
        id: runId,
        projectId: input.project.id,
        snapshotId: input.snapshot.id,
        verificationRunId:
          input.kind === "contract" || input.verification === null
            ? null
            : input.verification.run.id,
        requestKind: input.kind,
        targetCount: interpretations.length,
        failures: failures.sort(),
        createdAt,
      },
      interpretations: interpretations.sort((left, right) => left.id.localeCompare(right.id)),
    }
    const [, saveError] = this.runs.save(details.run, details.interpretations)
    if (saveError !== null) return fail(saveError)
    const [, writeError] = await new InterpretationArtifactWriter().write(input.root, details)
    if (writeError !== null) return fail(writeError)

    return ok(details)
  }

  private targets(input: InterpretationInput): InterpretationTarget[] {
    const targets: InterpretationTarget[] = []
    if (input.kind === "contract" || input.kind === "all") {
      for (const contract of [...input.spec.contracts].sort((left, right) =>
        left.id.localeCompare(right.id),
      )) {
        targets.push({
          kind: "contract",
          id: contract.id,
          title: contract.title,
          prompt: `Observed ${contract.kind} contract with ${contract.surface.length} surface entries.`,
        })
      }
    }
    if (input.kind === "verification" || input.kind === "all") {
      for (const result of input.verification?.results ?? []) {
        if (result.result === "passed" && result.confidence !== "unknown") continue
        targets.push({
          kind: "verification",
          id: result.checkId,
          title: result.checkId,
          prompt: `Configured ${result.method} check with result ${result.result}.`,
        })
      }
    }

    return targets
  }

  private async context(
    input: InterpretationInput,
    target: InterpretationTarget,
    evidence: Map<string, GeneratedEvidence>,
  ): Promise<string> {
    if (target.kind === "contract") {
      const contract = input.spec.contracts.find((item) => item.id === target.id)
      return contract === undefined
        ? `Contract ${target.id}`
        : this.contractContext(input, contract, evidence)
    }
    const result = input.verification?.results.find((item) => item.checkId === target.id)
    return result === undefined
      ? `Verification check ${target.id}`
      : this.verificationContext(input, result)
  }

  private async contractContext(
    input: InterpretationInput,
    contract: GeneratedContractRecord,
    evidence: Map<string, GeneratedEvidence>,
  ): Promise<string> {
    const items = contract.evidence
      .map((id) => evidence.get(id))
      .filter((item): item is GeneratedEvidence => item !== undefined)
    const excerpts: string[] = []
    for (const item of items) {
      if (item.file.trim() === "") continue
      const excerpt = await this.excerpt(input.root, item.file, item.line)
      if (excerpt !== "") excerpts.push(excerpt)
    }

    return SecretRedactor.redact(
      [
        `Contract ${contract.id}`,
        `Title: ${contract.title}`,
        `Kind: ${contract.kind}`,
        `Owner: ${contract.owner ?? "none"}`,
        `Confidence: ${contract.confidence}`,
        "Surface:",
        ...contract.surface.map((value) => `- ${value}`),
        "Evidence:",
        ...items.map((item) => `- ${item.file}:${item.line} ${item.reference}`),
        ...(excerpts.length === 0 ? [] : ["Source excerpts:", ...excerpts]),
      ].join("\n"),
    ).slice(0, 12000)
  }

  private verificationContext(
    input: InterpretationInput,
    result: VerificationRunDetails["results"][number],
  ): string {
    const target = input.spec.verification.find(
      (record) => record.title === result.checkId && record.method === result.method,
    )

    return SecretRedactor.redact(
      [
        `Verification run ${input.verification?.run.id ?? "unknown"}`,
        `Check ${result.checkId}`,
        `Method: ${result.method}`,
        `Result: ${result.result}`,
        `Confidence: ${result.confidence}`,
        `Command: ${result.command.join(" ")}`,
        `Working directory: ${result.workingDirectory}`,
        `Exit code: ${result.exitCode ?? "none"}`,
        `Timed out: ${result.timedOut}`,
        `Duration: ${result.durationMs}ms`,
        `Output hash: ${result.outputHash}`,
        ...(target === undefined
          ? []
          : [
              `Spec target: ${target.title}`,
              `Target command: ${target.target}`,
              `Target status: ${target.status}`,
            ]),
        "Bounded output:",
        result.output,
      ].join("\n"),
    ).slice(0, 12000)
  }

  private async excerpt(root: string, filePath: string, line: number): Promise<string> {
    const [text] = await attemptAsync(() => Bun.file(join(root, filePath)).text())
    if (text === null) return ""
    const lines = text.split(/\r?\n/)
    const start = Math.max(1, line - 2)
    const end = Math.min(lines.length, line + 30)
    if (start > end) return ""

    return `source ${filePath}:${start}-${end}\n${lines
      .slice(start - 1, end)
      .join("\n")
      .slice(0, 3000)}`
  }

  private knownFiles(
    input: InterpretationInput,
    evidence: Map<string, GeneratedEvidence>,
  ): string[] {
    return [
      ...new Set([
        ...input.files,
        ...input.spec.contracts.flatMap((contract) =>
          contract.evidence.flatMap((id) => {
            const item = evidence.get(id)
            return item === undefined || item.file.trim() === "" ? [] : [item.file]
          }),
        ),
        "package.json",
        "spec-framework.json",
      ]),
    ].sort()
  }
}

interface InterpretationTarget {
  kind: "contract" | "verification"
  id: string
  title: string
  prompt: string
}

export class InterpretationArtifactWriter {
  async write(root: string, details: InterpretationRunDetails): Promise<Result<string, string>> {
    const path = join(root, "spec", "generated", "interpretations.gen.json")
    const [written, writeError] = await attemptAsync(async () => {
      await mkdir(dirname(path), { recursive: true })
      await Bun.write(
        path,
        `${JSON.stringify({ version: 1, run: details.run, interpretations: details.interpretations }, null, 2)}\n`,
      )
      return path
    })
    if (writeError !== null || written === null) {
      return fail(writeError ?? "interpretation artifact was not written")
    }

    return ok(written)
  }
}
