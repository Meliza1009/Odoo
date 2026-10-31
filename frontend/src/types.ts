export type Role = 'admin' | 'staff' | 'customer'

export interface Customer {
  id: number
  userId: number | null
  companyName: string
  contactName: string | null
  email: string | null
  phone: string | null
  billingAddress: string | null
  taxNumber: string | null
  isActive: boolean
  createdAt: string
}

export interface User {
  id: number
  email: string
  fullName: string
  role: Role
  isActive: boolean
  createdAt: string
  customer?: Customer | null
}

export interface Paged<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface CustomerRow extends Customer {
  userEmail: string | null
  activeSubscriptions: number
  outstandingBalance: number
}

export interface CustomerDetail extends CustomerRow {
  subscriptions: {
    id: number
    subscriptionNumber: string
    planName: string
    status: SubscriptionStatus
    startDate: string
    expiryDate: string | null
    nextBillingDate: string | null
    total: number
  }[]
  stats: { invoiceCount: number; invoicedTotal: number; paidTotal: number; overdueBalance: number }
}

export const PRODUCT_TYPES = ['software', 'service', 'addon', 'goods'] as const
export type ProductType = (typeof PRODUCT_TYPES)[number]

export interface Variant {
  id: number
  productId: number
  attribute: string
  value: string
  extraPrice: number
  finalPrice: number
  isActive: boolean
}

export interface Product {
  id: number
  name: string
  type: ProductType
  salesPrice: number
  costPrice: number
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  variantCount?: number
  variants?: Variant[]
}

export const BILLING_INTERVALS = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

