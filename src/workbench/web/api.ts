import { attemptAsync } from "../../core/result"
import type {
  WorkbenchChangeView,
  WorkbenchCheckView,
  WorkbenchContextView,
  WorkbenchCurationRequest,
  WorkbenchDiffView,
  WorkbenchErrorView,
  WorkbenchGraphView,
  WorkbenchImpactView,
  WorkbenchMappingView,
  WorkbenchSession,
  WorkbenchTechnicalView,
} from "../types"

export interface ApiFailure {
  code: string
  message: string
  choices?: Array<{ label: string; context: string }>
}

export type ApiResult<Value> = [Value | null, ApiFailure | null]

let csrfToken = ""

export function setCsrfToken(token: string): void {
  csrfToken = token
}

export async function getSession(): Promise<ApiResult<WorkbenchSession>> {
  return request<WorkbenchSession>("/api/session")
}

export async function getGraph(): Promise<ApiResult<WorkbenchGraphView>> {
  return request<WorkbenchGraphView>("/api/graph")
}

export async function getContext(names: string[] = []): Promise<ApiResult<WorkbenchContextView>> {
  const parameters = new URLSearchParams()
  for (const name of names) parameters.append("name", name)
  const suffix = parameters.size === 0 ? "" : `?${parameters.toString()}`

  return request<WorkbenchContextView>(`/api/context${suffix}`)
}

export async function getMapping(): Promise<ApiResult<WorkbenchMappingView>> {
  return request<WorkbenchMappingView>("/api/mapping")
}

export async function postMappingActions(
  actions: WorkbenchCurationRequest[],
): Promise<ApiResult<WorkbenchMappingView>> {
  return request<WorkbenchMappingView>("/api/mapping/actions", {
    method: "POST",
    body: JSON.stringify({ actions }),
  })
}

export async function getImpact(): Promise<ApiResult<WorkbenchImpactView>> {
  return request<WorkbenchImpactView>("/api/impact")
}

export async function getDiff(): Promise<ApiResult<WorkbenchDiffView>> {
  return request<WorkbenchDiffView>("/api/diff")
}

export async function getChange(): Promise<ApiResult<WorkbenchChangeView>> {
  return request<WorkbenchChangeView>("/api/change")
}

export async function postCheck(structural = false): Promise<ApiResult<WorkbenchCheckView>> {
  return request<WorkbenchCheckView>("/api/check", {
    method: "POST",
    body: JSON.stringify({ structural }),
  })
}

export async function postOperations(
  proposalRef: string,
  operations: unknown[],
  simulate = true,
): Promise<ApiResult<WorkbenchChangeView>> {
  return request<WorkbenchChangeView>(`/api/proposals/${proposalRef}/ops`, {
    method: "POST",
    body: JSON.stringify({ operations, simulate }),
  })
}

export async function getTechnical(
  proposalRef: string,
): Promise<ApiResult<WorkbenchTechnicalView>> {
  return request<WorkbenchTechnicalView>(`/api/proposals/${proposalRef}/technical`)
}

async function request<Value>(path: string, init: RequestInit = {}): Promise<ApiResult<Value>> {
  const headers = new Headers(init.headers)
  headers.set("accept", "application/json")
  if (init.method !== undefined && init.method !== "GET") {
    headers.set("content-type", "application/json")
    headers.set("x-csrf-token", csrfToken)
  }

  const [response, requestError] = await attemptAsync(() => fetch(path, { ...init, headers }))
  if (requestError !== null || response === null) {
    return [null, { code: "WORKBENCH-NETWORK", message: requestError ?? "request failed" }]
  }

  if (!response.ok) return thisFailure(response)

  const [body, bodyError] = await attemptAsync(() => response.json() as Promise<Value>)
  if (bodyError !== null || body === null) {
    return [null, { code: "WORKBENCH-RESPONSE", message: bodyError ?? "empty response" }]
  }

  return [body, null]
}

async function thisFailure(response: Response): Promise<ApiResult<never>> {
  const [body] = await attemptAsync(() => response.json() as Promise<WorkbenchErrorView>)
  if (body !== null && body.error !== undefined) return [null, body.error]

  return [
    null,
    {
      code: "WORKBENCH-RESPONSE",
      message: `request failed with status ${response.status}`,
    },
  ]
}
