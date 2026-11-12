import { describe, expect, test } from "bun:test"
import { WorkbenchSecurity } from "../src/workbench/security"

const security = new WorkbenchSecurity({
  host: "127.0.0.1",
  port: 4173,
  token: "test-token",
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

describe("WorkbenchSecurity", () => {
  test("allows reads from an allowed host", () => {
    const [allowed, failure] = security.check(request("/api/graph"), false)

    expect(failure).toBeNull()
    expect(allowed).toBeNull()
  })

  test("rejects an unknown host", () => {
    const [, failure] = security.check(
      request("/api/graph", { headers: { host: "attacker.example" } }),
      false,
    )

    expect(failure?.code).toBe("WORKBENCH-FORBIDDEN")
    expect(failure?.status).toBe(403)
  })

  test("requires origin, CSRF token, and JSON for mutations", () => {
    const missing = security.check(request("/api/check", { method: "POST" }), true)
    expect(missing[1]?.message).toBe("request origin is not allowed")

    const withOrigin = security.check(
      request("/api/check", {
        method: "POST",
        headers: { origin: "http://127.0.0.1:4173" },
      }),
      true,
    )
    expect(withOrigin[1]?.message).toBe("missing or invalid CSRF token")

    const withToken = security.check(
      request("/api/check", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4173",
          "x-csrf-token": "test-token",
        },
      }),
      true,
    )
    expect(withToken[1]?.message).toBe("requests must use application/json")
  })

  test("allows a same-origin mutation with a valid token", () => {
    const [, failure] = security.check(
      request("/api/check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:4173",
          "sec-fetch-site": "same-origin",
          "x-csrf-token": "test-token",
        },
      }),
      true,
    )

    expect(failure).toBeNull()
  })

  test("rejects a cross-site mutation", () => {
    const [, failure] = security.check(
      request("/api/check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://127.0.0.1:4173",
          "sec-fetch-site": "cross-site",
          "x-csrf-token": "test-token",
        },
      }),
      true,
    )

    expect(failure?.message).toBe("cross-site requests are not allowed")
  })
})
