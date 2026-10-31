import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { api, errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { Alert, Button, Card, CardHeader, Input, PageHeader, StatusBadge, Textarea, useToast } from '../components/ui'
import { applyServerErrors, PASSWORD_HINT, validatePassword } from '../lib/forms'

interface ProfileForm {
  fullName: string
  companyName: string
  contactName: string
  phone: string
  billingAddress: string
  taxNumber: string
}

/** Account details for any role; customers also edit the billing details printed on their invoices. */
export function ProfilePage() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const customer = user?.customer ?? null
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<ProfileForm>({
    defaultValues: {
      fullName: user?.fullName ?? '',
      companyName: customer?.companyName ?? '',
      contactName: customer?.contactName ?? '',
      phone: customer?.phone ?? '',
      billingAddress: customer?.billingAddress ?? '',
      taxNumber: customer?.taxNumber ?? '',
    },
  })

  if (!user) return null

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await api.put('/auth/me', values)
      await refresh()
      reset(values)
      toast.success('Profile saved')
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <>
      <PageHeader title="My profile" description={user.email} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Details" actions={<StatusBadge status={user.role} />} />
          <form onSubmit={onSubmit} className="space-y-4 p-5" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Full name" required error={errors.fullName?.message} {...register('fullName', { required: 'Name is required' })} />
              <Input label="Email" value={user.email} readOnly className="bg-slate-100" hint="Contact support to change your login email." />
              {customer && (
                <>
                  <Input label="Company" error={errors.companyName?.message} {...register('companyName', { required: 'Company name is required' })} />
                  <Input label="Contact person" error={errors.contactName?.message} {...register('contactName')} />
                  <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
                  <Input label="GST / tax number" error={errors.taxNumber?.message} {...register('taxNumber')} />
                </>
              )}
            </div>
            {customer && <Textarea label="Billing address" rows={3} hint="Printed on new invoices." error={errors.billingAddress?.message} {...register('billingAddress')} />}
            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
        <ChangePassword />
      </div>
    </>
  )
}

interface PasswordForm {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

function ChangePassword() {
  const toast = useToast()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({ defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } })

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setError(null)
    try {
      await api.put('/auth/me/password', { currentPassword, newPassword })
      reset()
      toast.success('Password changed')
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(errorMessage(err))
    }
  })

  return (
    <Card className="h-fit">
      <CardHeader title="Change password" />
      <form onSubmit={onSubmit} className="space-y-4 p-5" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Current password" type="password" autoComplete="current-password" required error={errors.currentPassword?.message} {...register('currentPassword', { required: 'Required' })} />
        <Input label="New password" type="password" autoComplete="new-password" required hint={PASSWORD_HINT} error={errors.newPassword?.message} {...register('newPassword', { validate: validatePassword })} />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', { validate: (v) => v === getValues('newPassword') || 'Passwords do not match' })}
        />
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </Card>
  )
}
