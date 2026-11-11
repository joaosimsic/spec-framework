import { resolve, sep } from "node:path"
import { attempt, attemptAsync, type Result } from "../core/result"
import { WorkbenchFailureFactory, type WorkbenchFailure } from "./failure"

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

export class WorkbenchStaticAssets {
  private readonly root: string

  constructor(directory: string) {
    this.root = resolve(directory)
  }

  async ready(): Promise<boolean> {
    const [exists, existsError] = await attemptAsync(() =>
      Bun.file(resolve(this.root, "index.html")).exists(),
    )

    return existsError === null && exists === true
  }

  async serve(request: Request): Promise<Result<Response, WorkbenchFailure>> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return [
        null,
        {
          code: "WORKBENCH-METHOD",
          message: `method ${request.method} is not allowed`,
          status: 405,
        },
      ]
    }

    const url = new URL(request.url)
    const [path, pathError] = this.path(url.pathname)
    if (pathError !== null) return [null, pathError]
    if (path === null) return [null, WorkbenchFailureFactory.notFound("asset not found")]

    const file = Bun.file(path)
    const [exists, existsError] = await attemptAsync(() => file.exists())
    if (existsError !== null) {
      return [null, WorkbenchFailureFactory.internal("cannot read workbench assets")]
    }
    if (!exists) return [null, WorkbenchFailureFactory.notFound("asset not found")]

    const headers = new Headers({
      "content-type": CONTENT_TYPES[this.extension(path)] ?? "application/octet-stream",
      "cache-control": "no-store",
    })

    return [new Response(request.method === "HEAD" ? null : file, { headers }), null]
  }

  private path(pathname: string): Result<string | null, WorkbenchFailure> {
    const [decoded, decodeError] = attempt(() => decodeURIComponent(pathname))
    if (decodeError !== null || decoded === null) {
      return [null, WorkbenchFailureFactory.badRequest("invalid asset path")]
    }

    const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "")
    const candidate = resolve(this.root, relative)
    if (candidate !== this.root && !candidate.startsWith(`${this.root}${sep}`)) {
      return [null, WorkbenchFailureFactory.forbiddenPath()]
    }

    return [candidate, null]
  }

  private extension(path: string): string {
    const index = path.lastIndexOf(".")
    if (index === -1) return ""

    return path.slice(index).toLowerCase()
  }
}
