import { useState } from 'react'
import { api, errorMessage } from '../api/client'
import { todayIso } from '../lib/format'
import type { BillingRunResult } from '../types'
import { Alert, Button, Checkbox, Input, Modal, useToast } from './ui'

/** Billing day: generate invoices for every active subscription that is due on or before the chosen date. */
export function RunBillingDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (result: BillingRunResult) => void }) {
  const toast = useToast()
  const [runDate, setRunDate] = useState(todayIso())
  const [autoConfirm, setAutoConfirm] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const { data } = await api.post<BillingRunResult>('/billing/run', { runDate, autoConfirm })
      const summary = `${data.invoicesCreated} invoice${data.invoicesCreated === 1 ? '' : 's'} created from ${data.subscriptionsChecked} due subscription${data.subscriptionsChecked === 1 ? '' : 's'}`
      if (data.errors.length) toast.error(`${summary}. ${data.errors.length} subscription(s) failed; see billing history in Settings.`)
      else toast.success(summary)
      onDone(data)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={running ? () => undefined : onClose}
      title="Run billing"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button variant="accent" onClick={run} loading={running}>
            Generate invoices
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Every active subscription whose next billing date is on or before the run date gets an invoice per due period, with taxes and discounts applied. Periods that were already billed
          are skipped, so running this twice is safe.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Run date" type="date" value={runDate} max={todayIso()} onChange={(e) => setRunDate(e.target.value)} />
        <Checkbox label="Confirm invoices immediately" hint="Otherwise they are created as drafts for review." checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} />
      </div>
    </Modal>
  )
}