export interface Plan {
  id: number
  name: string
  description: string | null
  billingInterval: BillingInterval
  price: number
  minQuantity: number
  startDate: string | null
  endDate: string | null
  autoCloseOnExpiry: boolean
  canCloseEarly: boolean
  canPause: boolean
  canRenew: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface TemplateLine {
  id: number
  productId: number
  productName: string
  variantId: number | null
  variantLabel: string | null
  quantity: number
  unitPrice: number | null
  effectiveUnitPrice: number
  taxRate: number
}

export interface QuotationTemplate {
  id: number
  name: string
  planId: number
  planName: string
  billingInterval: BillingInterval
  validityDays: number
  paymentTermsDays: number
  contractPeriods: number | null
  notes: string | null
  isActive: boolean
  lineCount?: number
  lines?: TemplateLine[]
  estimatedTotal?: number
}

export const SUBSCRIPTION_STATUSES = ['draft', 'quotation', 'confirmed', 'active', 'paused', 'cancelled', 'closed'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export interface SubscriptionRow {
  id: number
  subscriptionNumber: string
  customerId: number
  customerName: string
  planId: number
  planName: string
  billingInterval: BillingInterval
  templateId: number | null
  status: SubscriptionStatus
  startDate: string
  expiryDate: string | null
  nextBillingDate: string | null
  paymentTermsDays: number
  quotationValidUntil: string | null
  subtotal: number
  taxTotal: number
  total: number
  notes: string | null
  confirmedAt: string | null
  activatedAt: string | null
  pausedAt: string | null
  closedAt: string | null
  closeReason: string | null
  createdAt: string
  updatedAt: string
}

export interface SubscriptionLine {
  id: number
  lineType: 'plan' | 'product'
  productId: number | null
  variantId: number | null
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  subtotal: number
  taxAmount: number
  total: number
}

export interface HistoryEntry {
  id: number
  action: string
  details: Record<string, unknown>
  createdAt: string
  actorName: string | null
}

export interface SubscriptionDetail extends SubscriptionRow {
  plan: Pick<Plan, 'id' | 'name' | 'billingInterval' | 'price' | 'minQuantity' | 'autoCloseOnExpiry' | 'canCloseEarly' | 'canPause' | 'canRenew'>
  lines: SubscriptionLine[]
  history: HistoryEntry[]
  allowedTransitions: SubscriptionStatus[]
}

export interface Lookups {
  customers: { id: number; companyName: string }[]
  plans: { id: number; name: string; billingInterval: BillingInterval; price: number; minQuantity: number; startDate: string | null; endDate: string | null }[]
  products: {
    id: number
    name: string
    type: ProductType
    salesPrice: number
    variants: { id: number; productId: number; attribute: string; value: string; extraPrice: number }[]
  }[]
  templates: { id: number; name: string; planId: number; validityDays: number }[]
}

export type InvoiceStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled'

export interface InvoiceRow {
  id: number
  invoiceNumber: string
  subscriptionId: number
  subscriptionNumber: string
  customerId: number
  customerName: string
  customerEmail: string | null
  billingAddress: string | null
  taxNumber: string | null
  status: InvoiceStatus
  isOverdue: boolean
  daysOverdue: number
  billingPeriodStart: string
  billingPeriodEnd: string
  invoiceDate: string
  dueDate: string
  subtotal: number
  discountTotal: number
  taxTotal: number
  grandTotal: number
  amountPaid: number
  amountDue: number
  confirmedAt: string | null
  sentAt: string | null
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export interface InvoiceLine {
  id: number
  lineType: 'plan' | 'product'
  description: string
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
}

export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'card', 'upi', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export interface Payment {
  id: number
  invoiceId: number
  invoiceNumber?: string
  customerId?: number
  customerName?: string
  paymentMethod: PaymentMethod
  amount: number
  paymentDate: string
  referenceNumber: string | null
  note: string | null
  recordedBy: string | null
  createdAt: string
}

export interface InvoiceDetail extends InvoiceRow {
  lines: InvoiceLine[]
  discounts: { discountId: number; name: string; amount: number }[]
  payments: Payment[]
}

export type PagedWithSummary<T, S> = Paged<T> & { summary: S }

export interface TaxRule {
  id: number
  name: string
  rate: number
  appliesTo: 'all' | 'product_type' | 'product'
  productType: ProductType | null
  productId: number | null
  productName: string | null
  region: string | null
  isActive: boolean
  createdAt: string
}

export interface Discount {
  id: number
  name: string
  discountType: 'fixed_amount' | 'percentage'
  value: number
  minPurchase: number
  minQuantity: number
  startDate: string | null
  endDate: string | null
  usageLimit: number | null
  usageCount: number
  scope: 'subscription' | 'product'
  isActive: boolean
  state: 'active' | 'scheduled' | 'expired' | 'exhausted' | 'inactive'
  productIds: number[]
  subscriptionIds: number[]
  createdAt: string
}

export interface BillingRun {
  id: number
  runDate: string
  status: string
  subscriptionsChecked: number
  invoicesCreated: number
  periodsSkipped: number
  errors: { subscriptionId: number; error: string }[] | null
  startedAt: string
  finishedAt: string | null
  triggeredBy: string | null
}

export interface BillingRunResult {
  runId: number
  runDate: string
  subscriptionsChecked: number
  invoicesCreated: number
  periodsSkipped: number
  invoiceIds: number[]
  errors: { subscriptionId: number; error: string }[]
}

export interface ReportSummary {
  range: { dateFrom: string; dateTo: string }
  activeSubscriptions: number
  pausedSubscriptions: number
  openQuotations: number
  cancelledSubscriptions: number
  upcomingRenewals: number
  mrr: number
  arr: number
  invoicedTotal: number
  invoiceCount: number
  outstandingBalance: number
  outstandingCount: number
  overdueCount: number
  overdueBalance: number
  draftInvoices: number
  paidInvoices: number
  revenueCollected: number
  paymentCount: number
}

export interface RevenueReport {
  range: { dateFrom: string; dateTo: string }
  byMonth: { period: string; invoiced: number; collected: number }[]
  byPlan: { planId: number; planName: string; collected: number; subscriptions: number }[]
  byMethod: { paymentMethod: PaymentMethod; amount: number; count: number }[]
}

export interface SubscriptionReport {
  byStatus: { status: SubscriptionStatus; count: number }[]
  byPlan: { planId: number; planName: string; billingInterval: BillingInterval; active: number; total: number; mrr: number }[]
}
