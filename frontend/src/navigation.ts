import { ArrowsClockwiseIcon, ChartBarIcon, CreditCardIcon, FilesIcon, FileTextIcon, GearSixIcon, type Icon, PackageIcon, ReceiptIcon, SealPercentIcon, SquaresFourIcon, StackIcon, UserCircleIcon, UserGearIcon, UsersThreeIcon } from '@phosphor-icons/react'
import type { Role } from './types'

export interface NavItem {
  to: string
  label: string
  icon: Icon
  roles: Role[]
  end?: boolean
  /** Sidebar group heading (staff app only). */
  section?: 'Overview' | 'Sales' | 'Billing' | 'Catalog' | 'Admin'
}

const internal: Role[] = ['admin', 'staff']
const adminOnly: Role[] = ['admin']

/** Sidebar for admin/staff, grouped by section (order here is the order shown). */
export const appNav: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: SquaresFourIcon, roles: internal, end: true, section: 'Overview' },
  { to: '/app/reports', label: 'Reports', icon: ChartBarIcon, roles: internal, section: 'Overview' },
  { to: '/app/customers', label: 'Customers', icon: UsersThreeIcon, roles: internal, section: 'Sales' },
  { to: '/app/quotations', label: 'Quotations', icon: FileTextIcon, roles: internal, section: 'Sales' },
  { to: '/app/subscriptions', label: 'Subscriptions', icon: ArrowsClockwiseIcon, roles: internal, section: 'Sales' },
  { to: '/app/invoices', label: 'Invoices', icon: ReceiptIcon, roles: internal, section: 'Billing' },
  { to: '/app/payments', label: 'Payments', icon: CreditCardIcon, roles: internal, section: 'Billing' },
  { to: '/app/discounts', label: 'Discounts', icon: SealPercentIcon, roles: adminOnly, section: 'Billing' },
  { to: '/app/products', label: 'Products', icon: PackageIcon, roles: internal, section: 'Catalog' },
  { to: '/app/plans', label: 'Plans', icon: StackIcon, roles: internal, section: 'Catalog' },
  { to: '/app/quotation-templates', label: 'Quotation templates', icon: FilesIcon, roles: internal, section: 'Catalog' },
  { to: '/app/staff', label: 'Staff', icon: UserGearIcon, roles: adminOnly, section: 'Admin' },
  { to: '/app/settings', label: 'Settings', icon: GearSixIcon, roles: adminOnly, section: 'Admin' },
]

/** Top navigation for customers. */
export const portalNav: NavItem[] = [
  { to: '/portal', label: 'Dashboard', icon: SquaresFourIcon, roles: ['customer'], end: true },
  { to: '/portal/subscriptions', label: 'Subscriptions', icon: ArrowsClockwiseIcon, roles: ['customer'] },
  { to: '/portal/invoices', label: 'Invoices', icon: ReceiptIcon, roles: ['customer'] },
  { to: '/portal/payments', label: 'Payments', icon: CreditCardIcon, roles: ['customer'] },
  { to: '/portal/profile', label: 'Profile', icon: UserCircleIcon, roles: ['customer'] },
]
