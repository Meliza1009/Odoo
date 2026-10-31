import { ListIcon, SignOutIcon, XIcon } from '@phosphor-icons/react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { NotificationBell } from '../components/NotificationBell'
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
  const mobileMenuRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia('(min-width: 1024px)')
    if (desktop.matches) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controls = () => Array.from(mobileMenuRef.current?.querySelectorAll<HTMLElement>('button, a[href]') ?? [])
    controls()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
      if (event.key !== 'Tab') return
      const items = controls()
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault()
        items.at(-1)?.focus()
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault()
        items[0]?.focus()
      }
    }
    const onResize = () => { if (desktop.matches) setOpen(false) }
    document.addEventListener('keydown', onKey)
    desktop.addEventListener('change', onResize)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      desktop.removeEventListener('change', onResize)
      if (opener?.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open])

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
      <div className="flex h-20 shrink-0 items-center justify-between border-b border-white/10 px-6">
        <Logo light />
        <button className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <XIcon className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-7 overflow-y-auto overscroll-contain px-3 pb-4 pt-6" aria-label="Main">
        {sections.map((section) => (
          <div key={section.name}>
            <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-white/45">{section.name}</p>
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition duration-200 ease-soft ${
                      isActive ? 'bg-white/13 text-white ring-1 ring-white/10' : 'text-white/65 hover:bg-white/[0.07] hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${isActive ? 'text-[#57dbc7]' : 'text-white/45 group-hover:text-white/80'}`} weight={isActive ? 'duotone' : 'regular'} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-lg p-1.5">
          <NavLink to="/app/profile" onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg" title="My profile">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/12 text-xs font-semibold text-white ring-1 ring-white/15">{initials(user.fullName)}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-white">{user.fullName}</span>
              <span className="block truncate text-xs text-white/50">{titleCase(user.role)}</span>
            </span>
          </NavLink>
          <button onClick={handleLogout} className="rounded-lg p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white" aria-label="Log out" title="Log out">
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
      <aside className="loop-field fixed inset-y-0 left-0 z-30 hidden w-[260px] bg-primary lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-primary/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside ref={mobileMenuRef} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Navigation menu" className="loop-field absolute inset-y-0 left-0 w-72 max-w-[85vw] animate-sheet bg-primary shadow-pop">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-900/[0.06] bg-background/85 px-4 backdrop-blur lg:px-10">
          <button className="rounded-lg p-2 text-ink hover:bg-slate-900/[0.05] lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="mobile-menu">
            <ListIcon className="h-5 w-5" />
          </button>
          <span className="lg:hidden"><Logo /></span>
          <span className="hidden text-sm text-muted lg:block">{titleCase(user.role)} workspace</span>
          <div className="ml-auto"><NotificationBell /></div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1280px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10">
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
