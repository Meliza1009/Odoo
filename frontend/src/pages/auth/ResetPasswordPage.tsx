import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { homePathFor } from '../../auth/context'
import { useAuth } from '../../auth/useAuth'
import { Alert, Button, Input } from '../../components/ui'
import { AuthLayout } from '../../layouts/AuthLayout'
import { PASSWORD_HINT, validatePassword } from '../../lib/forms'

interface ResetForm {
  password: string
  confirmPassword: string
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ defaultValues: { password: '', confirmPassword: '' } })

  const footer = (
    <Link to="/forgot-password" className="font-medium text-accent-dark hover:underline">
      Request a new link
    </Link>
  )

  if (!token) {
    return (
      <AuthLayout title="Invalid reset link" footer={footer}>
        <Alert tone="error">This password reset link is missing its token. Open the link from your email again, or request a new one.</Alert>
      </AuthLayout>
    )
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null)
    try {
      const user = await resetPassword(token, password)
      navigate(homePathFor(user.role), { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  return (
    <AuthLayout title="Choose a new password" subtitle="You will be signed in once it is saved." footer={footer}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register('password', { required: 'Password is required', validate: validatePassword })}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', { validate: (v) => v === getValues('password') || 'Passwords do not match' })}
        />
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Save password
        </Button>
      </form>
    </AuthLayout>
  )
}
