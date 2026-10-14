import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

/**
 * 主题：next-themes 管理 light/dark/system，在 <html> 挂 .dark（配合 Tailwind darkMode:class）。
 * 持久化到 localStorage（next-themes 默认）。
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="chenzhi-theme"
    >
      {children}
    </ThemeProvider>
  )
}
