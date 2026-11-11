import type { Result } from "../core/result"
import { WorkbenchFailureFactory, type WorkbenchFailure } from "./failure"

export interface WorkbenchSecurityOptions {
  host: string
  port: number
  allowedOrigins?: string[]
  token: string
}

export class WorkbenchSecurity {
  private readonly origins = new Set<string>()
  private readonly hosts = new Set<string>()

  constructor(private readonly options: WorkbenchSecurityOptions) {
    const configuredOrigins = options.allowedOrigins ?? []
    this.origins.add(this.origin(options.host, options.port))
    for (const origin of configuredOrigins) this.origins.add(this.normalizeOrigin(origin))

    this.hosts.add(this.hostname(options.host))
    for (const origin of this.origins) this.hosts.add(this.hostnameFromOrigin(origin))

    if (this.isLoopback(options.host)) {
      this.hosts.add("localhost")
      this.hosts.add("127.0.0.1")
      this.hosts.add("::1")
    }
  }

  get token(): string {
    return this.options.token
  }

  check(request: Request, mutation: boolean): Result<null, WorkbenchFailure> {
    const host = request.headers.get("host") ?? ""
    if (!this.hosts.has(this.hostnameFromHostHeader(host))) {
      return [null, this.forbidden("request host is not allowed")]
    }

    if (!mutation) return [null, null]

    const origin = request.headers.get("origin")
    if (origin === null || !this.origins.has(this.normalizeOrigin(origin))) {
      return [null, this.forbidden("request origin is not allowed")]
    }

    const fetchSite = request.headers.get("sec-fetch-site")
    if (fetchSite !== null && fetchSite !== "same-origin" && fetchSite !== "none") {
      return [null, this.forbidden("cross-site requests are not allowed")]
    }

    if (request.headers.get("x-csrf-token") !== this.options.token) {
      return [null, this.forbidden("missing or invalid CSRF token")]
    }

    const contentType = request.headers.get("content-type") ?? ""
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return [null, WorkbenchFailureFactory.badRequest("requests must use application/json")]
    }

    return [null, null]
  }

  private forbidden(message: string): WorkbenchFailure {
    return {
      code: "WORKBENCH-FORBIDDEN",
      message,
      status: 403,
    }
  }

  private origin(host: string, port: number): string {
    return `http://${this.urlHost(host)}:${port}`
  }

  private normalizeOrigin(origin: string): string {
    return origin.replace(/\/+$/, "").toLowerCase()
  }

  private hostnameFromOrigin(origin: string): string {
    const match = origin.match(/^https?:\/\/(\[[^\]]+\]|[^:/]+)/i)
    return match?.[1]?.replaceAll("[", "").replaceAll("]", "").toLowerCase() ?? ""
  }

  private hostnameFromHostHeader(host: string): string {
    const value = host.trim().toLowerCase()
    if (value.startsWith("[")) return value.slice(1, value.indexOf("]"))

    return value.split(":")[0] ?? ""
  }

  private hostname(host: string): string {
    return host.replaceAll("[", "").replaceAll("]", "").toLowerCase()
  }

  private urlHost(host: string): string {
    return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host
  }

  private isLoopback(host: string): boolean {
    return host === "127.0.0.1" || host === "localhost" || host === "::1"
  }
}
