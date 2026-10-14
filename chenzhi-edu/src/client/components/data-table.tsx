import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table.js'
import { Skeleton } from './ui/skeleton.js'
import { cn } from '../lib/utils.js'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  className?: string
  headClassName?: string
}

/**
 * 通用数据表格：列定义 + 加载骨架 + 空态。
 * rowKey 用于 React key；onRowClick 可选（整行可点）。
 */
export function DataTable<T>({
  columns, rows, rowKey, loading, empty = '暂无数据', onRowClick, skeletonRows = 5,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  empty?: ReactNode
  onRowClick?: (row: T) => void
  skeletonRows?: number
}) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-lg border border-border p-4">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
        <Inbox className="h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            {columns.map((col) => (
              <TableHead key={col.key} className={cn('font-semibold', col.headClassName)}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(onRowClick && 'cursor-pointer')}
            >
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
