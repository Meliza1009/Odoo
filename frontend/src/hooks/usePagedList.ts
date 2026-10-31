import { useCallback, useState } from 'react'
import { api } from '../api/client'
import type { Paged } from '../types'
import { useAsync, useDebounced } from './useAsync'

type Filters = Record<string, string | number | boolean | null | undefined>

const clean = (params: Filters) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false))

/**
 * Server-side paginated list with a debounced search box and arbitrary filters.
 * Changing the search or any filter jumps back to page 1.
 */
export function usePagedList<T, R extends Paged<T> = Paged<T>>(path: string, filters: Filters = {}, pageSize = 20) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim())
  const key = JSON.stringify(clean({ ...filters, q }))

  // Reset paging when the query changes (adjusting state during render, as recommended over an effect).
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    setPage(1)
  }

  const load = useCallback(
    () => api.get<R>(path, { params: { ...JSON.parse(key), page, pageSize } }).then((r) => r.data),
    [path, key, page, pageSize],
  )
  const state = useAsync(load)
  return { ...state, page, setPage, search, setSearch }
}
