import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestOnly, RequireAuth } from './auth/guards'
import { AppLayout } from './layouts/AppLayout'
import { PortalLayout } from './layouts/PortalLayout'
import { ComingSoon } from './pages/ComingSoon'
import { DashboardPage } from './pages/DashboardPage'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route element={<GuestOnly />}>
        <Route path="/login" element={<ComingSoon title="Log in" branch="feature/authentication" />} />
      </Route>

      <Route path="/app" element={<RequireAuth roles={['admin', 'staff']} />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="customers" element={<ComingSoon title="Customers" branch="feature/authentication" />} />
          <Route path="products" element={<ComingSoon title="Products" branch="feature/products" />} />
          <Route path="plans" element={<ComingSoon title="Plans" branch="feature/products" />} />
          <Route path="quotation-templates" element={<ComingSoon title="Quotation templates" branch="feature/products" />} />
          <Route path="quotations" element={<ComingSoon title="Quotations" branch="feature/subscriptions" />} />
          <Route path="subscriptions" element={<ComingSoon title="Subscriptions" branch="feature/subscriptions" />} />
          <Route path="invoices" element={<ComingSoon title="Invoices" branch="feature/invoices" />} />
          <Route path="payments" element={<ComingSoon title="Payments" branch="feature/payments" />} />
          <Route path="reports" element={<ComingSoon title="Reports" branch="feature/reports" />} />
          <Route element={<RequireAuth roles={['admin']} />}>
            <Route path="discounts" element={<ComingSoon title="Discounts" branch="feature/subscriptions" />} />
            <Route path="staff" element={<ComingSoon title="Staff" branch="feature/authentication" />} />
            <Route path="settings" element={<ComingSoon title="Settings" branch="feature/products" />} />
          </Route>
        </Route>
      </Route>

      <Route path="/portal" element={<RequireAuth roles={['customer']} />}>
        <Route element={<PortalLayout />}>
          <Route index element={<ComingSoon title="My dashboard" branch="feature/authentication" />} />
          <Route path="subscriptions" element={<ComingSoon title="My subscriptions" branch="feature/subscriptions" />} />
          <Route path="invoices" element={<ComingSoon title="My invoices" branch="feature/invoices" />} />
          <Route path="payments" element={<ComingSoon title="Payment history" branch="feature/payments" />} />
          <Route path="profile" element={<ComingSoon title="My profile" branch="feature/authentication" />} />
        </Route>
      </Route>

      <Route path="/home" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
