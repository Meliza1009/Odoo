import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { Alert, Button, Checkbox, Input, Modal, Textarea, useToast } from '../../components/ui'
import { applyServerErrors, EMAIL_PATTERN } from '../../lib/forms'
import type { CustomerRow } from '../../types'

interface CustomerForm {
  companyName: string
  contactName: string
  email: string
  phone: string
  billingAddress: string
  taxNumber: string
  isActive: boolean
}

const toForm = (c?: CustomerRow | null): CustomerForm => ({
  companyName: c?.companyName ?? '',
  contactName: c?.contactName ?? '',
  email: c?.email ?? '',
  phone: c?.phone ?? '',
  billingAddress: c?.billingAddress ?? '',
  taxNumber: c?.taxNumber ?? '',
  isActive: c?.isActive ?? true,
})

interface Props {
  open: boolean
  customer?: CustomerRow | null
  onClose: () => void
  onSaved: (customer: CustomerRow) => void
}

export function CustomerFormModal({ open, customer, onClose, onSaved }: Props) {
  return open ? <CustomerFormBody customer={customer} onClose={onClose} onSaved={onSaved} /> : null
}

function CustomerFormBody({ customer, onClose, onSaved }: Omit<Props, 'open'>) {
  const { hasRole } = useAuth()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerForm>({ defaultValues: toForm(customer) })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const { data } = customer ? await api.put<CustomerRow>(`/customers/${customer.id}`, values) : await api.post<CustomerRow>('/customers', values)
      toast.success(customer ? 'Customer updated' : `${data.companyName} added`)
      onSaved(data)
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <Modal
      open
      title={customer ? `Edit ${customer.companyName}` : 'New customer'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={isSubmitting}>
            {customer ? 'Save changes' : 'Add customer'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Company name" required autoFocus error={errors.companyName?.message} {...register('companyName', { required: 'Company name is required' })} />
          <Input label="Contact person" error={errors.contactName?.message} {...register('contactName')} />
          <Input label="Email" type="email" hint="Invoices are emailed here." error={errors.email?.message} {...register('email', { pattern: EMAIL_PATTERN })} />
          <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
          <Input label="GST / tax number" error={errors.taxNumber?.message} {...register('taxNumber')} />
        </div>
        <Textarea label="Billing address" rows={3} error={errors.billingAddress?.message} {...register('billingAddress')} />
        {customer && hasRole('admin') && <Checkbox label="Active" hint="Inactive customers cannot get new subscriptions or log in to the portal." {...register('isActive')} />}
      </form>
    </Modal>
  )
}
