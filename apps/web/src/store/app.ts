import { create } from 'zustand'
import { api, setAuthHooks } from '../lib/api.js'
import type { SessionUser, Permission, LicenseStateDto } from '../../shared/domain.js'
import { can } from '../../shared/domain.js'

/**
 * 全局会话状态（zustand）。
 *
 * - user: 当前 SessionUser（含 role + permissions），null = 未登录
 * - license: 授权状态（横幅展示）
 * - bootstrapped: 是否已尝试拉取 /api/users/me（避免路由守卫闪烁）
 *
 * 401/503 通过 api 客户端的 hooks 回流到本 store（登出 / 显示停服横幅）。
 */
interface AppState {
  user: SessionUser | null
  license: LicenseStateDto | null
  bootstrapped: boolean
  licenseBanner: string | null

  bootstrap: () => Promise<void>
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>
  register: (username: string, password: string, nickname?: string) => Promise<{ ok: boolean; message?: string }>
  logout: () => Promise<void>
  refreshLicense: () => Promise<void>
  dismissBanner: () => void
  can: (perm: Permission) => boolean
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  license: null,
  bootstrapped: false,
  licenseBanner: null,

  async bootstrap() {
    setAuthHooks({
      onUnauthorized: () => set({ user: null }),
      onLicenseSuspended: (msg) => set({ licenseBanner: msg }),
    })
    // 拉取授权状态（守卫豁免路径，未登录也可读）
    get().refreshLicense().catch(() => {})
    // 拉取当前用户（可能 401 → user=null）
    try {
      const { user } = await api.get<{ user: SessionUser }>('/api/users/me')
      set({ user, bootstrapped: true })
    } catch {
      set({ user: null, bootstrapped: true })
    }
  },

  async refreshLicense() {
    try {
      const license = await api.get<LicenseStateDto>('/_license')
      set({ license })
      // 非 active 且有 notice → 横幅
      if (license.status !== 'active' && license.status !== 'disabled' && license.notice) {
        set({ licenseBanner: license.notice })
      }
    } catch {
      // 忽略（开发环境可能未启用 license）
    }
  },

  async login(username, password) {
    try {
      const res = await fetch('/auth/password/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return { ok: false, message: body?.message ?? '登录失败' }
      }
      // 登录成功 → 拉取完整 user
      const { user } = await api.get<{ user: SessionUser }>('/api/users/me')
      set({ user })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  },

  async register(username, password, nickname) {
    try {
      const res = await fetch('/auth/password/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, nickname }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        return { ok: false, message: body?.message ?? '注册失败' }
      }
      const { user } = await api.get<{ user: SessionUser }>('/api/users/me')
      set({ user })
      return { ok: true }
    } catch (e) {
      return { ok: false, message: (e as Error).message }
    }
  },

  async logout() {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    } catch { /* 忽略 */ }
    set({ user: null })
  },

  dismissBanner() {
    set({ licenseBanner: null })
  },

  can(perm) {
    const user = get().user
    return can(user?.role, perm)
  },
}))
