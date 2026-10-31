import { PlusIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { api, errorMessage } from '../../api/client'
import { useAuth } from '../../auth/useAuth'
import { ListCard } from '../../components/ListCard'
import { Badge, Button, Checkbox, PageHeader, Select, StatusBadge, useToast, type Column } from '../../components/ui'
import { usePagedList } from '../../hooks/usePagedList'
import { formatMoney, titleCase } from '../../lib/format'
import { PRODUCT_TYPES, type Product } from '../../types'
import { ProductModal } from './ProductModal'

const columns: Column<Product>[] = [
  {
    key: 'name',
    header: 'Product',
    render: (p) => (
      <div>
        <p className="font-medium text-primary">{p.name}</p>
        {p.notes && <p className="max-w-md truncate text-xs text-slate-500">{p.notes}</p>}
      </div>
    ),
  },
  { key: 'type', header: 'Type', render: (p) => <Badge tone="indigo">{titleCase(p.type)}</Badge>, hideOnMobile: true },
  { key: 'variants', header: 'Variants', render: (p) => p.variantCount ?? 0, className: 'text-right', hideOnMobile: true },
  { key: 'cost', header: 'Cost', render: (p) => formatMoney(p.costPrice), className: 'text-right tabular-nums', hideOnMobile: true },
  { key: 'price', header: 'Sales price', render: (p) => formatMoney(p.salesPrice), className: 'text-right tabular-nums' },
  { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.isActive ? 'active' : 'inactive'} />, hideOnMobile: true },
]

export function ProductsPage() {
  const toast = useToast()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const [type, setType] = useState('')
  const [includeInactive, setIncludeInactive] = useState(false)
  const [modal, setModal] = useState<{ product: Product | null } | null>(null)
  const list = usePagedList<Product>('/products', { type, includeInactive })

  const open = async (row: Product) => {
    try {
      const { data } = await api.get<Product>(`/products/${row.id}`)
      setModal({ product: data })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="What you sell, with variant pricing such as brand or support level."
        actions={
          isAdmin && (
            <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setModal({ product: null })}>
              New product
            </Button>
          )
        }
      />
      <ListCard
        list={list}
        columns={columns}
        rowKey={(p) => p.id}
        searchPlaceholder="Search products"
        filters={
          <>
            <Select aria-label="Product type" className="w-40" value={type} onChange={(e) => setType(e.target.value)} options={PRODUCT_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} placeholder="All types" />
            <Checkbox label="Show archived" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          </>
        }
        onRowClick={open}
        emptyTitle="No products yet"
        emptyAction={isAdmin && <Button onClick={() => setModal({ product: null })}>New product</Button>}
      />
      {modal && <ProductModal product={modal.product} canEdit={isAdmin} onClose={() => setModal(null)} onSaved={list.reload} />}
    </>
  )
}
