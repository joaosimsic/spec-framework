import { join } from "node:path"
import type { Server } from "bun"
import { attempt, attemptAsync, type Result, ok, fail } from "../core/result"
import { errorResponse, WorkbenchRouter } from "./router"
import { WorkbenchFailureFactory } from "./failure"
import { WorkbenchSecurity } from "./security"
import { AnalysisRuntime } from "./analysis-runtime"
import { WorkbenchStaticAssets } from "./static-assets"

export interface WorkbenchLogger {
  log(message: string): void
}

export interface WorkbenchServerOptions {
  target: string
  host?: string
  port?: number
  allowedOrigins?: string[]
  assetDirectory?: string
  token?: string
  analysisRoots?: string[]
  logger?: WorkbenchLogger
}

export interface WorkbenchServerHandle {
  url: string
  port: number
  close(): void
}

export class WorkbenchServer {
  private server: Server<unknown> | null = null
  private router: WorkbenchRouter | null = null
  private security: WorkbenchSecurity | null = null
  private assets: WorkbenchStaticAssets | null = null
  private assetReady = false
  private readonly host: string
  private readonly port: number
  private readonly token: string
  private readonly logger: WorkbenchLogger
  private readonly assetDirectory: string
  private analysis: AnalysisRuntime | null = null

  constructor(private readonly options: WorkbenchServerOptions) {
    this.host = options.host ?? "127.0.0.1"
    this.port = options.port ?? 4173
    this.token = options.token ?? crypto.randomUUID()
    this.logger = options.logger ?? console
    this.assetDirectory = options.assetDirectory ?? join(import.meta.dir, "web", "dist")
  }

  async start(): Promise<Result<WorkbenchServerHandle, string>> {
    if (!this.isLoopback(this.host) && (this.options.allowedOrigins ?? []).length === 0) {
      return fail("non-local workbench access requires an explicit allowed origin")
    }

    this.assets = new WorkbenchStaticAssets(this.assetDirectory)
    this.assetReady = await this.assets.ready()

    const [analysis, analysisError] = await AnalysisRuntime.create(this.options.target, {
      analysisRoots: this.options.analysisRoots,
    })
    if (analysisError !== null || analysis === null) {
      return fail(analysisError ?? "analysis runtime unavailable")
    }
    this.analysis = analysis

    const [server, serverError] = attempt(() =>
      Bun.serve({
        hostname: this.host,
        port: this.port,
        fetch: (request) => this.handle(request),
      }),
    )
    if (serverError !== null || server === null) {
      return fail(serverError ?? "workbench server did not start")
    }

    const boundPort = server.port ?? this.port
    this.server = server
    this.security = new WorkbenchSecurity({
      host: this.host,
      port: boundPort,
      allowedOrigins: this.options.allowedOrigins,
      token: this.token,
    })
    this.router = new WorkbenchRouter({
      security: this.security,
      assetReady: this.assetReady,
      analysis,
    })

    return ok({
      url: this.url(boundPort),
      port: boundPort,
      close: () => this.close(),
    })
  }

  close(): void {
    this.server?.stop(true)
    this.server = null
    this.analysis?.close()
    this.analysis = null
  }

  private async handle(request: Request): Promise<Response> {
    const [response, responseError] = await attemptAsync(() => this.dispatch(request))
    if (responseError !== null || response === null) {
      this.log(request, 500)
      return this.secure(
        errorResponse(WorkbenchFailureFactory.internal("workbench request failed")),
      )
    }

    this.log(request, response.status)
    return this.secure(response)
  }

  private async dispatch(request: Request): Promise<Response> {
    if (this.router === null || this.security === null || this.assets === null) {
      return errorResponse({
        code: "WORKBENCH-STARTING",
        message: "workbench is still starting",
        status: 503,
      })
    }

    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/")) {
      const [response, failure] = await this.router.handle(request)
      if (failure !== null) return errorResponse(failure)
      if (response !== null) return response

      return errorResponse(WorkbenchFailureFactory.internal("empty api response"))
    }

    const [, securityFailure] = this.security.check(request, false)
    if (securityFailure !== null) return errorResponse(securityFailure)

    if (!this.assetReady) {
      return new Response("Workbench assets are not built. Run bun run build:workbench.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    }

    const [response, failure] = await this.assets.serve(request)
    if (failure !== null) return errorResponse(failure)
    if (response !== null) return response

    return errorResponse(WorkbenchFailureFactory.notFound("asset not found"))
  }

  private secure(response: Response): Response {
    const headers = new Headers(response.headers)
    headers.set("x-content-type-options", "nosniff")
    headers.set("x-frame-options", "DENY")
    headers.set("referrer-policy", "no-referrer")
    headers.set("cross-origin-resource-policy", "same-origin")
    headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()")
    headers.set(
      "content-security-policy",
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "img-src 'self' data:",
        "connect-src 'self'",
        "font-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'none'",
        "form-action 'self'",
      ].join("; "),
    )

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }

  private log(request: Request, status: number): void {
    const url = new URL(request.url)
    this.logger.log(`workbench: ${request.method} ${url.pathname} ${status}`)
  }

  private url(port: number): string {
    return `http://${this.urlHost(this.host)}:${port}`
  }

  private urlHost(host: string): string {
    return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
  }

  private isLoopback(host: string): boolean {
    return host === "127.0.0.1" || host === "localhost" || host === "::1"
  }
}
