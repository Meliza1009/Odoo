import {
  BadgePercent,
  BarChart3,
  CreditCard,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Layers,
  type LucideIcon,
  Package,
  Receipt,
  RefreshCcw,
  Settings,
  UserCog,
  UserRound,
  Users,
} from 'lucide-react'
import type { Role } from './types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
  end?: boolean
}

const internal: Role[] = ['admin', 'staff']
const adminOnly: Role[] = ['admin']

/** Sidebar for admin/staff. Each module adds its own entry here. */
export const appNav: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, roles: internal, end: true },
  { to: '/app/customers', label: 'Customers', icon: Users, roles: internal },
  { to: '/app/products', label: 'Products', icon: Package, roles: internal },
  { to: '/app/plans', label: 'Plans', icon: Layers, roles: internal },
  { to: '/app/quotation-templates', label: 'Quotation templates', icon: FileSpreadsheet, roles: internal },
  { to: '/app/quotations', label: 'Quotations', icon: FileText, roles: internal },
  { to: '/app/subscriptions', label: 'Subscriptions', icon: RefreshCcw, roles: internal },
  { to: '/app/invoices', label: 'Invoices', icon: Receipt, roles: internal },
  { to: '/app/payments', label: 'Payments', icon: CreditCard, roles: internal },
  { to: '/app/discounts', label: 'Discounts', icon: BadgePercent, roles: adminOnly },
  { to: '/app/reports', label: 'Reports', icon: BarChart3, roles: internal },
  { to: '/app/staff', label: 'Staff', icon: UserCog, roles: adminOnly },
  { to: '/app/settings', label: 'Settings', icon: Settings, roles: adminOnly },
]

/** Top navigation for customers. */
export const portalNav: NavItem[] = [
  { to: '/portal', label: 'Dashboard', icon: LayoutDashboard, roles: ['customer'], end: true },
  { to: '/portal/subscriptions', label: 'Subscriptions', icon: RefreshCcw, roles: ['customer'] },
  { to: '/portal/invoices', label: 'Invoices', icon: Receipt, roles: ['customer'] },
  { to: '/portal/payments', label: 'Payments', icon: CreditCard, roles: ['customer'] },
  { to: '/portal/profile', label: 'Profile', icon: UserRound, roles: ['customer'] },
]
