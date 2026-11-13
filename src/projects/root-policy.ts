import { realpath, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"
import { attemptAsync, type Result, ok, fail } from "../core/result"

export class AnalysisRootPolicy {
  private constructor(
    private readonly roots: string[],
    private readonly primaryRoot: string,
  ) {}

  static async create(
    target: string,
    configuredRoots: string[] = [],
  ): Promise<Result<AnalysisRootPolicy, string>> {
    const candidates = configuredRoots.length === 0 ? [target] : configuredRoots
    const roots: string[] = []

    for (const candidate of candidates) {
      const [canonical, canonicalError] = await attemptAsync(() => realpath(resolve(candidate)))
      if (canonicalError !== null || canonical === null) {
        return fail(canonicalError ?? `analysis root is unavailable: ${candidate}`)
      }
      const [metadata, metadataError] = await attemptAsync(() => stat(canonical))
      if (metadataError !== null || metadata === null || !metadata.isDirectory()) {
        return fail(metadataError ?? `analysis root is not a directory: ${candidate}`)
      }
      roots.push(canonical)
    }

    const primary = roots[0]
    if (primary === undefined) return fail("analysis root policy is empty")

    return ok(new AnalysisRootPolicy([...new Set(roots)], primary))
  }

  resolve(path: string): Promise<Result<string, string>> {
    return this.resolvePath(path)
  }

  get defaultRoot(): string {
    return this.primaryRoot
  }

  private async resolvePath(path: string): Promise<Result<string, string>> {
    const candidate = isAbsolute(path) ? path : resolve(this.primaryRoot, path)
    const [canonical, canonicalError] = await attemptAsync(() => realpath(candidate))
    if (canonicalError !== null || canonical === null) {
      return fail(canonicalError ?? `repository path is unavailable: ${path}`)
    }
    if (!this.contained(canonical)) return fail("repository path is outside the allowed roots")

    const [metadata, metadataError] = await attemptAsync(() => stat(canonical))
    if (metadataError !== null || metadata === null || !metadata.isDirectory()) {
      return fail(metadataError ?? "repository path is not a directory")
    }

    return ok(canonical)
  }

  private contained(path: string): boolean {
    return this.roots.some((root) => {
      const difference = relative(root, path)
      return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference))
    })
  }
}
