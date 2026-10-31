import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { Alert, Button, Checkbox, Input, Modal, Select, Textarea, useToast } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { applyServerErrors, EMAIL_PATTERN } from '../../lib/forms'
import type { CustomerRow, Paged, User } from '../../types'

interface CustomerForm {
  companyName: string
  contactName: string
  email: string
  phone: string
  billingAddress: string
  taxNumber: string
  assignedStaffId: string
  isActive: boolean
}

const toForm = (c?: CustomerRow | null): CustomerForm => ({
  companyName: c?.companyName ?? '',
  contactName: c?.contactName ?? '',
  email: c?.email ?? '',
  phone: c?.phone ?? '',
  billingAddress: c?.billingAddress ?? '',
  taxNumber: c?.taxNumber ?? '',
  assignedStaffId: c?.assignedStaffId?.toString() ?? '',
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
  const isAdmin = hasRole('admin')
  const loadStaff = useCallback(async () => {
    if (!isAdmin) return []
    const members: User[] = []
    let page = 1
    while (true) {
      const { data } = await api.get<Paged<User>>('/users', { params: { role: 'staff', pageSize: 100, page } })
      members.push(...data.data)
      if (page >= data.totalPages) return members
      page += 1
    }
  }, [isAdmin])
  const staff = useAsync(loadStaff)
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
      const { assignedStaffId, ...details } = values
      const body = isAdmin ? { ...details, assignedStaffId: assignedStaffId ? Number(assignedStaffId) : null } : details
      const { data } = customer ? await api.put<CustomerRow>(`/customers/${customer.id}`, body) : await api.post<CustomerRow>('/customers', body)
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
        {isAdmin && <>
          <Select label="Assigned staff" placeholder="Unassigned" disabled={staff.loading || !!staff.error} error={staff.error ?? errors.assignedStaffId?.message}
            hint="Staff can only access customer accounts assigned to them." options={staff.data?.map((u) => ({ value: u.id, label: u.fullName })) ?? []} {...register('assignedStaffId')} />
          {staff.error && <Button variant="secondary" size="sm" onClick={staff.reload}>Retry staff list</Button>}
        </>}
        <Textarea label="Billing address" rows={3} error={errors.billingAddress?.message} {...register('billingAddress')} />
        {customer && hasRole('admin') && <Checkbox label="Active" hint="Inactive customers cannot get new subscriptions or log in to the portal." {...register('isActive')} />}
      </form>
    </Modal>
  )
}
