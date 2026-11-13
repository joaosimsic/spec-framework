import { createHash } from "node:crypto"
import type { IrElement, IrRelationship } from "../analysis/ir"
import { fail, ok, type Result } from "../core/result"
import { AiRunRepository, AnalysisIds } from "../persistence"
import type { SnapshotRecord } from "../persistence"
import { AiContextBuilder } from "./context"
import {
  AI_ANSWER_SCHEMA,
  ARCHITECTURE_DIAGNOSIS_SCHEMA,
  INTERPRETATION_SCHEMA,
  RESPONSIBILITY_SCHEMA,
} from "./schemas"
import {
  AI_DIAGNOSIS_RULES,
  type AiAnswer,
  type AiConfig,
  type AiDiagnosisResult,
  type AiDiagnosisSubject,
  type AiHypothesisResult,
  type AiInterpretationResult,
  type AiInterpretationSubject,
  type AiProvider,
} from "./types"
import { AiOutputValidator } from "./validator"

export interface AiInterpreterInput {
  root: string
  snapshot: SnapshotRecord
  elements: IrElement[]
  relationships: IrRelationship[]
  files: string[]
}

export class AiInterpreter {
  constructor(
    private readonly config: AiConfig,
    private readonly provider: AiProvider,
    private readonly runs: AiRunRepository,
  ) {}

  async ask(
    input: AiInterpreterInput,
    question: string,
    targetId: string,
  ): Promise<Result<AiAnswer, string>> {
    const context = await this.context(input, targetId)
    if (context === null) return fail("AI context unavailable")
    const prompt = `Answer the engineer question using only the supplied evidence.\nQuestion: ${question}`
    const [text, providerError] = await this.provider.complete({
      task: "question",
      prompt,
      context: context.text,
      responseSchema: AI_ANSWER_SCHEMA,
    })
    if (providerError !== null || text === null) return fail(providerError ?? "AI provider failed")
    const [answer, validationError] = new AiOutputValidator().validate(text, {
      snapshot: input.snapshot,
      elements: input.elements.map((element) => ({
        id: element.id,
        filePath: element.filePath,
        endLine: element.endLine,
      })),
      files: input.files,
      answer: text,
    })
    if (validationError !== null || answer === null) {
      this.record(input, context.inputHashes, text, "rejected", context.text)
      return fail(validationError ?? "AI output rejected")
    }
    this.record(input, context.inputHashes, text, "valid", context.text)

    return ok(answer)
  }

  async responsibilities(
    input: AiInterpreterInput,
    targetId: string,
  ): Promise<Result<AiAnswer, string>> {
    const context = await this.context(input, targetId)
    if (context === null) return fail("AI context unavailable")
    const [text, providerError] = await this.provider.complete({
      task: "responsibilities",
      prompt: "Describe the apparent responsibilities of the target component with evidence.",
      context: context.text,
      responseSchema: RESPONSIBILITY_SCHEMA,
    })
    if (providerError !== null || text === null) return fail(providerError ?? "AI provider failed")
    const [answer, validationError] = new AiOutputValidator().validate(text, {
      snapshot: input.snapshot,
      elements: input.elements.map((element) => ({
        id: element.id,
        filePath: element.filePath,
        endLine: element.endLine,
      })),
      files: input.files,
      answer: text,
    })
    if (validationError !== null || answer === null) {
      this.record(input, context.inputHashes, text, "rejected", context.text)
      return fail(validationError ?? "AI output rejected")
    }
    this.record(input, context.inputHashes, text, "valid", context.text)

    return ok(answer)
  }

  async componentHypothesis(
    input: AiInterpreterInput,
    targetId: string,
    subject: { label: string; summary: string },
  ): Promise<Result<AiHypothesisResult, string>> {
    const context = await this.context(input, targetId)
    if (context === null) return fail("AI context unavailable")
    const [text, providerError] = await this.provider.complete({
      task: "responsibilities",
      prompt: [
        "Describe the apparent responsibilities of the target component with evidence.",
        `Deterministic label: ${subject.label}`,
        `Deterministic summary: ${subject.summary}`,
        "Do not rename the component or claim completeness.",
      ].join("\n"),
      context: context.text,
      responseSchema: RESPONSIBILITY_SCHEMA,
    })
    if (providerError !== null || text === null) return fail(providerError ?? "AI provider failed")
    const [answer, validationError] = new AiOutputValidator().validate(text, {
      snapshot: input.snapshot,
      elements: input.elements.map((element) => ({
        id: element.id,
        filePath: element.filePath,
        endLine: element.endLine,
      })),
      files: input.files,
      answer: text,
    })
    if (validationError !== null || answer === null) {
      this.record(input, context.inputHashes, text, "rejected", context.text)
      return fail(validationError ?? "AI output rejected")
    }
    this.record(input, context.inputHashes, text, "valid", context.text)

    return ok({
      answer,
      inputHashes: context.inputHashes,
      provider: this.provider.id,
      model: this.provider.model,
      promptVersion: this.config.promptVersion,
    })
  }

