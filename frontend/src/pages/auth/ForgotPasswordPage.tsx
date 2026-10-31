import { EnvelopeSimpleOpenIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { api, errorMessage } from '../../api/client'
import { Alert, Button, Input } from '../../components/ui'
import { AuthLayout } from '../../layouts/AuthLayout'
import { EMAIL_PATTERN } from '../../lib/forms'

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      setSentTo(email.trim())
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  const footer = (
    <Link to="/login" className="font-medium text-accent-dark hover:underline">
      Back to sign in
    </Link>
  )

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={footer}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-accent/10 p-3 text-accent-dark">
            <EnvelopeSimpleOpenIcon className="h-6 w-6" />
          </div>
          <p className="text-sm text-slate-600">
            If <span className="font-medium text-ink">{sentTo}</span> is registered, we have sent a link to reset your password. It expires in 30 minutes.
          </p>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your account email and we will send you a reset link." footer={footer}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" autoFocus required error={errors.email?.message} {...register('email', { required: 'Email is required', pattern: EMAIL_PATTERN })} />
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  )
}
