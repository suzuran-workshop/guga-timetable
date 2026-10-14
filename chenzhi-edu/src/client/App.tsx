import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAppStore } from './store/app.js'
import { AppLayout } from './components/layout/app-layout.js'
import { LoginPage } from './pages/login.js'
import { DashboardPage } from './pages/dashboard.js'
import { StudentsPage } from './pages/students.js'
import { StudentDetailPage } from './pages/student-detail.js'
import { TeachersPage } from './pages/teachers.js'
import { CoursesPage } from './pages/courses.js'
import { ClassesPage } from './pages/classes.js'
import { ClassDetailPage } from './pages/class-detail.js'
import { TimetablePage } from './pages/timetable.js'
import { ScheduleAdjustPage } from './pages/schedule-adjust.js'
import { AutoSchedulePage } from './pages/auto-schedule.js'
import { AttendancePage } from './pages/attendance.js'
import { GradesPage } from './pages/grades.js'
import { OrdersPage } from './pages/orders.js'
import { FilesPage } from './pages/files.js'
import { SettingsPage } from './pages/settings.js'
import { LicenseBanner } from './components/layout/license-banner.js'
import { Skeleton } from './components/ui/skeleton.js'

/**
 * 应用根：bootstrap 会话 → 未登录跳 /login，已登录进 AppLayout 保护壳。
 * AppLayout 内含侧边导航 + 顶栏 + <Outlet/>（子页面）。
 */
export function App() {
  const { user, bootstrapped, bootstrap } = useAppStore()
  const location = useLocation()

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // bootstrap 未完成 → 骨架屏
  if (!bootstrapped) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-4 p-8">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  const isLogin = location.pathname === '/login'

  // 未登录：除 /login 外全部重定向
  if (!user) {
    return (
      <>
        <LicenseBanner />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
    )
  }

  // 已登录访问 /login → 回首页
  if (isLogin) return <Navigate to="/" replace />

  return (
    <>
      <LicenseBanner />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:id" element={<StudentDetailPage />} />
          <Route path="/teachers" element={<TeachersPage />} />
          <Route path="/courses" element={<CoursesPage />} />
          <Route path="/classes" element={<ClassesPage />} />
          <Route path="/classes/:id" element={<ClassDetailPage />} />
          <Route path="/timetable" element={<TimetablePage />} />
          <Route path="/schedule-adjust" element={<ScheduleAdjustPage />} />
          <Route path="/auto-schedule" element={<AutoSchedulePage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/grades" element={<GradesPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/library" element={<FilesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  )
}