  async diagnose(
    input: AiInterpreterInput,
    targetIds: string[],
    subject: AiDiagnosisSubject,
  ): Promise<Result<AiDiagnosisResult, string>> {
    const context = await this.contextMany(input, targetIds)
    if (context === null) return fail("AI context unavailable")
    const [text, providerError] = await this.provider.complete({
      task: "architecture_diagnosis",
      prompt: [
        "Identify only architecture diagnostic hypotheses supported by the supplied evidence.",
        `Target component: ${subject.label} (${subject.id})`,
        `Deterministic summary: ${subject.summary}`,
        `Allowed rules: ${AI_DIAGNOSIS_RULES.join(", ")}`,
        "Known conceptual components:",
        subject.catalog,
        "Return an empty findings array when evidence is insufficient.",
        "Never approve, reject, pass, or fail a check.",
      ].join("\n"),
      context: context.text,
      responseSchema: ARCHITECTURE_DIAGNOSIS_SCHEMA,
    })
    if (providerError !== null || text === null) return fail(providerError ?? "AI provider failed")
    const [findings, validationError] = new AiOutputValidator().validateDiagnosis(text, {
      elements: input.elements.map((element) => ({
        id: element.id,
        filePath: element.filePath,
        endLine: element.endLine,
      })),
      files: input.files,
      conceptualIds: subject.conceptualIds,
    })
    if (validationError !== null || findings === null) {
      this.record(input, context.inputHashes, text, "rejected", context.text)
      return fail(validationError ?? "AI output rejected")
    }
    this.record(input, context.inputHashes, text, "valid", context.text)

    return ok({
      findings,
      inputHashes: context.inputHashes,
      provider: this.provider.id,
      model: this.provider.model,
      promptVersion: this.config.promptVersion,
    })
  }

  async interpret(
    input: AiInterpreterInput,
    subject: AiInterpretationSubject,
    contextText: string,
  ): Promise<Result<AiInterpretationResult, string>> {
    const [text, providerError] = await this.provider.complete({
      task: subject.kind === "contract" ? "contract_interpretation" : "verification_interpretation",
      prompt: [
        `Interpret this ${subject.kind} using only the supplied evidence.`,
        `Target: ${subject.title} (${subject.id})`,
        subject.prompt,
        "Explain what the evidence shows and what a reviewer should inspect.",
        "Do not claim compatibility, completeness, approval, or a verdict.",
      ].join("\n"),
      context: contextText,
      responseSchema: INTERPRETATION_SCHEMA,
    })
    if (providerError !== null || text === null) return fail(providerError ?? "AI provider failed")
    const [interpretation, validationError] = new AiOutputValidator().validateInterpretation(text, {
      files: input.files,
      subject,
    })
    if (validationError !== null || interpretation === null) {
      this.record(
        input,
        [createHash("sha256").update(contextText, "utf8").digest("hex")],
        text,
        "rejected",
        contextText,
      )
      return fail(validationError ?? "AI output rejected")
    }
    const inputHashes = [createHash("sha256").update(contextText, "utf8").digest("hex")]
    this.record(input, inputHashes, text, "valid", contextText)

    return ok({
      interpretation,
      inputHashes,
      provider: this.provider.id,
      model: this.provider.model,
      promptVersion: this.config.promptVersion,
    })
  }

  private async context(input: AiInterpreterInput, targetId: string) {
    return this.contextMany(input, [targetId])
  }

  private async contextMany(input: AiInterpreterInput, targetIds: string[]) {
    const [context, contextError] = await new AiContextBuilder(input.root).buildMany(
      targetIds,
      input.elements,
      input.relationships,
    )
    if (contextError !== null || context === null) return null

    return context
  }

  private record(
    input: AiInterpreterInput,
    inputHashes: string[],
    output: string,
    status: string,
    context: string,
  ): void {
    const now = new Date().toISOString()
    const outputHash = createHash("sha256").update(output, "utf8").digest("hex")
    this.runs.save({
      id: AnalysisIds.prefix(
        "AIRUN-",
        `${input.snapshot.id}\u0000${now}\u0000${outputHash}\u0000${context.length}`,
      ),
      snapshotId: input.snapshot.id,
      provider: this.provider.id,
      model: this.provider.model,
      promptVersion: this.config.promptVersion,
      inputHashes,
      outputHash,
      status,
      createdAt: now,
    })
  }
}
