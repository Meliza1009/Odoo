import { api } from '../api/client'
import type { Lookups } from '../types'
import { useAsync } from './useAsync'

const loadLookups = () => api.get<Lookups>('/subscriptions/lookups').then((r) => r.data)
const skip = () => Promise.resolve(null)

/**
 * Active customers, plans, products (with variants) and templates for dropdowns.
 * Internal users only: pass `enabled = false` on pages shared with the customer portal.
 */
export const useLookups = (enabled = true) => useAsync<Lookups | null>(enabled ? loadLookups : skip)
