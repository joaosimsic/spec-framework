import { describe, expect, test } from "bun:test"
import { attempt, attemptAsync, fail, ok, type Result } from "../src/core/result"

describe("Result", () => {
  test("ok returns a success tuple", () => {
    const result: Result<number, string> = ok(42)

    expect(result).toEqual([42, null])
  })

  test("fail returns a failure tuple", () => {
    const result: Result<number, string> = fail("GRAPH_EMPTY")

    expect(result).toEqual([null, "GRAPH_EMPTY"])
  })

  test("checking err narrows value", () => {
    const [value, err] = ok(42)
    if (err !== null) throw new Error("expected success")

    expect(value + 1).toBe(43)
  })

  test("attempt wraps a successful operation", () => {
    const [value, err] = attempt(() => 42)

    expect(value).toBe(42)
    expect(err).toBeNull()
  })

  test("attempt wraps a thrown error", () => {
    const [value, err] = attempt(() => {
      throw new Error("boom")
    })

    expect(value).toBeNull()
    expect(err).toBe("boom")
  })

  test("attemptAsync wraps a successful operation", async () => {
    const [value, err] = await attemptAsync(async () => 42)

    expect(value).toBe(42)
    expect(err).toBeNull()
  })

  test("attemptAsync wraps a rejected operation", async () => {
    const [value, err] = await attemptAsync(async () => {
      throw new Error("boom")
    })

    expect(value).toBeNull()
    expect(err).toBe("boom")
  })
})
