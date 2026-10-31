import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <Logo />
      <p className="text-6xl font-bold text-primary">404</p>
      <p className="text-slate-600">The page you are looking for does not exist.</p>
      <Link to="/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-light">
        Back to home
      </Link>
    </div>
  )
}
