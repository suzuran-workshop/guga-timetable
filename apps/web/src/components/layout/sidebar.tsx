import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, GraduationCap, BookOpen, Layers, CalendarDays,
  ClipboardCheck, Award, Receipt, FolderOpen, Settings, School, ArrowLeftRight, Sparkles,
} from 'lucide-react'
import { cn } from '../../lib/utils.js'
import { useAppStore } from '../../store/app.js'
import type { Permission } from '../../../shared/domain.js'
import { ScrollArea } from '../ui/scroll-area.js'

interface NavItem {
  to: string
  label: string
  icon: typeof Users
  perm?: Permission
  group: string
}

/** 侧边导航定义（按教务业务分组），perm 缺省 = 所有登录用户可见。 */
const NAV: NavItem[] = [
  { to: '/', label: '工作台', icon: LayoutDashboard, perm: 'dashboard:read', group: '概览' },
  { to: '/timetable', label: '课表', icon: CalendarDays, perm: 'schedule:read', group: '教学' },
  { to: '/schedule-adjust', label: '调换课', icon: ArrowLeftRight, perm: 'schedule:read', group: '教学' },
  { to: '/auto-schedule', label: '自动派课', icon: Sparkles, perm: 'schedule:write', group: '教学' },
  { to: '/classes', label: '班级管理', icon: Layers, perm: 'class:read', group: '教学' },
  { to: '/courses', label: '课程管理', icon: BookOpen, perm: 'course:read', group: '教学' },
  { to: '/attendance', label: '考勤点名', icon: ClipboardCheck, perm: 'attendance:read', group: '教学' },
  { to: '/students', label: '学员管理', icon: Users, perm: 'student:read', group: '人员' },
  { to: '/teachers', label: '教师管理', icon: GraduationCap, perm: 'teacher:read', group: '人员' },
  { to: '/grades', label: '成绩管理', icon: Award, perm: 'grade:read', group: '教务' },
  { to: '/orders', label: '收费订单', icon: Receipt, perm: 'order:read', group: '教务' },
  { to: '/library', label: '资料库', icon: FolderOpen, perm: 'file:read', group: '系统' },
  { to: '/settings', label: '系统设置', icon: Settings, perm: 'setting:write', group: '系统' },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const can = useAppStore((s) => s.can)
  const groups = Array.from(new Set(NAV.map((n) => n.group)))
  const visible = (item: NavItem) => !item.perm || can(item.perm)

  return (
    <div className="flex h-full flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <School className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">辰知教务</div>
          <div className="text-[11px] text-muted-foreground">Academic Suite</div>
        </div>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        {groups.map((g) => {
          const items = NAV.filter((n) => n.group === g && visible(n))
          if (!items.length) return null
          return (
            <div key={g} className="mb-5">
              <div className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {g}
              </div>
              <nav className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-foreground',
                      )
                    }
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          )
        })}
      </ScrollArea>
    </div>
  )
}
