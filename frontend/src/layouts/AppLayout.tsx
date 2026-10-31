import { ListIcon, SignOutIcon, XIcon } from '@phosphor-icons/react'
import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Logo } from '../components/Logo'
import { LoadingState } from '../components/ui'
import { appNav, type NavItem } from '../navigation'
import { titleCase } from '../lib/format'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

/** Admin/staff shell: grouped sidebar on desktop, slide-in drawer on mobile and tablet. */
export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  if (!user) return null
  const items = appNav.filter((item) => item.roles.includes(user.role))
  const sections = items.reduce<{ name: string; items: NavItem[] }[]>((groups, item) => {
    const name = item.section ?? 'Overview'
    const group = groups.find((g) => g.name === name)
    if (group) group.items.push(item)
    else groups.push({ name, items: [item] })
    return groups
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-5">
        <Logo />
        <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-900/[0.05] lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 pt-2" aria-label="Main">
        {sections.map((section) => (
          <div key={section.name}>
            <p className="px-2.5 pb-1.5 text-[11px] font-medium text-slate-400">{section.name}</p>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13.5px] font-medium transition duration-200 ease-soft ${
                      isActive ? 'bg-surface text-ink shadow-xs ring-1 ring-slate-900/[0.07]' : 'text-slate-600 hover:bg-slate-900/[0.04] hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? 'text-accent-dark' : 'text-slate-400 group-hover:text-slate-600'}`} weight={isActive ? 'fill' : 'regular'} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-slate-900/[0.06] p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-1.5">
          <NavLink to="/app/profile" onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg" title="My profile">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-white">{initials(user.fullName)}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-ink">{user.fullName}</span>
              <span className="block truncate text-xs text-muted">{titleCase(user.role)}</span>
            </span>
          </NavLink>
          <button onClick={handleLogout} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-900/[0.05] hover:text-ink" aria-label="Log out" title="Log out">
            <SignOutIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-[100dvh] bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r border-slate-900/[0.06] bg-[#f9fafb] lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-primary/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-sheet bg-[#f9fafb] shadow-pop">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-900/[0.06] bg-background/85 px-4 backdrop-blur lg:hidden">
          <button className="rounded-lg p-2 text-ink hover:bg-slate-900/[0.05]" onClick={() => setOpen(true)} aria-label="Open menu">
            <ListIcon className="h-5 w-5" />
          </button>
          <Logo />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1240px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<LoadingState />}>
              <div key={pathname} className="animate-enter">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
