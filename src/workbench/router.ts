import { ProposalOperationParser } from "../change/operation-parser"
import type { ProposalOperation } from "../change/types"
import { attempt, attemptAsync, type Result } from "../core/result"
import { CurationParser } from "../discovery/curation-parser"
import { WorkbenchFailureFactory, type WorkbenchFailure } from "./failure"
import type { WorkbenchSecurity } from "./security"
import type { WorkbenchService } from "./service"
import type { WorkbenchCurationRequest, WorkbenchErrorView } from "./types"

const MAX_BODY_BYTES = 1024 * 1024

export interface WorkbenchRouterOptions {
  service: WorkbenchService
  security: WorkbenchSecurity
  assetReady: boolean
}

export class WorkbenchRouter {
  constructor(private readonly options: WorkbenchRouterOptions) {}

  async handle(request: Request): Promise<Result<Response, WorkbenchFailure>> {
    const url = new URL(request.url)
    const segments = url.pathname.split("/").filter(Boolean)
    const mutation = request.method !== "GET" && request.method !== "HEAD"
    const [, securityFailure] = this.options.security.check(request, mutation)
    if (securityFailure !== null) return [null, securityFailure]

    return this.route(request, url, segments)
  }

  private async route(
    request: Request,
    url: URL,
    segments: string[],
  ): Promise<Result<Response, WorkbenchFailure>> {
    const method = request.method
    const path = segments.slice(1)

    if (this.matches(path, ["session"])) return this.method(method, "GET", () => this.session())
    if (this.matches(path, ["graph"])) return this.method(method, "GET", () => this.graph())
    if (this.matches(path, ["context"])) {
      return this.method(method, "GET", () => this.context(url))
    }
    if (this.matches(path, ["change"])) return this.method(method, "GET", () => this.change())
    if (this.matches(path, ["impact"])) return this.method(method, "GET", () => this.impact())
    if (this.matches(path, ["diff"])) return this.method(method, "GET", () => this.diff())
    if (this.matches(path, ["architecture-graph"])) {
      return this.method(method, "GET", () => this.architectureGraph())
    }
    if (this.matches(path, ["repo-graph"]))
      return this.method(method, "GET", () => this.repoGraph())
    if (this.matches(path, ["mapping"])) return this.method(method, "GET", () => this.mapping())
    if (this.matches(path, ["check"])) return this.method(method, "POST", () => this.check(request))
    if (this.matches(path, ["mapping", "actions"])) {
      return this.method(method, "POST", () => this.mappingActions(request))
    }
    if (this.isProposalRoute(path)) {
      const proposalRef = path[1] ?? ""
      if (path[2] === "technical") {
        return this.method(method, "GET", () => this.technical(proposalRef))
      }
      if (path[2] === "ops") {
        return this.method(method, "POST", () => this.operations(request, proposalRef))
      }
    }

    return [null, WorkbenchFailureFactory.notFound("unknown workbench endpoint")]
  }

  private async session(): Promise<Result<Response, WorkbenchFailure>> {
    const [session, sessionError] = await this.options.service.session(
      this.options.security.token,
      this.options.assetReady,
    )
    if (sessionError !== null) return [null, sessionError]
    if (session === null) return [null, WorkbenchFailureFactory.internal("session unavailable")]

    return [this.json(session), null]
  }

