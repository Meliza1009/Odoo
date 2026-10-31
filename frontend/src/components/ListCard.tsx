import type { ReactNode } from 'react'
import type { Paged } from '../types'
import { Card, DataTable, Pagination, SearchInput, type Column } from './ui'

interface PagedListState<T> {
  data: Paged<T> | null
  loading: boolean
  error: string | null
  reload: () => void
  page: number
  setPage: (page: number) => void
  search: string
  setSearch: (value: string) => void
}

interface ListCardProps<T> {
  list: PagedListState<T>
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  searchPlaceholder?: string
  /** Extra filters rendered next to the search box. */
  filters?: ReactNode
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  footer?: ReactNode
}

export function ListCard<T>({ list, columns, rowKey, searchPlaceholder = 'Search', filters, onRowClick, emptyTitle, emptyDescription, emptyAction, footer }: ListCardProps<T>) {
  const filtering = !!list.search.trim()
  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-slate-900/[0.06] px-5 py-3.5 lg:flex-row lg:items-center">
        <SearchInput className="w-full lg:max-w-xs" placeholder={searchPlaceholder} aria-label={searchPlaceholder} value={list.search} onChange={(e) => list.setSearch(e.target.value)} />
        {filters && <div className="flex flex-wrap items-center gap-3">{filters}</div>}
      </div>
      <DataTable
        columns={columns}
        rows={list.data?.data ?? null}
        rowKey={rowKey}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={onRowClick}
        emptyTitle={filtering ? 'No matches' : emptyTitle}
        emptyDescription={filtering ? 'Try a different search or clear the filters.' : emptyDescription}
        emptyAction={filtering ? undefined : emptyAction}
      />
      {list.data && list.data.total > 0 && <Pagination page={list.page} totalPages={list.data.totalPages} total={list.data.total} onPageChange={list.setPage} />}
      {footer}
    </Card>
  )
}
