import { ArrowLeftIcon, KeyIcon, PencilSimpleIcon, PlusIcon, UserMinusIcon } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DetailList,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  StatCard,
  StatusBadge,
  useToast,
} from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { applyServerErrors, EMAIL_PATTERN, PASSWORD_HINT, validatePassword } from '../../lib/forms'
import { formatDate, formatMoney } from '../../lib/format'
import type { CustomerDetail } from '../../types'
import { CustomerFormModal } from './CustomerFormModal'

export function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const load = useCallback(() => api.get<CustomerDetail>(`/customers/${id}`).then((r) => r.data), [id])
  const { data: customer, error, loading, reload } = useAsync(load)
  const [editing, setEditing] = useState(false)
  const [granting, setGranting] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!customer) return loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button variant="secondary" onClick={() => navigate('/app/customers')}>Back to customers</Button>} />

  const deactivate = async () => {
    setBusy(true)
    try {
      await api.delete(`/customers/${customer.id}`)
      toast.success(`${customer.companyName} deactivated`)
      setDeactivating(false)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Link to="/app/customers" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-ink">
        <ArrowLeftIcon className="h-4 w-4" /> Customers
      </Link>
      <PageHeader
        title={customer.companyName}
        description={customer.contactName ?? undefined}
        actions={
          <>
            <Button variant="secondary" icon={<PencilSimpleIcon className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {isAdmin && (
              <Button variant="secondary" icon={<KeyIcon className="h-4 w-4" />} onClick={() => setGranting(true)}>
                {customer.userId ? 'Reset portal password' : 'Give portal access'}
              </Button>
            )}
            {isAdmin && customer.isActive && (
              <Button variant="secondary" icon={<UserMinusIcon className="h-4 w-4" />} onClick={() => setDeactivating(true)}>
                Deactivate
              </Button>
            )}
            {customer.isActive && (
              <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => navigate(`/app/subscriptions/new?customerId=${customer.id}`)}>
                New quotation
              </Button>
            )}
          </>
        }
      />

      {!customer.isActive && (
        <div className="mb-4">
          <Alert tone="warning">This customer is inactive. They cannot log in to the portal or receive new subscriptions.</Alert>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active subscriptions" value={customer.activeSubscriptions} to={`/app/subscriptions?customerId=${customer.id}&status=active`} />
        <StatCard label="Invoiced to date" value={formatMoney(customer.stats.invoicedTotal)} to={`/app/invoices?customerId=${customer.id}&status=issued`} hint={`${customer.stats.invoiceCount} invoices`} />
        <StatCard label="Outstanding" value={formatMoney(customer.outstandingBalance)} to={`/app/invoices?customerId=${customer.id}&status=outstanding`} hint={`Paid ${formatMoney(customer.stats.paidTotal)}`} />
        <StatCard label="Overdue" value={formatMoney(customer.stats.overdueBalance)} to={`/app/invoices?customerId=${customer.id}&status=overdue`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <h2 className="mb-4 font-semibold text-ink">Details</h2>
          <DetailList columns={1}
            items={[
              { label: 'Assigned staff', value: customer.assignedStaffName ?? 'Unassigned' },
              { label: 'Email', value: customer.email },
              { label: 'Phone', value: customer.phone },
              { label: 'Tax number', value: customer.taxNumber },
              { label: 'Portal login', value: customer.userEmail ?? 'None' },
              { label: 'Billing address', value: customer.billingAddress && <span className="whitespace-pre-line">{customer.billingAddress}</span> },
              { label: 'Customer since', value: formatDate(customer.createdAt) },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Link to={`/app/invoices?customerId=${customer.id}`} className="text-sm font-medium text-accent-dark hover:underline">
              Invoices
            </Link>
            <span className="text-slate-300">·</span>
            <Link to={`/app/payments?customerId=${customer.id}`} className="text-sm font-medium text-accent-dark hover:underline">
              Payments
            </Link>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Subscriptions & quotations" />
          <DataTable
            columns={[
              { key: 'number', header: 'Number', render: (s) => <span className="font-medium text-primary">{s.subscriptionNumber}</span> },
              { key: 'plan', header: 'Plan', render: (s) => s.planName, hideOnMobile: true },
              { key: 'status', header: 'Status', render: (s) => <StatusBadge status={s.status} /> },
              { key: 'next', header: 'Next bill', render: (s) => formatDate(s.nextBillingDate), hideOnMobile: true },
              { key: 'total', header: 'Per period', render: (s) => formatMoney(s.total), className: 'text-right tabular-nums' },
            ]}
            rows={customer.subscriptions}
            rowKey={(s) => s.id}
            onRowClick={(s) => navigate(`/app/subscriptions/${s.id}`)}
            emptyTitle="No subscriptions yet"
            emptyDescription="Create a quotation to get this customer started."
          />
        </Card>
      </div>

      <CustomerFormModal open={editing} customer={customer} onClose={() => setEditing(false)} onSaved={reload} />
      {granting && <PortalAccessModal customer={customer} onClose={() => setGranting(false)} onSaved={reload} />}
      <ConfirmDialog
        open={deactivating}
        title="Deactivate customer?"
        message={`${customer.companyName} will no longer be able to log in, and cannot get new subscriptions. Existing invoices and history are kept.`}
        confirmLabel="Deactivate"
        loading={busy}
        onConfirm={deactivate}
        onCancel={() => setDeactivating(false)}
      />
    </>
  )
}

function PortalAccessModal({ customer, onClose, onSaved }: { customer: CustomerDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: customer.userEmail ?? customer.email ?? '', password: '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await api.post(`/customers/${customer.id}/portal-access`, values)
      toast.success(customer.userId ? 'Portal password reset' : 'Portal access granted')
      onSaved()
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <Modal
      open
      title={customer.userId ? 'Reset portal password' : 'Give portal access'}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="portal-form" loading={isSubmitting}>
            Save
          </Button>
        </>
      }
    >
      <form id="portal-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm text-slate-600">Share these credentials with the customer securely. They can change the password after signing in.</p>
        <Input label="Login email" type="email" required readOnly={!!customer.userId} className={customer.userId ? 'bg-slate-100' : ''} error={errors.email?.message} {...register('email', { required: 'Email is required', pattern: EMAIL_PATTERN })} />
        <Input
          label={customer.userId ? 'New password' : 'Password'}
          type="password"
          autoComplete="new-password"
          required
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register('password', { validate: validatePassword })}
        />
      </form>
    </Modal>
  )
}
