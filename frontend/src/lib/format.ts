import type { BillingInterval, PaymentMethod } from '../types'

const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const compactCurrency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const formatMoney = (value: number | string | null | undefined) => currency.format(Number(value ?? 0))
export const formatCompactMoney = (value: number | string | null | undefined) => compactCurrency.format(Number(value ?? 0))

function toDate(value: string) {
  // DATE columns arrive as 'YYYY-MM-DD'; parse them as local dates to avoid timezone shifts.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? '-' : dateFormat.format(date)
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '-'
  const date = toDate(value)
  return Number.isNaN(date.getTime()) ? '-' : dateTimeFormat.format(date)
}

export const titleCase = (value: string) => value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const pad = (n: number) => String(n).padStart(2, '0')
export const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayIso = () => toIsoDate(new Date())

export function addDaysIso(iso: string, days: number) {
  const d = toDate(iso)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

const intervalUnit: Record<BillingInterval, string> = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' }
export const perInterval = (interval: BillingInterval) => `/ ${intervalUnit[interval]}`

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card', upi: 'UPI', other: 'Other' }
export const paymentMethodLabel = (method: string) => PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? titleCase(method)

export const formatPercent = (value: number) => `${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`
