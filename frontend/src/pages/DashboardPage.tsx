import { useAuth } from '../auth/useAuth'
import { Alert, PageHeader } from '../components/ui'

export function DashboardPage() {
  const { user } = useAuth()
  return (
    <>
      <PageHeader title={`Welcome back, ${user?.fullName.split(' ')[0] ?? ''}`} description="Overview of subscriptions, revenue and invoices." />
      <Alert>Dashboard metrics are being built on feature/reports.</Alert>
    </>
  )
}
