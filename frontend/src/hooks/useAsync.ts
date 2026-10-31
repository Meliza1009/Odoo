import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../api/client'

interface Settled<T> {
  fn: () => Promise<T>
  version: number
  data: T | null
  error: string | null
}

/**
 * Runs `fn` on mount and whenever it changes; exposes loading/error state and a reload function.
 * Wrap `fn` in `useCallback` so it only changes when its inputs do.
 */
export function useAsync<T>(fn: () => Promise<T>) {
  const [version, setVersion] = useState(0)
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(() => {
    let cancelled = false
    fn()
      .then((data) => !cancelled && setSettled({ fn, version, data, error: null }))
      .catch((err) => !cancelled && setSettled((prev) => ({ fn, version, data: prev?.data ?? null, error: errorMessage(err) })))
    return () => {
      cancelled = true
    }
  }, [fn, version])

  const current = settled?.fn === fn && settled.version === version ? settled : null
  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback((data: T | null) => setSettled({ fn, version, data, error: null }), [fn, version])

  return { data: settled?.data ?? null, error: current?.error ?? null, loading: current === null, reload, setData }
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}
