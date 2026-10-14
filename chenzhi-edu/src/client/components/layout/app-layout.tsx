import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar.js'
import { Topbar } from './topbar.js'
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet.js'

/**
 * 应用主壳：左侧固定导航（桌面）/ 抽屉导航（移动）+ 顶栏 + 内容区 <Outlet/>。
 */
export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 桌面侧栏 */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <Sidebar />
      </aside>

      {/* 移动抽屉侧栏 */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <span className="sr-only">菜单</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* 主区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[1400px] p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
