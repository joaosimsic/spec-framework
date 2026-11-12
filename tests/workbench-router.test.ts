import { describe, expect, test } from "bun:test"
import type { Result } from "../src/core/result"
import type { WorkbenchFailure } from "../src/workbench/failure"
import { WorkbenchRouter } from "../src/workbench/router"
import { WorkbenchSecurity } from "../src/workbench/security"
import type { WorkbenchService } from "../src/workbench/service"
import type {
  WorkbenchCheckView,
  WorkbenchGraphView,
  WorkbenchSession,
} from "../src/workbench/types"

class FakeWorkbenchService {
  async session(
    csrfToken: string,
    assetReady: boolean,
  ): Promise<Result<WorkbenchSession, WorkbenchFailure>> {
    return [
      {
        csrf_token: csrfToken,
        mode: "read-only",
        commit: "abc123",
        dirty: false,
        proposal: null,
        views: ["overview"],
        asset_ready: assetReady,
      },
      null,
    ]
  }

  async graph(): Promise<Result<WorkbenchGraphView, WorkbenchFailure>> {
    return [{ commit: "abc123", dirty: false, entries: [] }, null]
  }

  async check(structural: boolean): Promise<Result<WorkbenchCheckView, WorkbenchFailure>> {
    return [
      {
        errors: structural ? 0 : 1,
        warnings: 0,
        findings: [],
      },
      null,
    ]
  }
}

const security = new WorkbenchSecurity({
  host: "127.0.0.1",
  port: 4173,
  token: "test-token",
})

const router = new WorkbenchRouter({
  service: new FakeWorkbenchService() as unknown as WorkbenchService,
  security,
  assetReady: true,
})

function request(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Request {
  return new Request(`http://127.0.0.1:4173${path}`, {
    ...init,
    headers: { host: "127.0.0.1:4173", ...init.headers },
  })
}

function mutationHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    origin: "http://127.0.0.1:4173",
    "x-csrf-token": "test-token",
  }
}

describe("WorkbenchRouter", () => {
  test("serves the graph view", async () => {
    const [response, failure] = await router.handle(request("/api/graph"))

    expect(failure).toBeNull()
    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ commit: "abc123", dirty: false, entries: [] })
  })

  test("rejects the wrong method", async () => {
    const [response, failure] = await router.handle(
      request("/api/graph", { method: "POST", headers: mutationHeaders() }),
    )

    expect(response).toBeNull()
    expect(failure?.status).toBe(405)
  })

  test("rejects malformed check input", async () => {
    const [response, failure] = await router.handle(
      request("/api/check", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ structural: "yes" }),
      }),
    )

    expect(response).toBeNull()
    expect(failure?.status).toBe(400)
    expect(failure?.message).toBe("structural must be a boolean")
  })

  test("runs a check with valid input", async () => {
    const [response, failure] = await router.handle(
      request("/api/check", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ structural: true }),
      }),
    )

    expect(failure).toBeNull()
    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({ errors: 0, warnings: 0, findings: [] })
  })

  test("rejects operations without a list", async () => {
    const [response, failure] = await router.handle(
      request("/api/proposals/proposal_123/ops", {
        method: "POST",
        headers: mutationHeaders(),
        body: JSON.stringify({ operations: [] }),
      }),
    )

    expect(response).toBeNull()
    expect(failure?.status).toBe(400)
    expect(failure?.message).toBe("no operations supplied")
  })

  test("rejects unknown endpoints", async () => {
    const [response, failure] = await router.handle(request("/api/missing"))

    expect(response).toBeNull()
    expect(failure?.status).toBe(404)
  })

  test("requires the CSRF token for mutations", async () => {
    const [response, failure] = await router.handle(
      request("/api/check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:4173",
        },
        body: JSON.stringify({ structural: true }),
      }),
    )

    expect(response).toBeNull()
    expect(failure?.status).toBe(403)
  })
})