  private async graph(): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.graph()
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("graph unavailable")]

    return [this.json(view), null]
  }

  private async context(url: URL): Promise<Result<Response, WorkbenchFailure>> {
    const names = [...url.searchParams.getAll("name")]
    const [view, viewError] = await this.options.service.context(names)
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("context unavailable")]

    return [this.json(view), null]
  }

  private async change(): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.change()
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("change unavailable")]

    return [this.json(view), null]
  }

  private async impact(): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.impact()
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("impact unavailable")]

    return [this.json(view), null]
  }

  private async diff(): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.diff()
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("diff unavailable")]

    return [this.json(view), null]
  }

  private async architectureGraph(): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.architectureGraph()
    if (viewError !== null) return [null, viewError]
    if (view === null) {
      return [null, WorkbenchFailureFactory.internal("architecture graph unavailable")]
    }

    return [this.json(view), null]
  }

  private async repoGraph(): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.repoGraph()
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("repo graph unavailable")]

    return [this.json(view), null]
  }

  private async mapping(): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.mapping()
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("mapping unavailable")]

    return [this.json(view), null]
  }

  private async check(request: Request): Promise<Result<Response, WorkbenchFailure>> {
    const [body, bodyError] = await this.body(request)
    if (bodyError !== null) return [null, bodyError]
    if (!this.isRecord(body))
      return [null, WorkbenchFailureFactory.badRequest("body must be an object")]
    if (body["structural"] !== undefined && typeof body["structural"] !== "boolean") {
      return [null, WorkbenchFailureFactory.badRequest("structural must be a boolean")]
    }

    const [view, viewError] = await this.options.service.check(body["structural"] === true)
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("check unavailable")]

    return [this.json(view), null]
  }

  private async mappingActions(request: Request): Promise<Result<Response, WorkbenchFailure>> {
    const [body, bodyError] = await this.body(request)
    if (bodyError !== null) return [null, bodyError]
    if (!this.isRecord(body))
      return [null, WorkbenchFailureFactory.badRequest("body must be an object")]

    const [actions, actionsError] = CurationParser.parseList(body["actions"])
    if (actionsError !== null) return [null, WorkbenchFailureFactory.badRequest(actionsError)]
    if (actions === null) return [null, WorkbenchFailureFactory.badRequest("no actions supplied")]

    const [view, viewError] = await this.options.service.applyMapping(
      actions as WorkbenchCurationRequest[],
    )
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("mapping unavailable")]

    return [this.json(view), null]
  }

  private async operations(
    request: Request,
    proposalRef: string,
  ): Promise<Result<Response, WorkbenchFailure>> {
    const [body, bodyError] = await this.body(request)
    if (bodyError !== null) return [null, bodyError]
    if (!this.isRecord(body))
      return [null, WorkbenchFailureFactory.badRequest("body must be an object")]
    if (body["simulate"] !== undefined && typeof body["simulate"] !== "boolean") {
      return [null, WorkbenchFailureFactory.badRequest("simulate must be a boolean")]
    }

    const [operations, operationsError] = ProposalOperationParser.parseList(body["operations"])
    if (operationsError !== null) {
      return [null, WorkbenchFailureFactory.badRequest(operationsError)]
    }
    if (operations === null)
      return [null, WorkbenchFailureFactory.badRequest("no operations supplied")]

    const [view, viewError] = await this.options.service.operations(
      proposalRef,
      operations as ProposalOperation[],
      body["simulate"] !== false,
    )
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("change unavailable")]

    return [this.json(view), null]
  }

  private async technical(proposalRef: string): Promise<Result<Response, WorkbenchFailure>> {
    const [view, viewError] = await this.options.service.technical(proposalRef)
    if (viewError !== null) return [null, viewError]
    if (view === null) return [null, WorkbenchFailureFactory.internal("technical view unavailable")]

    return [this.json(view), null]
  }

  private async method(
    actual: string,
    expected: string,
    handler: () => Promise<Result<Response, WorkbenchFailure>>,
  ): Promise<Result<Response, WorkbenchFailure>> {
    if (actual !== expected) {
      return [
        null,
        {
          code: "WORKBENCH-METHOD",
          message: `method ${actual} is not allowed`,
          status: 405,
        },
      ]
    }

    return handler()
  }

  private async body(request: Request): Promise<Result<unknown, WorkbenchFailure>> {
    const [text, textError] = await attemptAsync(() => request.text())
    if (textError !== null || text === null) {
      return [null, WorkbenchFailureFactory.badRequest(textError ?? "cannot read request body")]
    }
    if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
      return [null, WorkbenchFailureFactory.badRequest("request body is too large")]
    }

    const [parsed, parseError] = attempt(() => JSON.parse(text) as unknown)
    if (parseError !== null) return [null, WorkbenchFailureFactory.badRequest("invalid JSON body")]

    return [parsed, null]
  }

  private json(value: unknown, status = 200): Response {
    return Response.json(value, {
      status,
      headers: { "cache-control": "no-store" },
    })
  }

  private matches(path: string[], expected: string[]): boolean {
    return (
      path.length === expected.length && expected.every((segment, index) => path[index] === segment)
    )
  }

  private isProposalRoute(path: string[]): boolean {
    return path.length === 3 && path[0] === "proposals" && path[1] !== undefined
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }
}

export function errorResponse(failure: WorkbenchFailure): Response {
  const body: WorkbenchErrorView = {
    error: {
      code: failure.code,
      message: failure.message,
      ...(failure.choices === undefined ? {} : { choices: failure.choices }),
    },
  }

  return Response.json(body, {
    status: failure.status,
    headers: { "cache-control": "no-store" },
  })
}
