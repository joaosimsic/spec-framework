import { readdir } from "node:fs/promises"
import { join } from "node:path"

export const IGNORED_DIRECTORIES = new Set([
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

export function shouldIgnoreDirectory(name: string): boolean {
  return name.startsWith(".") || IGNORED_DIRECTORIES.has(name)
}

export async function findFirstFile(
  target: string,
  fileName: string,
  maxDepth = 6,
): Promise<string | null> {
  const pending: Array<{ directory: string; depth: number }> = [{ directory: target, depth: 0 }]

  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]
    if (current === undefined) continue

    const entries = (await readdir(current.directory, { withFileTypes: true }).catch(() => []))
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (entry.isFile() && entry.name === fileName) {
        return join(current.directory, entry.name)
      }
    }

    if (current.depth >= maxDepth) continue

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (shouldIgnoreDirectory(entry.name)) continue
      pending.push({ directory: join(current.directory, entry.name), depth: current.depth + 1 })
    }
  }

  return null
}
