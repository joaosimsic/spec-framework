import { attemptAsync, type Result } from "../core/result"
import { collectRequirementFiles, requirementDirectory } from "../core/requirements"

const BLOCK_START = /^\[([A-Z_]+)\]\s*$/
const FIELD = /^([A-Z][A-Z0-9_]*):\s*(.*)$/

interface BlockState {
  uid: string | null
  statusLine: number | null
}

interface RewriteResult {
  text: string
  changed: boolean
}

export class SdocStatusWriter {
  constructor(private readonly target: string) {}

  async write(ids: Set<string>, status: string): Promise<Result<string[], string>> {
    const files = await collectRequirementFiles(requirementDirectory(this.target))
    const updates: { path: string; text: string }[] = []

    for (const path of files) {
      const [text, readError] = await attemptAsync(() => Bun.file(path).text())
      if (readError || text === null) {
        return [null, readError === null ? `cannot read ${path}` : readError]
      }

      const [rewrite, rewriteError] = this.rewrite(text, ids, status)
      if (rewriteError || rewrite === null) {
        return [null, `${path}: ${rewriteError ?? "could not rewrite status"}`]
      }
      if (rewrite.changed) updates.push({ path, text: rewrite.text })
    }

    const written: string[] = []
    for (const update of updates) {
      const [, writeError] = await attemptAsync(() => Bun.write(update.path, update.text))
      if (writeError) return [null, `cannot write ${update.path}: ${writeError}`]
      written.push(update.path)
    }

    return [written, null]
  }

  private rewrite(text: string, ids: Set<string>, status: string): Result<RewriteResult, string> {
    const newline = text.includes("\r\n") ? "\r\n" : "\n"
    const lines = text.split(newline)
    let current: BlockState | null = null

    for (const [lineIndex, line] of lines.entries()) {
      if (BLOCK_START.test(line)) {
        const failure = this.finishBlock(current, ids, status, lines)
        if (failure !== null) return [null, failure]
        current = { uid: null, statusLine: null }
        continue
      }

      if (current === null) continue

      const field = FIELD.exec(line)
      if (field === null) continue
      if (field[1] === "UID") current.uid = field[2].trim()
      if (field[1] === "STATUS") current.statusLine = lineIndex
    }

    const failure = this.finishBlock(current, ids, status, lines)
    if (failure !== null) return [null, failure]

    const rewritten = lines.join(newline)
    return [{ text: rewritten, changed: rewritten !== text }, null]
  }

  private finishBlock(
    block: BlockState | null,
    ids: Set<string>,
    status: string,
    lines: string[],
  ): string | null {
    if (block === null || block.uid === null || !ids.has(block.uid)) return null
    if (block.statusLine === null) return `STATUS field missing for ${block.uid}`
    lines[block.statusLine] = `STATUS: ${status}`

    return null
  }
}
