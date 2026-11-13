import { describe, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { join } from "node:path"

const FORBIDDEN = [
  "spec/architecture",
  "spec/requirements",
  "spec/formal",
  "spec/contracts",
  "spec/spec.lock",
  "ArchitectureCatalogLoader",
  "WorkbenchService",
]

describe("generated-only boundaries", () => {
  test("workbench source does not read curated spec inputs", async () => {
    const files = await collect("src/workbench")
    const matches: string[] = []
    for (const file of files) {
      const text = await Bun.file(file).text()
      for (const value of FORBIDDEN) {
        if (text.includes(value)) matches.push(`${file}: ${value}`)
      }
    }
    expect(matches).toEqual([])
  })
})

async function collect(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "dist") continue
      files.push(...(await collect(path)))
      continue
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) files.push(path)
  }

  return files
}
