import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { GuestOnly, RequireAuth } from './auth/guards'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FullPageLoader } from './components/ui'
import { AppLayout } from './layouts/AppLayout'
import { PortalLayout } from './layouts/PortalLayout'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'

// Every page is code-split; named exports are adapted to React.lazy's default-export contract.
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage').then((m) => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const CustomersPage = lazy(() => import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })))
const CustomerDetailPage = lazy(() => import('./pages/customers/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })))
const ProductsPage = lazy(() => import('./pages/catalog/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const PlansPage = lazy(() => import('./pages/catalog/PlansPage').then((m) => ({ default: m.PlansPage })))
const QuotationTemplatesPage = lazy(() => import('./pages/catalog/QuotationTemplatesPage').then((m) => ({ default: m.QuotationTemplatesPage })))
const SubscriptionsPage = lazy(() => import('./pages/subscriptions/SubscriptionsPage').then((m) => ({ default: m.SubscriptionsPage })))
const SubscriptionFormPage = lazy(() => import('./pages/subscriptions/SubscriptionFormPage').then((m) => ({ default: m.SubscriptionFormPage })))
const SubscriptionDetailPage = lazy(() => import('./pages/subscriptions/SubscriptionDetailPage').then((m) => ({ default: m.SubscriptionDetailPage })))
const InvoicesPage = lazy(() => import('./pages/invoices/InvoicesPage').then((m) => ({ default: m.InvoicesPage })))
const InvoiceDetailPage = lazy(() => import('./pages/invoices/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })))
const PaymentsPage = lazy(() => import('./pages/invoices/PaymentsPage').then((m) => ({ default: m.PaymentsPage })))
const DiscountsPage = lazy(() => import('./pages/admin/DiscountsPage').then((m) => ({ default: m.DiscountsPage })))
const StaffPage = lazy(() => import('./pages/admin/StaffPage').then((m) => ({ default: m.StaffPage })))
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const PortalDashboardPage = lazy(() => import('./pages/portal/PortalDashboardPage').then((m) => ({ default: m.PortalDashboardPage })))
const PortalCatalogPage = lazy(() => import('./pages/portal/PortalCatalogPage').then((m) => ({ default: m.PortalCatalogPage })))
const PortalDiscountsPage = lazy(() => import('./pages/portal/PortalDiscountsPage').then((m) => ({ default: m.PortalDiscountsPage })))
const PortalSubscriptionsPage = lazy(() => import('./pages/portal/PortalSubscriptionsPage').then((m) => ({ default: m.PortalSubscriptionsPage })))

/** Remounts list pages when their query string changes (e.g. dashboard link to ?status=overdue while already on the page). */
function KeyedBySearch({ children }: { children: ReactNode }) {
  const { search } = useLocation()
  return <div key={search}>{children}</div>
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route element={<GuestOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          {/* Outside GuestOnly: a signed-in user may still follow a reset link from their email. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/app" element={<RequireAuth roles={['admin', 'staff']} />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerDetailPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="quotation-templates" element={<QuotationTemplatesPage />} />
              <Route path="quotations" element={<KeyedBySearch><SubscriptionsPage key="quotations" kind="quotations" /></KeyedBySearch>} />
              <Route path="subscriptions" element={<KeyedBySearch><SubscriptionsPage key="subscriptions" kind="subscriptions" /></KeyedBySearch>} />
              <Route path="subscriptions/new" element={<KeyedBySearch><SubscriptionFormPage /></KeyedBySearch>} />
              <Route path="subscriptions/:id" element={<SubscriptionDetailPage />} />
              <Route path="subscriptions/:id/edit" element={<SubscriptionFormPage />} />
              <Route path="invoices" element={<KeyedBySearch><InvoicesPage /></KeyedBySearch>} />
              <Route path="invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="payments" element={<KeyedBySearch><PaymentsPage /></KeyedBySearch>} />
              <Route path="profile" element={<ProfilePage />} />
              <Route element={<RequireAuth roles={['admin']} />}>
                <Route path="reports" element={<ReportsPage />} />
                <Route path="discounts" element={<DiscountsPage />} />
                <Route path="staff" element={<StaffPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="/portal" element={<RequireAuth roles={['customer']} />}>
            <Route element={<PortalLayout />}>
              <Route index element={<PortalDashboardPage />} />
              <Route path="subscriptions" element={<KeyedBySearch><PortalSubscriptionsPage /></KeyedBySearch>} />
              <Route path="catalog" element={<PortalCatalogPage />} />
              <Route path="discounts" element={<PortalDiscountsPage />} />
              <Route path="subscriptions/:id" element={<SubscriptionDetailPage portal />} />
              <Route path="invoices" element={<KeyedBySearch><InvoicesPage portal /></KeyedBySearch>} />
              <Route path="invoices/:id" element={<InvoiceDetailPage portal />} />
              <Route path="payments" element={<KeyedBySearch><PaymentsPage portal /></KeyedBySearch>} />
              <Route path="profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
