import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { EmptyState, ErrorState } from './Feedback'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
  /** Hide on small screens to keep tables readable on mobile. */
  hideOnMobile?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[] | null
  rowKey: (row: T) => string | number
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  onRowClick?: (row: T) => void
}

const cell = (col: { hideOnMobile?: boolean; className?: string }) => `px-4 first:pl-5 last:pr-5 ${col.hideOnMobile ? 'hidden md:table-cell' : ''} ${col.className ?? ''}`

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  onRowClick,
}: DataTableProps<T>) {
  if (error)
    return (
      <ErrorState
        description={error}
        action={
          onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          )
        }
      />
    )
  if (!loading && (!rows || rows.length === 0)) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-900/[0.06] bg-slate-50/70">
            {columns.map((col) => (
              <th key={col.key} scope="col" className={`py-2.5 text-left text-xs font-medium text-muted ${cell(col)}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`divide-y divide-slate-900/[0.05] transition-opacity duration-200 ${loading && rows ? 'opacity-50' : ''}`}>
          {!rows
            ? [0, 1, 2, 3, 4].map((i) => (
                <tr key={i} aria-hidden="true">
                  {columns.map((col, c) => (
                    <td key={col.key} className={`py-3.5 ${cell(col)}`}>
                      <div className="skeleton h-4" style={{ width: c === 0 ? '70%' : `${45 + ((i + c) % 3) * 15}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick && (() => onRowClick(row))}
                  className={onRowClick ? 'cursor-pointer transition-colors duration-150 hover:bg-slate-50/90' : ''}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`py-3 align-middle text-slate-700 ${cell(col)}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  )
}

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-900/[0.06] px-5 py-3 text-[13px] text-muted">
      <span className="tabular-nums">
        {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-1.5">
        <Button variant="ghost" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <CaretLeftIcon className="h-4 w-4" />
        </Button>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          <CaretRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
