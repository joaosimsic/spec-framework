import { createHash } from "node:crypto"
import type { IrElement, IrRelationship } from "../analysis/ir"
import { fail, ok, type Result } from "../core/result"
import { AiRunRepository, AnalysisIds } from "../persistence"
import type { SnapshotRecord } from "../persistence"
import { AiContextBuilder } from "./context"
import { AI_ANSWER_SCHEMA, RESPONSIBILITY_SCHEMA } from "./schemas"
import type { AiAnswer, AiConfig, AiProvider } from "./types"
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

  private async context(input: AiInterpreterInput, targetId: string) {
    const [context, contextError] = await new AiContextBuilder(input.root).build(
      targetId,
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
    this.runs.save({
      id: AnalysisIds.prefix("AIRUN-", `${input.snapshot.id}\u0000${now}\u0000${context.length}`),
      snapshotId: input.snapshot.id,
      provider: this.provider.id,
      model: this.provider.model,
      promptVersion: this.config.promptVersion,
      inputHashes,
      outputHash: createHash("sha256").update(output, "utf8").digest("hex"),
      status,
      createdAt: now,
    })
  }
}
