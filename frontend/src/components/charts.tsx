import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCompactMoney, formatMoney, paymentMethodLabel } from '../lib/format'
import { EmptyState } from './ui'

const monthLabel = (period: string) => new Date(`${period}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

const tooltipMoney = (value: unknown) => formatMoney(Number(value))

export function RevenueChart({ data, height = 280 }: { data: { period: string; invoiced: number; collected: number }[]; height?: number }) {
  if (!data.length || data.every((d) => !d.invoiced && !d.collected)) {
    return <EmptyState title="No revenue in this period" description="Invoices and payments will show up here once billing runs." />
  }
  return (
    <div style={{ height }} role="img" aria-label="Invoiced and collected revenue by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="period" tickFormatter={monthLabel} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatCompactMoney(v)} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} width={64} />
          <Tooltip formatter={tooltipMoney} labelFormatter={(l) => monthLabel(String(l))} cursor={{ fill: '#f1f5f9' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="invoiced" name="Invoiced" fill="#14213d" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="collected" name="Collected" fill="#00bfa6" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const PIE_COLORS = ['#14213d', '#00bfa6', '#6366f1', '#f59e0b', '#94a3b8']

export function BreakdownPie({ data, nameKey, valueKey, money = true }: { data: Record<string, unknown>[]; nameKey: string; valueKey: string; money?: boolean }) {
  const rows = data.filter((d) => Number(d[valueKey]) > 0)
  if (!rows.length) return <EmptyState title="No data in this period" />
  return (
    <div className="h-64" role="img" aria-label="Breakdown chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey={valueKey} nameKey={nameKey} innerRadius={50} outerRadius={85} paddingAngle={2}>
            {rows.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => (money ? formatMoney(Number(v)) : String(v))} />
          <Legend formatter={(v) => paymentMethodLabel(String(v))} wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
