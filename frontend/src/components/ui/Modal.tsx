import { XIcon } from '@phosphor-icons/react'
import { useEffect, type ReactNode } from 'react'
import { Button } from './Button'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade bg-primary/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative flex max-h-[92dvh] w-full animate-pop flex-col rounded-t-surface bg-surface shadow-pop ring-1 ring-slate-900/[0.08] sm:rounded-surface ${widths[size]}`}>
        <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
          <h2 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          <button onClick={onClose} className="-mr-2 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-900/[0.05] hover:text-ink" aria-label="Close">
            <XIcon className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-5 pt-2">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 rounded-b-surface border-t border-slate-900/[0.06] bg-slate-50/70 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', loading, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-muted">{message}</div>
    </Modal>
  )
}
