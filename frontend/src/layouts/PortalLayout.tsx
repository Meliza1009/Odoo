import { ListIcon, SignOutIcon, XIcon } from '@phosphor-icons/react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Logo } from '../components/Logo'
import { LoadingState } from '../components/ui'
import { portalNav } from '../navigation'

/** Customer shell: a floating top bar with the account's company, sections and sign-out. */
export function PortalLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition duration-200 ease-soft ${
      isActive ? 'bg-surface text-ink shadow-xs ring-1 ring-slate-900/[0.07]' : 'text-slate-600 hover:bg-slate-900/[0.04] hover:text-ink'
    }`

  return (
    <div className="min-h-[100dvh] bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 px-3 pt-3 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-surface bg-[#f9fafb]/85 shadow-card ring-1 ring-slate-900/[0.07] backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-4 px-4">
            <div className="flex min-w-0 items-center gap-3">
              <Logo />
              {user?.customer?.companyName && (
                <span className="hidden truncate border-l border-slate-900/10 pl-3 text-[13px] text-muted lg:block">{user.customer.companyName}</span>
              )}
            </div>
            <nav className="hidden items-center gap-0.5 md:flex" aria-label="Portal">
              {portalNav.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end} className={linkClass}>
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="hidden items-center gap-1 md:flex">
              <span className="max-w-40 truncate px-2 text-[13px] text-muted">{user?.fullName}</span>
              <button onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-900/[0.05] hover:text-ink">
                <SignOutIcon className="h-4 w-4" /> Log out
              </button>
            </div>
            <button className="rounded-lg p-2 hover:bg-slate-900/[0.05] md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={open}>
              {open ? <XIcon className="h-5 w-5" /> : <ListIcon className="h-5 w-5" />}
            </button>
          </div>
          {open && (
            <nav className="flex animate-enter flex-col gap-0.5 border-t border-slate-900/[0.06] p-2 md:hidden" aria-label="Portal mobile">
              {portalNav.map(({ to, label, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={(state) => `${linkClass(state)} flex items-center gap-2.5 py-2`}>
                  <Icon className="h-[18px] w-[18px] text-slate-400" /> {label}
                </NavLink>
              ))}
              <button onClick={handleLogout} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-slate-600 hover:bg-slate-900/[0.04]">
                <SignOutIcon className="h-[18px] w-[18px] text-slate-400" /> Log out
              </button>
            </nav>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<LoadingState />}>
            <div key={pathname} className="animate-enter">
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
