import { fail, ok, type Result } from "../core/result"
import { AnalysisApiRouter } from "./api/v1-router"
import type { AnalysisRuntime } from "./analysis-runtime"
import { WorkbenchFailureFactory, type WorkbenchFailure } from "./failure"
import type { WorkbenchSecurity } from "./security"
import type { WorkbenchSession } from "./types"

export interface WorkbenchRouterOptions {
  security: WorkbenchSecurity
  assetReady: boolean
  analysis: AnalysisRuntime
}

export class WorkbenchRouter {
  constructor(private readonly options: WorkbenchRouterOptions) {}

  async handle(request: Request): Promise<Result<Response, WorkbenchFailure>> {
    const url = new URL(request.url)
    const segments = url.pathname.split("/").filter(Boolean)
    const mutation = request.method !== "GET" && request.method !== "HEAD"
    const [, securityFailure] = this.options.security.check(request, mutation)
    if (securityFailure !== null) return fail(securityFailure)

    if (segments[0] !== "api") return fail(WorkbenchFailureFactory.notFound("unknown endpoint"))
    if (segments[1] === "v1")
      return new AnalysisApiRouter(this.options.analysis).handle(request, url, segments)
    if (segments.length === 2 && segments[1] === "session" && request.method === "GET") {
      return this.session()
    }

    return fail(WorkbenchFailureFactory.notFound("unknown workbench endpoint"))
  }

  private session(): Result<Response, WorkbenchFailure> {
    const project = this.options.analysis.currentProject()
    const snapshot = project === null ? null : this.options.analysis.latest(project)
    const session: WorkbenchSession = {
      csrf_token: this.options.security.token,
      mode: "generated",
      project_id: project?.id ?? null,
      snapshot_id: snapshot?.id ?? null,
      commit: snapshot?.commit ?? "",
      dirty: snapshot?.dirty ?? false,
      views: ["system", "flows", "findings", "evolution", "documents"],
      asset_ready: this.options.assetReady,
    }

    return ok(this.json(session))
  }

  private json(value: unknown, status = 200): Response {
    return Response.json(value, { status, headers: { "cache-control": "no-store" } })
  }
}

export function errorResponse(failure: WorkbenchFailure): Response {
  return Response.json(
    {
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.choices === undefined ? {} : { choices: failure.choices }),
      },
    },
    { status: failure.status, headers: { "cache-control": "no-store" } },
  )
}
