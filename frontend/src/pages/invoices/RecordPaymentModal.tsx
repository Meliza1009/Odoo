import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { Alert, Button, Input, Modal, Select, Textarea, useToast } from '../../components/ui'
import { applyServerErrors } from '../../lib/forms'
import { formatMoney, paymentMethodLabel, todayIso } from '../../lib/format'
import { PAYMENT_METHODS, type InvoiceDetail, type InvoiceRow, type PaymentMethod } from '../../types'

interface PaymentForm {
  invoiceId: string
  paymentMethod: PaymentMethod
  amount: number
  paymentDate: string
  referenceNumber: string
  note: string
}

interface Props {
  /** Fixed invoice (from the invoice page); otherwise the user picks one of `choices`. */
  invoice?: Pick<InvoiceRow, 'id' | 'invoiceNumber' | 'amountDue' | 'customerName'>
  choices?: Pick<InvoiceRow, 'id' | 'invoiceNumber' | 'amountDue' | 'customerName'>[]
  onClose: () => void
  onSaved: (invoice: InvoiceDetail) => void
}

export function RecordPaymentModal({ invoice, choices = [], onClose, onSaved }: Props) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState(invoice ? String(invoice.id) : '')
  const selected = invoice ?? choices.find((c) => String(c.id) === selectedId)
  const {
    register,
    handleSubmit,
    setValue,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<PaymentForm>({
    defaultValues: { invoiceId: selectedId, paymentMethod: 'bank_transfer', amount: invoice?.amountDue ?? Number.NaN, paymentDate: todayIso(), referenceNumber: '', note: '' },
  })

  const onSubmit = handleSubmit(async ({ invoiceId: _ignored, ...values }) => {
    setError(null)
    if (!selected) return setError('Choose an invoice')
    try {
      const { data } = await api.post<{ invoice: InvoiceDetail }>(`/invoices/${selected.id}/payments`, values)
      toast.success(data.invoice.status === 'paid' ? `${data.invoice.invoiceNumber} is fully paid` : `Payment of ${formatMoney(values.amount)} recorded`)
      onSaved(data.invoice)
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError, ['paymentMethod', 'amount', 'paymentDate', 'referenceNumber', 'note'])) setError(errorMessage(err))
    }
  })

  return (
    <Modal
      open
      title={invoice ? `Record payment · ${invoice.invoiceNumber}` : 'Record payment'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="payment-form" loading={isSubmitting}>
            Record payment
          </Button>
        </>
      }
    >
      <form id="payment-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {!invoice && (
          <Select
            label="Invoice"
            required
            value={selectedId}
            placeholder={choices.length ? 'Choose an unpaid invoice' : 'No unpaid invoices'}
            options={choices.map((c) => ({ value: c.id, label: `${c.invoiceNumber} · ${c.customerName} · ${formatMoney(c.amountDue)} due` }))}
            onChange={(e) => {
              setSelectedId(e.target.value)
              const choice = choices.find((c) => String(c.id) === e.target.value)
              if (choice) setValue('amount', choice.amountDue, { shouldValidate: true })
            }}
          />
        )}
        {selected && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {selected.customerName} owes <span className="font-semibold text-primary">{formatMoney(selected.amountDue)}</span> on this invoice.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Amount (₹)"
            type="number"
            min={0.01}
            step="0.01"
            required
            error={errors.amount?.message}
            {...register('amount', {
              valueAsNumber: true,
              validate: (v) => {
                if (Number.isNaN(v) || v <= 0) return 'Enter an amount greater than 0'
                if (selected && Math.round(v * 100) > Math.round(selected.amountDue * 100)) return `Cannot exceed the ${formatMoney(selected.amountDue)} due`
                return true
              },
            })}
          />
          <Select label="Method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: paymentMethodLabel(m) }))} error={errors.paymentMethod?.message} {...register('paymentMethod')} />
          <Input
            label="Payment date"
            type="date"
            max={todayIso()}
            required
            error={errors.paymentDate?.message}
            {...register('paymentDate', { required: 'Date is required', validate: (v) => v <= todayIso() || 'Cannot be in the future' })}
          />
          <Input label="Reference" placeholder="UTR, cheque or card ref." error={errors.referenceNumber?.message} {...register('referenceNumber', { maxLength: { value: 100, message: 'Too long' } })} />
        </div>
        <Textarea label="Note" rows={2} error={errors.note?.message} {...register('note')} />
      </form>
    </Modal>
  )
}
