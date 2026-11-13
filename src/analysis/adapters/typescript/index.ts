import { fail, ok, type Result } from "../../../core/result"
import { IR_VERSION, type IrSnapshot } from "../../ir"
import { IrValidator } from "../../ir-validator"
import type { ScannedFile } from "../../types"
import { ElementIndex } from "./element-index"
import { TypeScriptEdgeExtractor } from "./edges"
import { TypeScriptEntryPointExtractor } from "./entry-points"
import { TypeScriptProgramBuilder } from "./program"
import { TypeScriptElementExtractor } from "./symbols"

export class TypeScriptAdapter {
  readonly id = "typescript"
  readonly version = "1"

  async analyze(root: string, files: ScannedFile[]): Promise<Result<IrSnapshot, string>> {
    if (files.length === 0) {
      return ok({
        version: IR_VERSION,
        elements: [],
        relationships: [],
        entryPoints: [],
        findings: [],
      })
    }

    const [typeScript, programError] = new TypeScriptProgramBuilder().build(root, files)
    if (programError !== null || typeScript === null) {
      return fail(programError ?? "TypeScript program unavailable")
    }

    const index = new ElementIndex()
    const elements = []
    for (const file of files) {
      const sourceFile = typeScript.program.getSourceFile(file.absolutePath)
      if (sourceFile === undefined) continue
      const extracted = new TypeScriptElementExtractor(typeScript.checker).extract(sourceFile, file)
      elements.push(...extracted.elements)
      for (const span of extracted.index.all()) index.add(span)
    }

    const edges = new TypeScriptEdgeExtractor(typeScript, files, elements, index).extract()
    const [entryPoints, entryError] = await new TypeScriptEntryPointExtractor(
      root,
      typeScript,
      files,
      elements,
      index,
    ).extract()
    if (entryError !== null || entryPoints === null) {
      return fail(entryError ?? "entry points unavailable")
    }

    return IrValidator.validate({
      version: IR_VERSION,
      elements: elements.sort((left, right) => left.id.localeCompare(right.id)),
      relationships: edges.relationships,
      entryPoints,
      findings: edges.findings,
    })
  }
}
