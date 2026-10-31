const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export const formatMoney = (value: number | string | null | undefined) => currency.format(Number(value ?? 0))

export function formatDate(value: string | null | undefined) {
  if (!value) return '-'
  // DATE columns arrive as 'YYYY-MM-DD'; parse them as local dates to avoid timezone shifts.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : dateFormat.format(date)
}

export const titleCase = (value: string) => value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
