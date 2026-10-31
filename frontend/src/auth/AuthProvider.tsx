import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, TOKEN_KEY, UNAUTHORIZED_EVENT } from '../api/client'
import type { Role, User } from '../types'
import { AuthContext, type AuthContextValue, type RegisterInput } from './context'

interface AuthResponse {
  token: string
  user: User
}

/** Resolves the user for the stored token, or null (dropping the token) when there is no valid session. */
async function loadSession(): Promise<User | null> {
  if (!localStorage.getItem(TOKEN_KEY)) return null
  try {
    const { data } = await api.get<{ user: User }>('/auth/me')
    return data.user
  } catch {
    localStorage.removeItem(TOKEN_KEY)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY))

  const refresh = useCallback(async () => {
    setUser(await loadSession())
  }, [])

  useEffect(() => {
    let cancelled = false
    loadSession().then((sessionUser) => {
      if (cancelled) return
      setUser(sessionUser)
      setLoading(false)
    })
    const onUnauthorized = () => setUser(null)
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => {
      cancelled = true
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    }
  }, [])

  const acceptSession = useCallback(({ token, user: nextUser }: AuthResponse) => {
    localStorage.setItem(TOKEN_KEY, token)
    setUser(nextUser)
    return nextUser
  }, [])

  const login = useCallback(
    async (email: string, password: string) => acceptSession((await api.post<AuthResponse>('/auth/login', { email, password })).data),
    [acceptSession],
  )

  const register = useCallback(
    async (input: RegisterInput) => acceptSession((await api.post<AuthResponse>('/auth/register', input)).data),
    [acceptSession],
  )

  const resetPassword = useCallback(
    async (token: string, password: string) => acceptSession((await api.post<AuthResponse>('/auth/reset-password', { token, password })).data),
    [acceptSession],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // The session ends on the client regardless of whether the server call succeeds.
    }
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
  }, [])

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, resetPassword, logout, refresh, hasRole }),
    [user, loading, login, register, resetPassword, logout, refresh, hasRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
