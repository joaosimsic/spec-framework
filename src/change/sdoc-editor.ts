import { attemptAsync, type Result } from "../core/result"
import { parseSdoc } from "../core/sdoc"
import type { SdocBlock } from "../core/types"

const BLOCK_START = /^\[([A-Z_]+)\]\s*$/
const FIELD = /^([A-Z][A-Z0-9_]*):\s*(.*)$/
const BLOCK_KIND = "[REQUIREMENT]"
const FIELD_ORDER = [
  "UID",
  "TITLE",
  "STATUS",
  "STATEMENT",
  "RATIONALE",
  "ACCEPTANCE",
  "COMPONENT",
  "CAPABILITY",
  "FORMAL",
  "CONTRACTS",
  "VERIFICATION",
  "EVIDENCE",
  "WAIVER",
  "REPLACES",
  "DECIDES",
  "QUESTIONS",
  "PROVENANCE",
  "OWNER",
  "PRIORITY",
]

interface BlockRange {
  start: number
  end: number
}

export class SdocDocument {
  private readonly original: string
  private readonly newline: string
  private lines: string[]

  private constructor(
    private readonly path: string,
    text: string,
    newline: string,
    lines: string[],
  ) {
    this.original = text
    this.newline = newline
    this.lines = lines
  }

  static empty(path: string): SdocDocument {
    const text = `[DOCUMENT]\nTITLE: Decisions and open questions\n`

    return new SdocDocument(path, text, "\n", text.split("\n"))
  }

  static async load(path: string): Promise<Result<SdocDocument, string>> {
    const [text, readError] = await attemptAsync(() => Bun.file(path).text())
    if (readError !== null || text === null) {
      return [null, readError === null ? `cannot read ${path}` : readError]
    }

    const newline = text.includes("\r\n") ? "\r\n" : "\n"

    return [new SdocDocument(path, text, newline, text.split(newline)), null]
  }

  has(uid: string): boolean {
    return this.findRange(uid) !== null
  }

  blocks(): SdocBlock[] {
    return parseSdoc(this.path, this.text())
  }

  block(uid: string): SdocBlock | null {
    return this.blocks().find((candidate) => candidate.fields.UID === uid) ?? null
  }

  fields(uid: string): Record<string, string> | null {
    return this.block(uid)?.fields ?? null
  }

  setField(uid: string, field: string, value: string): Result<void, string> {
    const range = this.findRange(uid)
    if (range === null) return [null, `unknown element '${uid}'`]

    const lineIndex = this.lineFor(range, field)
    if (lineIndex !== null) {
      this.lines[lineIndex] = `${field}: ${value}`

      return [undefined, null]
    }

    this.lines.splice(this.insertionPoint(range), 0, `${field}: ${value}`)

    return [undefined, null]
  }

  appendRecord(fields: Record<string, string>): Result<string, string> {
    const uid = fields.UID?.trim() ?? ""
    if (uid === "") return [null, "new record requires UID"]
    if (this.has(uid)) return [null, `duplicate element ID '${uid}'`]

    const block = [BLOCK_KIND, ...this.orderedFields(fields)].join(this.newline)
    const existing = this.text().replace(/\s+$/, "")
    const prefix = existing === "" ? "" : `${existing}${this.newline}${this.newline}`
    this.lines = `${prefix}${block}`.split(this.newline)

    return [uid, null]
  }

  changed(): boolean {
    return this.text() !== this.original
  }

  text(): string {
    return this.lines.join(this.newline)
  }

  sourcePath(): string {
    return this.path
  }

  originalText(): string {
    return this.original
  }

  async save(): Promise<Result<string, string>> {
    if (!this.changed()) return [this.path, null]

    const [written, writeError] = await attemptAsync(async () => {
      await Bun.write(this.path, this.text())

      return this.path
    })
    if (writeError !== null || written === null) {
      return [null, writeError === null ? `cannot write ${this.path}` : writeError]
    }

    return [written, null]
  }

  private findRange(uid: string): BlockRange | null {
    const ranges = this.blockRanges()

    for (const range of ranges) {
      const blockUid = this.blockUid(range)
      if (blockUid === uid) return range
    }

    return null
  }

  private blockRanges(): BlockRange[] {
    const starts = this.lines
      .map((line, index) => (BLOCK_START.test(line) ? index : null))
      .filter((index): index is number => index !== null)

    return starts.map((start, index) => ({
      start,
      end: starts[index + 1] ?? this.lines.length,
    }))
  }

  private blockUid(range: BlockRange): string | null {
    for (let index = range.start + 1; index < range.end; index++) {
      const field = FIELD.exec(this.lines[index])
      if (field?.[1] === "UID") return field[2].trim()
    }

    return null
  }

  private lineFor(range: BlockRange, fieldName: string): number | null {
    for (let index = range.start + 1; index < range.end; index++) {
      const field = FIELD.exec(this.lines[index])
      if (field?.[1] === fieldName) return index
    }

    return null
  }

  private insertionPoint(range: BlockRange): number {
    let index = range.end - 1
    while (index > range.start && this.lines[index].trim() === "") index -= 1

    return index + 1
  }

  private orderedFields(fields: Record<string, string>): string[] {
    const known = FIELD_ORDER.filter((field) => fields[field] !== undefined)
    const extra = Object.keys(fields).filter((field) => !FIELD_ORDER.includes(field))

    return [...known, ...extra].map((field) => `${field}: ${fields[field]}`)
  }
}
