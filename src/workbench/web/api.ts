import { attemptAsync, type Result, ok, fail } from "../../core/result"
import type {
  WorkbenchFinding,
  WorkbenchFlow,
  WorkbenchProjectSummary,
  WorkbenchSession,
  WorkbenchSnapshotComparison,
  WorkbenchSnapshotSummary,
  WorkbenchSystemArchitecture,
  WorkbenchSystemGraph,
  WorkbenchSystemNode,
} from "../types"

export interface ApiFailure {
  code: string
  message: string
  choices?: Array<{ label: string; context: string }>
}

export type ApiResult<Value> = Result<Value, ApiFailure>

export function describeFailure(failure: ApiFailure | null): string {
  return failure?.message ?? "The request could not complete."
}

let csrfToken = ""

export function setCsrfToken(token: string): void {
  csrfToken = token
}

export async function getSession(): Promise<ApiResult<WorkbenchSession>> {
  return request<WorkbenchSession>("/api/session")
}

export async function getCurrentProject(): Promise<ApiResult<WorkbenchProjectSummary>> {
  return requestV1<WorkbenchProjectSummary>("/api/v1/projects/current")
}

export async function getSystemArchitecture(
  projectId: string,
): Promise<ApiResult<WorkbenchSystemArchitecture>> {
  return requestV1<WorkbenchSystemArchitecture>(`/api/v1/projects/${projectId}/architecture`)
}

export async function getSystemGraph(
  projectId: string,
  depth = 2,
): Promise<ApiResult<WorkbenchSystemGraph>> {
  return requestV1<WorkbenchSystemGraph>(`/api/v1/projects/${projectId}/graph?depth=${depth}`)
}

export async function getSystemChildren(
  elementId: string,
): Promise<ApiResult<WorkbenchSystemNode[]>> {
  return requestV1<WorkbenchSystemNode[]>(
    `/api/v1/elements/${encodeURIComponent(elementId)}/children`,
  )
}

export async function getSystemRelationships(
  elementId: string,
): Promise<ApiResult<{ incoming: unknown[]; outgoing: unknown[] }>> {
  return requestV1(`/api/v1/elements/${encodeURIComponent(elementId)}/relationships`)
}

export async function getProjectSnapshots(
  projectId: string,
): Promise<ApiResult<WorkbenchSnapshotSummary[]>> {
  return requestV1<WorkbenchSnapshotSummary[]>(`/api/v1/projects/${projectId}/snapshots`)
}

export async function compareSnapshots(
  projectId: string,
  from: string,
  to: string,
): Promise<ApiResult<WorkbenchSnapshotComparison>> {
  const parameters = new URLSearchParams({ from, to })

  return requestV1<WorkbenchSnapshotComparison>(
    `/api/v1/projects/${projectId}/compare?${parameters.toString()}`,
  )
}

export async function getProjectFindings(
  projectId: string,
): Promise<ApiResult<WorkbenchFinding[]>> {
  return requestV1<WorkbenchFinding[]>(`/api/v1/projects/${projectId}/findings`)
}

export async function patchFinding(
  findingId: string,
  status: string,
  annotation: string,
): Promise<ApiResult<WorkbenchFinding>> {
  return requestV1<WorkbenchFinding>(`/api/v1/findings/${encodeURIComponent(findingId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, annotation }),
  })
}

export async function getProjectFlows(projectId: string): Promise<ApiResult<WorkbenchFlow[]>> {
  return requestV1<WorkbenchFlow[]>(`/api/v1/projects/${projectId}/flows`)
}

export async function getGeneratedSection(
  projectId: string,
  section: string,
): Promise<ApiResult<unknown>> {
  return requestV1<unknown>(
    `/api/v1/projects/${projectId}/spec/sections/${encodeURIComponent(section)}`,
  )
}

async function requestV1<Value>(path: string, init: RequestInit = {}): Promise<ApiResult<Value>> {
  const [body, error] = await request<{ data: Value }>(path, init)
  if (error !== null || body === null)
    return fail(error ?? { code: "WORKBENCH-RESPONSE", message: "empty response" })

  return ok(body.data)
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
    return fail({ code: "WORKBENCH-NETWORK", message: requestError ?? "request failed" })
  }
  if (!response.ok) {
    const [body] = await attemptAsync(() => response.json() as Promise<{ error?: ApiFailure }>)
    return fail(
      body?.error ?? {
        code: "WORKBENCH-RESPONSE",
        message: `request failed with status ${response.status}`,
      },
    )
  }
  const [body, bodyError] = await attemptAsync(() => response.json() as Promise<Value>)
  if (bodyError !== null || body === null)
    return fail({ code: "WORKBENCH-RESPONSE", message: bodyError ?? "empty response" })

  return ok(body)
}
