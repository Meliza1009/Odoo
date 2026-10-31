import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { homePathFor } from '../../auth/context'
import { useAuth } from '../../auth/useAuth'
import { Alert, Button, Input } from '../../components/ui'
import { AuthLayout } from '../../layouts/AuthLayout'
import { applyServerErrors, EMAIL_PATTERN, PASSWORD_HINT, validatePassword } from '../../lib/forms'

interface RegisterForm {
  fullName: string
  companyName: string
  email: string
  phone: string
  password: string
  confirmPassword: string
}

export function RegisterPage() {
  const { register: signUp } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    getValues,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ defaultValues: { fullName: '', companyName: '', email: '', phone: '', password: '', confirmPassword: '' } })

  const onSubmit = handleSubmit(async ({ confirmPassword: _confirm, ...input }) => {
    setError(null)
    try {
      const user = await signUp({ ...input, companyName: input.companyName || undefined, phone: input.phone || undefined })
      navigate(homePathFor(user.role), { replace: true })
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(errorMessage(err, 'Could not create the account. Please try again.'))
    }
  })

  return (
    <AuthLayout
      title="Create your account"
      subtitle="See your subscriptions, invoices and payments in one place."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-dark hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input label="Full name" autoComplete="name" autoFocus required error={errors.fullName?.message} {...register('fullName', { required: 'Your name is required', maxLength: { value: 120, message: 'Too long' } })} />
        <Input label="Company" autoComplete="organization" hint="Leave blank if you are buying as an individual." error={errors.companyName?.message} {...register('companyName', { maxLength: { value: 200, message: 'Too long' } })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email', { required: 'Email is required', pattern: EMAIL_PATTERN })} />
          <Input label="Phone" type="tel" autoComplete="tel" error={errors.phone?.message} {...register('phone', { maxLength: { value: 40, message: 'Too long' } })} />
        </div>
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          hint={PASSWORD_HINT}
          error={errors.password?.message}
          {...register('password', { required: 'Password is required', validate: validatePassword })}
        />
        <Input
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register('confirmPassword', { validate: (v) => v === getValues('password') || 'Passwords do not match' })}
        />
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
