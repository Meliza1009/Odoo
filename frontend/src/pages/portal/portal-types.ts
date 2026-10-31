import type { BillingInterval, ProductType } from '../../types'

export interface PortalSummary {
  activeSubscriptions: number
  openQuotations: number
  nextBillingDate: string | null
  nextBillingSubscriptionId: number | null
  outstandingCount: number
  outstandingBalance: number
  overdueCount: number
  overdueBalance: number
  paidInvoices: number
}

export interface PortalCatalog {
  plans: { id: number; name: string; description: string | null; billingInterval: BillingInterval; price: number; minQuantity: number; endDate: string | null }[]
  products: { id: number; name: string; type: ProductType; salesPrice: number; variants: { id: number; attribute: string; value: string; extraPrice: number; finalPrice: number }[] }[]
}

export interface AvailedDiscount {
  invoiceId: number
  invoiceNumber: string
  subscriptionId: number
  subscriptionNumber: string
  discountId: number
  name: string
  amount: number
  invoiceDate: string
}
