import { PackageIcon, StackIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader, SearchInput } from '../../components/ui'
import { useAsync } from '../../hooks/useAsync'
import { formatDate, formatMoney, perInterval, titleCase } from '../../lib/format'
import type { PortalCatalog } from './portal-types'

const loadCatalog = () => api.get<PortalCatalog>('/portal/catalog').then((r) => r.data)

export function PortalCatalogPage() {
  const { data, error, loading, reload } = useAsync(loadCatalog)
  const [search, setSearch] = useState('')
  const q = search.trim().toLowerCase()
  const plans = data?.plans.filter((p) => `${p.name} ${p.description ?? ''}`.toLowerCase().includes(q)) ?? []
  const products = data?.products.filter((p) => `${p.name} ${p.type}`.toLowerCase().includes(q)) ?? []

  return (
    <>
      <PageHeader title="Available plans & products" description="Explore current subscription plans and products. Contact your account manager to request a quotation or change your plan." actions={<Link to="/portal/subscriptions" className="inline-flex min-h-10 items-center rounded-control px-4 text-sm font-semibold text-accent-dark ring-1 ring-primary/15 hover:bg-primary/5">My subscriptions</Link>} />
      <SearchInput aria-label="Search plans and products" placeholder="Search plans and products" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-8 max-w-md" />
      {!data ? loading ? <LoadingState /> : <ErrorState description={error ?? undefined} action={<Button onClick={reload}>Try again</Button>} /> : (
        <div className="space-y-10">
          <section aria-labelledby="available-plans-heading">
            <h2 id="available-plans-heading" className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight text-ink"><StackIcon className="h-5 w-5 text-accent-dark" /> Available subscription plans</h2>
            {plans.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan) => (
              <Card key={plan.id} className="flex flex-col p-6">
                <h3 className="text-lg font-semibold text-ink">{plan.name}</h3>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-ink">{formatMoney(plan.price)} <span className="text-sm font-normal text-muted">{perInterval(plan.billingInterval)}</span></p>
                {plan.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{plan.description}</p>}
                <div className="mt-auto pt-5 text-xs leading-relaxed text-muted">
                  <p>Minimum quantity: {plan.minQuantity}</p>
                  {plan.endDate && <p>Available until {formatDate(plan.endDate)}</p>}
                  <p className="mt-2">Plan fee shown before taxes and additional products.</p>
                </div>
              </Card>
            ))}</div> : <Card><EmptyState title={q ? 'No matching plans' : 'No plans available'} description={q ? 'Try another search.' : 'Your account manager can help with upcoming plans.'} /></Card>}
          </section>
          <section aria-labelledby="available-products-heading">
            <h2 id="available-products-heading" className="mb-4 flex items-center gap-2 text-xl font-semibold tracking-tight text-ink"><PackageIcon className="h-5 w-5 text-accent-dark" /> Available products</h2>
            {products.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => (
              <Card key={product.id} className="p-6">
                <p className="text-xs font-medium text-accent-dark">{titleCase(product.type)}</p>
                <h3 className="mt-2 text-lg font-semibold text-ink">{product.name}</h3>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-ink">{formatMoney(product.salesPrice)} <span className="text-sm font-normal text-muted">per unit</span></p>
                {product.variants.length > 0 && <ul className="mt-4 space-y-2 border-t border-primary/10 pt-4 text-sm">{product.variants.map((variant) => <li key={variant.id} className="flex justify-between gap-3"><span className="text-muted">{variant.attribute}: {variant.value}</span><span className="shrink-0 font-medium text-ink">{formatMoney(variant.finalPrice)}</span></li>)}</ul>}
                <p className="mt-4 text-xs text-muted">Prices before taxes.</p>
              </Card>
            ))}</div> : <Card><EmptyState title={q ? 'No matching products' : 'No products available'} description={q ? 'Try another search.' : 'New products will appear here when available.'} /></Card>}
          </section>
        </div>
      )}
    </>
  )
}
