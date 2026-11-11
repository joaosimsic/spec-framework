export const QUINT_ID_COMMENT = /^\s*\/\/\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)(?:\s+(.*))?\s*$/
export const QUINT_MODULE = /^\s*module\s+([A-Za-z_][A-Za-z0-9_]*)\b/
export const QUINT_DECLARATION = /^\s*(?:pure\s+)?(val|invariant)\s+([A-Za-z_][A-Za-z0-9_]*)\b/

export type QuintDeclarationKind = "val" | "invariant"

export interface QuintModule {
  id: string | null
  name: string
  file: string
  line: number
}

export interface QuintDeclaration {
  id: string | null
  kind: QuintDeclarationKind
  name: string
  module: string | null
  file: string
  line: number
}

export interface QuintParseResult {
  modules: QuintModule[]
  declarations: QuintDeclaration[]
}

export function parseQuint(file: string, text: string): QuintParseResult {
  const modules: QuintModule[] = []
  const declarations: QuintDeclaration[] = []
  const lines = text.split(/\r?\n/)
  let pendingId: string | null = null
  let depth = 0
  let currentModule: string | null = null

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? ""
    const annotation = QUINT_ID_COMMENT.exec(line)
    if (annotation !== null) {
      pendingId = annotation[1] ?? null
      continue
    }

    const moduleMatch = depth === 0 ? QUINT_MODULE.exec(line) : null
    if (moduleMatch !== null) {
      const name = moduleMatch[1] ?? ""
      modules.push({ id: pendingId, name, file, line: index + 1 })
      pendingId = null
      currentModule = name
      depth += braceDelta(line)
      if (depth === 0) currentModule = null
      continue
    }

    const declarationMatch = depth === 1 ? QUINT_DECLARATION.exec(line) : null
    if (declarationMatch !== null) {
      declarations.push({
        id: pendingId,
        kind: declarationMatch[1] === "invariant" ? "invariant" : "val",
        name: declarationMatch[2] ?? "",
        module: currentModule,
        file,
        line: index + 1,
      })
      pendingId = null
      depth += braceDelta(line)
      if (depth <= 0) currentModule = null
      continue
    }

    depth += braceDelta(line)
    if (depth < 0) depth = 0
    if (depth === 0) currentModule = null
    if (line.trim() !== "") pendingId = null
  }

  return { modules, declarations }
}

function braceDelta(line: string): number {
  let delta = 0
  let quoted = false

  for (const character of line) {
    if (character === '"') quoted = !quoted
    if (quoted) continue
    if (character === "{") delta += 1
    if (character === "}") delta -= 1
  }

  return delta
}
