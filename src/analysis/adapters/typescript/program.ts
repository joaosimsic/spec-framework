import ts from "typescript"
import { attempt, type Result, ok, fail } from "../../../core/result"
import type { ScannedFile } from "../../types"

export interface TypeScriptProgram {
  program: ts.Program
  checker: ts.TypeChecker
  root: string
}

const FALLBACK_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  checkJs: false,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  resolveJsonModule: true,
  types: ["bun"],
}

export class TypeScriptProgramBuilder {
  build(root: string, files: ScannedFile[]): Result<TypeScriptProgram, string> {
    const configuration = this.configuration(root)
    const rootNames = files.map((file) => file.absolutePath)
    const [program, programError] = attempt(() =>
      ts.createProgram({ rootNames, options: configuration }),
    )
    if (programError !== null || program === null) {
      return fail(programError ?? "TypeScript program could not be created")
    }

    return ok({ program, checker: program.getTypeChecker(), root })
  }

  private configuration(root: string): ts.CompilerOptions {
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, "tsconfig.json")
    if (configPath === undefined) return FALLBACK_OPTIONS

    const [read, readError] = attempt(() => ts.readConfigFile(configPath, ts.sys.readFile))
    if (readError !== null || read === null || read.config === undefined) return FALLBACK_OPTIONS

    const [parsed, parseError] = attempt(() =>
      ts.parseJsonConfigFileContent(read.config, ts.sys, root),
    )
    if (parseError !== null || parsed === null) return FALLBACK_OPTIONS

    return { ...parsed.options, noEmit: true, skipLibCheck: true }
  }
}
