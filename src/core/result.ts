export type Result<Value, Failure = string> = [value: Value | null, err: Failure | null]

export function attempt<Value>(operation: () => Value): Result<Value, string> {
  try {
    return [operation(), null]
  } catch (error) {
    return [null, error instanceof Error ? error.message : String(error)]
  }
}

export async function attemptAsync<Value>(
  operation: () => Promise<Value>,
): Promise<Result<Value, string>> {
  try {
    return [await operation(), null]
  } catch (error) {
    return [null, error instanceof Error ? error.message : String(error)]
  }
}
