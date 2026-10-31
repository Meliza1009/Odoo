import { KeyIcon, PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { ListCard } from '../../components/ListCard'
import { Alert, Button, Checkbox, Input, Modal, PageHeader, Select, StatusBadge, useToast, type Column } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'
import { applyServerErrors, EMAIL_PATTERN, PASSWORD_HINT, validatePassword } from '../../lib/forms'
import { formatDate } from '../../lib/format'
import type { User } from '../../types'

const columns: Column<User>[] = [
  {
    key: 'name',
    header: 'Name',
    render: (u) => (
      <div>
        <p className="font-medium text-primary">{u.fullName}</p>
        <p className="text-xs text-slate-500">{u.email}</p>
      </div>
    ),
  },
  { key: 'role', header: 'Role', render: (u) => <StatusBadge status={u.role} /> },
  { key: 'since', header: 'Added', render: (u) => formatDate(u.createdAt), hideOnMobile: true },
  { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.isActive ? 'active' : 'inactive'} /> },
]

export function StaffPage() {
  const [role, setRole] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [modal, setModal] = useState<{ user: User | null } | null>(null)
  const list = usePagedList<User>('/users', { role, includeInactive })

  return (
    <>
      <PageHeader
        title="Staff"
        description="Admins manage settings, catalogue and discounts. Staff handle customers, quotations, invoices and payments."
        actions={
          <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setModal({ user: null })}>
            Add staff member
          </Button>
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(u) => u.id}
        searchPlaceholder="Search name or email"
        filters={
          <>
            <Select
              aria-label="Role"
              className="w-36"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'staff', label: 'Staff' },
              ]}
              placeholder="All roles"
            />
            <Checkbox label="Show inactive" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          </>
        }
        onRowClick={(u) => setModal({ user: u })}
        emptyTitle="No staff found"
      />
      {modal && <StaffModal user={modal.user} onClose={() => setModal(null)} onSaved={list.reload} />}
    </>
  )
}

interface StaffForm {
  fullName: string
  email: string
  password: string
  role: 'admin' | 'staff'
  isActive: boolean
}

function StaffModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const { user: me } = useAuth()
  const isSelf = user?.id === me?.id
  const [error, setError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<StaffForm>({
    defaultValues: { fullName: user?.fullName ?? '', email: user?.email ?? '', password: '', role: user?.role === 'admin' ? 'admin' : 'staff', isActive: user?.isActive ?? true },
  })

  const onSubmit = handleSubmit(async ({ email, password, ...values }) => {
    setError(null)
    try {
      if (user) await api.put(`/users/${user.id}`, values)
      else await api.post('/users', { ...values, email, password })
      toast.success(user ? 'Staff member saved' : `${values.fullName} can now sign in`)
      onSaved()
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setFieldError, ['fullName', 'email', 'password', 'role'])) setError(errorMessage(err))
    }
  })

  if (resetting && user) return <ResetPasswordModal user={user} onClose={() => setResetting(false)} />

  return (
    <Modal
      open
      title={user ? user.fullName : 'Add staff member'}
      onClose={onClose}
      footer={
        <>
          {user && (
            <Button variant="ghost" className="mr-auto" icon={<KeyIcon className="h-4 w-4" />} onClick={() => setResetting(true)}>
              Reset password
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form="staff-form" loading={isSubmitting}>
            {user ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <form id="staff-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        {isSelf && <Alert tone="info">This is your account. You cannot change your own role or deactivate yourself.</Alert>}
        <Input label="Full name" required autoFocus error={errors.fullName?.message} {...register('fullName', { required: 'Name is required' })} />
        {user ? (
          <Input label="Email" value={user.email} readOnly className="bg-slate-100" />
        ) : (
          <>
            <Input label="Email" type="email" required error={errors.email?.message} {...register('email', { required: 'Email is required', pattern: EMAIL_PATTERN })} />
            <Input label="Temporary password" type="password" autoComplete="new-password" required hint={PASSWORD_HINT} error={errors.password?.message} {...register('password', { validate: validatePassword })} />
          </>
        )}
        {isSelf ? (
          <>
            <input type="hidden" {...register('role')} />
            <Input label="Role" value="Admin" readOnly className="bg-slate-100" />
          </>
        ) : (
          <Select
            label="Role"
            options={[
              { value: 'staff', label: 'Staff' },
              { value: 'admin', label: 'Admin' },
            ]}
            {...register('role')}
          />
        )}
        {user && !isSelf && <Checkbox label="Active" hint="Inactive staff cannot sign in." {...register('isActive')} />}
      </form>
    </Modal>
  )
}

function ResetPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { password: '' } })

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    try {
      await api.post(`/users/${user.id}/reset-password`, { password })
      toast.success(`Password reset for ${user.fullName}`)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  return (
    <Modal
      open
      title={`Reset password · ${user.fullName}`}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Back
          </Button>
          <Button type="submit" form="reset-form" loading={isSubmitting}>
            Reset password
          </Button>
        </>
      }
    >
      <form id="reset-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="New password" type="password" autoComplete="new-password" autoFocus required hint={PASSWORD_HINT} error={errors.password?.message} {...register('password', { validate: validatePassword })} />
      </form>
    </Modal>
  )
}
