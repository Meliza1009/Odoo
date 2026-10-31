import { BellIcon, CheckIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { api, errorMessage } from '../api/client'
import { useAsync } from '../hooks/useAsync'
import { Alert, Button, EmptyState, LoadingState, Modal } from './ui'

interface Notification {
  id: string
  type: 'overdue' | 'due' | 'renewal' | 'quotation'
  title: string
  message: string
  date: string
  href: string
  readAt: string | null
}

interface Inbox {
  data: Notification[]
  unreadCount: number
  total: number
}

const loadNotifications = async () => (await api.get<Inbox>('/notifications')).data

/** A role-scoped attention inbox, shared by the internal and customer shells. */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const { pathname } = useLocation()
  const lastPath = useRef(pathname)
  const inbox = useAsync(loadNotifications)
  const { reload } = inbox

  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname
      reload()
    }
  }, [pathname, reload])

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') reload() }
    const timer = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [reload])

  const markRead = async (id?: string) => {
    setSaving(true)
    setActionError(null)
    try {
      await api.put(id ? `/notifications/${encodeURIComponent(id)}/read` : '/notifications/read-all')
      reload()
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  const unread = inbox.data?.unreadCount ?? 0

  return (
    <>
      <button
        type="button"
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-dark"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-haspopup="dialog"
        onClick={() => { setOpen(true); setActionError(null); reload() }}
      >
        <BellIcon className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-white" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {createPortal(<Modal open={open} onClose={() => setOpen(false)} title="Notifications" size="md" footer={
        <>
          <Button variant="secondary" onClick={reload} disabled={saving}>Refresh</Button>
          <Button onClick={() => void markRead()} loading={saving} disabled={!unread}>Mark all as read</Button>
        </>
      }>
        <p className="mb-4 text-sm text-muted">Invoice reminders, quotations and upcoming subscription expiry dates for your account.</p>
        {(actionError || inbox.error) && <Alert tone="error">{actionError ?? inbox.error}</Alert>}
        {inbox.loading ? <LoadingState label="Loading notifications" /> : inbox.data?.data.length ? (
          <ul className="divide-y divide-primary/10">
            {inbox.data.data.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-4">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-primary/15' : 'bg-accent-dark'}`} aria-label={item.readAt ? 'Read' : 'Unread'} />
                <div className="min-w-0 flex-1">
                  <Link to={item.href} onClick={() => { if (!item.readAt) void markRead(item.id); setOpen(false) }} className="text-sm font-semibold text-primary hover:underline">{item.title}</Link>
                  <p className="mt-1 break-words text-sm text-muted">{item.message}</p>
                </div>
                {!item.readAt && <button type="button" onClick={() => void markRead(item.id)} disabled={saving} className="rounded-control p-2 text-muted hover:bg-primary/5 hover:text-primary disabled:opacity-50" aria-label={`Mark ${item.title}: ${item.message} as read`} title="Mark as read"><CheckIcon className="h-4 w-4" /></button>}
              </li>
            ))}
          </ul>
        ) : !inbox.error ? <EmptyState title="You're all caught up" description="No invoice reminders, open quotations or upcoming subscription expiry dates." /> : null}
        {inbox.data && inbox.data.total > inbox.data.data.length && <p className="mt-3 text-xs text-muted">Showing {inbox.data.data.length} of {inbox.data.total} current reminders. Unread items appear first.</p>}
      </Modal>, document.body)}
    </>
  )
}
