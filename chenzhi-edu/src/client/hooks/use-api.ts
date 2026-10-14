import { useCallback, useEffect, useRef, useState } from 'react'
import { api, toastError } from '../lib/api.js'

/**
 * 轻量数据拉取 hook（避免引入 react-query 这类重依赖，够用即止）。
 *
 * - 首次挂载拉取；reload() 手动刷新；依赖 dep 变化重拉。
 * - 统一 loading/error，错误自动 toast（可关）。
 */
export function useApi<T>(path: string | null, opts?: { deps?: unknown[]; silent?: boolean }) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const load = useCallback(async () => {
    if (!path) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<T>(path)
      if (mounted.current) setData(res)
    } catch (e) {
      const msg = (e as Error).message
      if (mounted.current) setError(msg)
      if (!opts?.silent) toastError(e)
    } finally {
      if (mounted.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...(opts?.deps ?? [])])

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load, setData }
}

/** 乐观更新的小工具：先改本地态，失败回滚 + toast */
export async function withOptimistic<T>(
  current: T,
  next: T,
  set: (v: T) => void,
  fn: () => Promise<unknown>,
) {
  set(next)
  try {
    await fn()
  } catch (e) {
    set(current)
    toastError(e)
    throw e
  }
}
