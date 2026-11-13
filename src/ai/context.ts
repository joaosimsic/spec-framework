import { createHash } from "node:crypto"
import { join } from "node:path"
import { attemptAsync, type Result, ok, fail } from "../core/result"
import type { IrElement, IrRelationship } from "../analysis/ir"
import { SecretRedactor } from "./redaction"

export interface AiContext {
  text: string
  inputHashes: string[]
  files: string[]
}

export class AiContextBuilder {
  constructor(
    private readonly root: string,
    private readonly budget = 12000,
  ) {}

  async build(
    targetId: string,
    elements: IrElement[],
    relationships: IrRelationship[],
  ): Promise<Result<AiContext, string>> {
    return this.buildMany([targetId], elements, relationships)
  }

  async buildMany(
    targetIds: string[],
    elements: IrElement[],
    relationships: IrRelationship[],
  ): Promise<Result<AiContext, string>> {
    const byId = new Map(elements.map((element) => [element.id, element]))
    const targets = [...new Set(targetIds)].sort()
    if (targets.length === 0) return fail("AI context has no targets")
    for (const id of targets) {
      if (!byId.has(id)) return fail(`AI context target does not exist: ${id}`)
    }
    const targetSet = new Set(targets)
    const neighborIds = relationships
      .filter(
        (relationship) =>
          targetSet.has(relationship.sourceId) || targetSet.has(relationship.targetId),
      )
      .flatMap((relationship) =>
        targetSet.has(relationship.sourceId) ? [relationship.targetId] : [relationship.sourceId],
      )
      .filter((id) => !targetSet.has(id))
      .sort()
    const ids = [...targets, ...neighborIds].slice(0, 80)
    const lines = ids.flatMap((id) => {
      const element = byId.get(id)
      return element === undefined ? [] : [this.describe(element)]
    })
    const excerpts: string[] = []
    for (const id of targets.slice(0, 2)) {
      const element = byId.get(id)
      if (element === undefined) continue
      const [excerpt, excerptError] = await this.excerpt(element)
      if (excerptError !== null) return fail(excerptError)
      excerpts.push(excerpt)
    }
    const text = SecretRedactor.redact([...lines, ...excerpts].join("\n")).slice(0, this.budget)
    const inputHashes = [
      createHash("sha256").update(text, "utf8").digest("hex"),
      ...ids.map((id) => createHash("sha256").update(id, "utf8").digest("hex")),
    ]

    return ok({
      text,
      inputHashes,
      files: [...new Set(ids.map((id) => byId.get(id)?.filePath ?? ""))].filter(Boolean),
    })
  }

  private describe(element: IrElement): string {
    return [
      `element ${element.id}`,
      `path ${element.filePath}:${element.startLine}-${element.endLine}`,
      `type ${element.type} visibility ${element.visibility}`,
      `signature ${element.signature}`,
      element.calls.length === 0
        ? ""
        : `calls ${element.calls.map((call) => call.name).join(", ")}`,
      element.dataAccess.length === 0
        ? ""
        : `access ${element.dataAccess.map((access) => `${access.kind}:${access.channel}`).join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n")
  }

  private async excerpt(element: IrElement): Promise<Result<string, string>> {
    const [text, readError] = await attemptAsync(() =>
      Bun.file(join(this.root, element.filePath)).text(),
    )
    if (readError !== null || text === null) return fail(readError ?? "cannot read source excerpt")
    const lines = text.split(/\r?\n/)
    const start = Math.max(1, element.startLine - 3)
    const end = Math.min(lines.length, element.startLine + 60, element.endLine + 3)

    return ok(
      `source ${element.filePath}:${start}-${end}\n${lines
        .slice(start - 1, end)
        .join("\n")
        .slice(0, 3000)}`,
    )
  }
}
