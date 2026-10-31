import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { homePathFor } from '../../auth/context'
import { useAuth } from '../../auth/useAuth'
import { Alert, Button, Input } from '../../components/ui'
import { AuthLayout } from '../../layouts/AuthLayout'
import { EMAIL_PATTERN } from '../../lib/forms'

interface LoginForm {
  email: string
  password: string
}

const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_LOGINS === 'true'
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@brightloop.demo' },
  { label: 'Staff', email: 'staff@brightloop.demo' },
  { label: 'Customer', email: 'greenleaf@example.com' },
]
const DEMO_PASSWORD = 'Brightloop@2026'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { email: '', password: '' } })

  const from = (location.state as { from?: string } | null)?.from

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null)
    try {
      const user = await login(email.trim(), password)
      const home = homePathFor(user.role)
      // Only return to the page they came from if it belongs to their area of the app.
      navigate(from && from.startsWith(home) ? from : home, { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in. Please try again.'))
    }
  })

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage subscriptions and billing."
      footer={
        <>
          New to Brightloop?{' '}
          <Link to="/register" className="font-medium text-accent-dark hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          error={errors.email?.message}
          {...register('email', { required: 'Email is required', pattern: EMAIL_PATTERN })}
        />
        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            className="pr-10"
            error={errors.password?.message}
            {...register('password', { required: 'Password is required' })}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-[30px] rounded p-1 text-slate-400 hover:text-slate-600"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-accent-dark hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
          Sign in
        </Button>
      </form>

      {SHOW_DEMO && (
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Demo accounts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <Button
                key={account.email}
                size="sm"
                variant="secondary"
                onClick={() => {
                  setValue('email', account.email, { shouldValidate: true })
                  setValue('password', DEMO_PASSWORD, { shouldValidate: true })
                }}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
