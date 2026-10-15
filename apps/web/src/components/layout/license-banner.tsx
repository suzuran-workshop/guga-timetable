import { AlertTriangle, X } from 'lucide-react'
import { useAppStore } from '../../store/app.js'
import { Button } from '../ui/button.js'

/**
 * 授权状态横幅：非 active 时在页面顶部强提醒（对齐 @homurajs/license 的「每次使用都要强提醒」）。
 * 停服/到期时后端 /api 已 503，这里给出可读文案 + 关闭按钮（仅本次会话）。
 */
export function LicenseBanner() {
  const banner = useAppStore((s) => s.licenseBanner)
  const dismiss = useAppStore((s) => s.dismissBanner)
  const license = useAppStore((s) => s.license)

  if (!banner) return null
  const status = license?.status ?? 'unknown'
  const tone =
    status === 'suspended' || status === 'expired'
      ? 'bg-destructive text-destructive-foreground'
      : 'bg-amber-500 text-white'

  return (
    <div className={`flex items-center gap-2 px-4 py-2 text-sm ${tone}`}>
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">{banner}</span>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-inherit hover:bg-black/10" onClick={dismiss}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
