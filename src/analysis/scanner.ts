import { createHash } from "node:crypto"
import { readdir, realpath } from "node:fs/promises"
import { extname, join, sep } from "node:path"
import { attemptAsync, type Result, ok, fail } from "../core/result"
import { GitIgnoreMatcher } from "./gitignore"
import type {
  DirectoryEntry,
  PendingDirectory,
  ScanResult,
  ScannedFile,
  ScanWarning,
} from "./types"

const LANGUAGES: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
}

const SECRET_FILE = /^(?:\.env|\.npmrc|\.netrc|credentials|secrets)(?:\.|$)/i
const EXCLUDED_DIRECTORIES = new Set(["build", "coverage", "dist", "node_modules", ".spec"])
const EXCLUDED_FILES = new Set(["spec.lock"])
const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "spec",
  "target",
  "vendor",
])

const shouldIgnoreDirectory = (name: string): boolean =>
  name.startsWith(".") || IGNORED_DIRECTORIES.has(name)

export class RepositoryScanner {
  constructor(private readonly exclusions: string[] = []) {}

  async scan(root: string): Promise<Result<ScanResult, string>> {
    const [canonical, canonicalError] = await attemptAsync(() => realpath(root))
    if (canonicalError !== null || canonical === null) {
      return fail(canonicalError ?? "repository root is unavailable")
    }

    const [ignorePatterns, ignoreError] = await this.readIgnorePatterns(canonical)
    if (ignoreError !== null || ignorePatterns === null) {
      return fail(ignoreError ?? "gitignore state unavailable")
    }
    const ignores = new GitIgnoreMatcher(ignorePatterns)
    const exclusions = new Set(this.exclusions.map((path) => this.normalize(path)))
    const warnings: ScanWarning[] = []
    const files: ScannedFile[] = []
    const pending: PendingDirectory[] = [{ directory: canonical, path: "" }]
    const visited = new Set<string>()

    for (let index = 0; index < pending.length; index++) {
      const current = pending[index]
      if (current === undefined) continue
      const [key, keyError] = await attemptAsync(() => realpath(current.directory))
      if (keyError !== null || key === null) {
        warnings.push({
          code: "SCAN-DIRECTORY",
          path: current.path,
          message: keyError ?? "unreadable",
        })
        continue
      }
      if (visited.has(key)) continue
      visited.add(key)

      const [entries, entriesError] = await attemptAsync(
        async () => (await readdir(current.directory, { withFileTypes: true })) as DirectoryEntry[],
      )
      if (entriesError !== null || entries === null) {
        warnings.push({
          code: "SCAN-DIRECTORY",
          path: current.path,
          message: entriesError ?? "unreadable",
        })
        continue
      }

      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const path = current.path === "" ? entry.name : `${current.path}/${entry.name}`
        if (exclusions.has(path) || ignores.ignores(path)) continue
        if (entry.isSymbolicLink()) {
          warnings.push({ code: "SCAN-SYMLINK", path, message: "symlink skipped" })
          continue
        }
        if (entry.isDirectory()) {
          if (shouldIgnoreDirectory(entry.name) || EXCLUDED_DIRECTORIES.has(entry.name)) continue
          pending.push({ directory: join(current.directory, entry.name), path })
          continue
        }
        if (!entry.isFile()) continue
        if (SECRET_FILE.test(entry.name) || EXCLUDED_FILES.has(entry.name)) continue
        const language = LANGUAGES[extname(entry.name).toLowerCase()]
        if (language === undefined) continue

        const [file, fileError] = await this.readFile(
          join(current.directory, entry.name),
          path,
          language,
        )
        if (fileError !== null || file === null) {
          warnings.push({ code: "SCAN-FILE", path, message: fileError ?? "unreadable" })
          continue
        }
        files.push(file)
      }
    }

    return ok({
      files: files.sort((left, right) => left.path.localeCompare(right.path)),
      warnings: warnings.sort((left, right) => left.path.localeCompare(right.path)),
    })
  }

  private async readIgnorePatterns(root: string): Promise<Result<string[], string>> {
    const [text, readError] = await attemptAsync(async () => {
      const file = Bun.file(join(root, ".gitignore"))
      return (await file.exists()) ? file.text() : ""
    })
    if (readError !== null || text === null) return fail(readError ?? "cannot read .gitignore")

    return ok(text.split(/\r?\n/))
  }

  private async readFile(
    absolutePath: string,
    path: string,
    language: string,
  ): Promise<Result<ScannedFile, string>> {
    const [content, readError] = await attemptAsync(async () => {
      const file = Bun.file(absolutePath)
      const stat = await file.stat()
      const bytes = new Uint8Array(await file.arrayBuffer())
      return { stat, bytes }
    })
    if (readError !== null || content === null) {
      return fail(readError ?? "cannot read source file")
    }

    const hash = createHash("sha256").update(content.bytes).digest("hex")
    const text = Buffer.from(content.bytes).toString("utf8")

    return ok({
      path,
      absolutePath,
      language,
      hash,
      size: content.stat.size,
      lineCount: text === "" ? 0 : text.split(/\r?\n/).length,
      modifiedAt: content.stat.mtime.toISOString(),
    })
  }

  private normalize(path: string): string {
    return path.split(sep).join("/").replace(/^\.\//, "")
  }
}
