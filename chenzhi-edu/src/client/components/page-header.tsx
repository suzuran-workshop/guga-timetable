import type { ReactNode } from 'react'
import { cn } from '../lib/utils.js'

/** 页面标题区：标题 + 描述 + 右侧操作区。 */
export function PageHeader({
  title, description, children, className,
}: { title: string; description?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}

/** 区块卡片标题 */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('mb-3 text-sm font-semibold text-muted-foreground', className)}>{children}</h2>
}
