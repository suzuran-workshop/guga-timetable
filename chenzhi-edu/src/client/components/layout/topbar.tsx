import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun, LogOut, Menu, User as UserIcon, ShieldCheck } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useAppStore } from '../../store/app.js'
import { Button } from '../ui/button.js'
import { Avatar, AvatarFallback } from '../ui/avatar.js'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '../ui/dropdown-menu.js'
import { ROLE_LABEL } from '../../../shared/domain.js'

/** 顶栏：移动端菜单按钮 + 主题切换 + 用户菜单（角色徽标 / 登出）。 */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { theme, setTheme } = useTheme()
  const { user, logout } = useAppStore()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  const initial = (user?.nickname || user?.username || '?').slice(0, 1).toUpperCase()

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="hidden text-sm text-muted-foreground sm:block">
          欢迎回来，{user?.nickname || user?.username}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label="切换主题"
        >
          <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:block">{user?.nickname || user?.username}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">{ROLE_LABEL[user!.role]}</span>
              </div>
              <div className="mt-0.5 text-xs font-normal text-muted-foreground">@{user?.username}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <UserIcon className="mr-2 h-4 w-4" /> 账户设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} disabled={loggingOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" /> 退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
