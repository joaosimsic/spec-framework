import { useCallback, useEffect, useState } from "react"
import type { ApiFailure, ApiResult } from "../api"

export interface ApiResource<Value> {
  data: Value | null
  failure: ApiFailure | null
  loading: boolean
  reload(): Promise<void>
  setData(value: Value | null): void
  setFailure(failure: ApiFailure | null): void
}

export function useApiResource<Value>(load: () => Promise<ApiResult<Value>>): ApiResource<Value> {
  const [data, setData] = useState<Value | null>(null)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    const [next, nextFailure] = await load()
    setData(next)
    setFailure(nextFailure)
    setLoading(false)
  }, [load])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, failure, loading, reload, setData, setFailure }
}
