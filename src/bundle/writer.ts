import { mkdir, rm, stat } from "node:fs/promises"
import { dirname, join } from "node:path"
import { attemptAsync, type Result, ok, fail } from "../core/result"

export interface BundleOutputFile {
  path: string
  content: string | Uint8Array
}

export class BundleWriter {
  async exists(directory: string): Promise<boolean> {
    const [metadata, error] = await attemptAsync(() => stat(directory))
    if (error !== null) return false

    return metadata !== null
  }

  async write(
    directory: string,
    files: BundleOutputFile[],
    force: boolean,
  ): Promise<Result<string[], string>> {
    const exists = await this.exists(directory)
    if (exists && !force) {
      return fail(`bundle destination already exists: ${directory}; pass --force to replace it`)
    }
    if (exists && !(await Bun.file(join(directory, "manifest.json")).exists())) {
      return fail(`refusing to replace non-bundle directory: ${directory}`)
    }

    const [written, writeError] = await attemptAsync(async () => {
      if (force) await rm(directory, { recursive: true, force: true })
      const paths: string[] = []

      for (const file of files) {
        const path = join(directory, file.path)
        await mkdir(dirname(path), { recursive: true })
        await Bun.write(path, file.content)
        paths.push(path)
      }

      return paths
    })

    if (writeError !== null || written === null) {
      return fail(writeError ?? "cannot write bundle")
    }

    return ok(written)
  }
}
