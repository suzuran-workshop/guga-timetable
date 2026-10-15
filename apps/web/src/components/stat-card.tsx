import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from './ui/card.js'
import { cn } from '../lib/utils.js'

/** 仪表盘统计卡片：图标 + 标题 + 数值 + 可选副文案/趋势。 */
export function StatCard({
  title, value, icon: Icon, hint, trend, className, accent = 'primary',
}: {
  title: string
  value: string | number
  icon: LucideIcon
  hint?: string
  trend?: { value: string; positive?: boolean }
  className?: string
  accent?: 'primary' | 'green' | 'amber' | 'violet' | 'rose' | 'sky'
}) {
  const accents: Record<string, string> = {
    primary: 'bg-primary/12 text-primary',
    green: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  }
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
            {trend && (
              <p className={cn('mt-1.5 text-xs font-medium', trend.positive ? 'text-emerald-600' : 'text-rose-600')}>
                {trend.value}
              </p>
            )}
            {hint && !trend && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', accents[accent])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
