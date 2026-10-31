import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageLoader } from '../components/ui'
import type { Role } from '../types'
import { homePathFor } from './context'
import { useAuth } from './useAuth'

/** Renders children only for signed-in users with one of the allowed roles. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children?: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />
  return children ? <>{children}</> : <Outlet />
}

/** Login/register pages: signed-in users are sent to their home area instead. */
export function GuestOnly({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (user) return <Navigate to={homePathFor(user.role)} replace />
  return children ? <>{children}</> : <Outlet />
}
