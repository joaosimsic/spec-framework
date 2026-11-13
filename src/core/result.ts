export type Result<Value, Failure = string> =
  [value: Value, err: null] | [value: null, err: Failure]

export function ok<Value>(value: Value): Result<Value, never> {
  return [value, null]
}

export function fail<Failure>(error: Failure): Result<never, Failure> {
  return [null, error]
}

export function attempt<Value>(operation: () => Value): Result<Value, string> {
  try {
    return ok(operation())
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

export async function attemptAsync<Value>(
  operation: () => Promise<Value>,
): Promise<Result<Value, string>> {
  try {
    return ok(await operation())
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}
