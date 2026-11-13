import { readdir } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { attemptAsync, type Result, ok, fail } from "../core/result"
import { BundleHasher } from "./hash"
import type { BundleSource } from "./types"

const SOURCE_DIRECTORIES = [
  "architecture",
  "capabilities",
  "requirements",
  "semantic",
  "verification",
  "formal",
  "contracts",
  "implementation",
] as const

const ROOT_FILES = ["config.json", "toolchain.lock.json"] as const

export class BundleSourceCollector {
  async collect(target: string): Promise<Result<BundleSource[], string>> {
    const sources: BundleSource[] = []

    for (const group of SOURCE_DIRECTORIES) {
      const directory = join(target, "spec", group)
      const [files, readError] = await this.files(directory)
      if (readError !== null || files === null) {
        return fail(readError ?? `cannot read ${directory}`)
      }

      for (const path of files) {
        const source = await this.source(target, group, path)
        if (source === null) return fail(`cannot read source ${path}`)
        sources.push(source)
      }
    }

    for (const name of ROOT_FILES) {
      const path = join(target, "spec", name)
      if (!(await Bun.file(path).exists())) continue
      const source = await this.source(target, "root", path)
      if (source === null) return fail(`cannot read source ${path}`)
      sources.push(source)
    }

    return ok(sources)
  }

  private async files(directory: string): Promise<Result<string[], string>> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    const files: string[] = []

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        const [nested, nestedError] = await this.files(path)
        if (nestedError !== null || nested === null) {
          return fail(nestedError ?? `cannot read ${path}`)
        }
        files.push(...nested)
        continue
      }
      if (!entry.isFile()) continue
      if (entry.name.startsWith(".")) continue
      if (/\.gen\./.test(entry.name)) continue
      files.push(path)
    }

    return ok(files)
  }

  private async source(target: string, group: string, path: string): Promise<BundleSource | null> {
    const [content, readError] = await attemptAsync(() => Bun.file(path).bytes())
    if (readError !== null || content === null) return null

    return {
      group,
      path: relative(target, path).split(sep).join("/"),
      hash: BundleHasher.bytes(content),
      content,
    }
  }
}
