import { toast } from 'sonner'
import type { ApiError } from '../../shared/domain.js'

/**
 * 前端 API 客户端。
 *
 * 统一处理：cookie 凭证、JSON 编解码、401 自动 refresh 重试、授权 503 横幅、错误 toast。
 * 后端会话用 httpOnly cookie（@homurajs/auth），故 credentials: 'include'。
 */

const BASE = '' // 同源（dev 走 vite proxy，prod 同进程托管）

let onUnauthorized: (() => void) | null = null
let onLicenseSuspended: ((msg: string) => void) | null = null

export function setAuthHooks(hooks: {
  onUnauthorized?: () => void
  onLicenseSuspended?: (msg: string) => void
}) {
  onUnauthorized = hooks.onUnauthorized ?? null
  onLicenseSuspended = hooks.onLicenseSuspended ?? null
}

export class ApiClientError extends Error {
  constructor(public status: number, public body: ApiError | null, message: string) {
    super(message)
  }
}

async function request<T>(method: string, path: string, opts?: { body?: unknown; raw?: boolean }): Promise<T> {
  const url = `${BASE}${path}`
  const init: RequestInit = { method, credentials: 'include' }
  if (opts?.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(opts.body)
  }

  let res = await fetch(url, init)

  // 401 → 尝试 refresh 一次（access 过期但 refresh 有效）
  if (res.status === 401 && !opts?.raw) {
    const refreshed = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (refreshed.ok) {
      res = await fetch(url, init) // 重放原请求
    } else {
      onUnauthorized?.()
    }
  }

  // 授权停服：503 + license_* → 全局横幅
  if (res.status === 503) {
    const body = (await res.clone().json().catch(() => null)) as ApiError | null
    const msg = body?.message ?? '服务授权受限'
    if (body?.error === 'service_suspended' || body?.error === 'license_expired') {
      onLicenseSuspended?.(msg)
    }
    throw new ApiClientError(503, body, msg)
  }

  if (!res.ok) {
    const body = (await res.clone().json().catch(() => null)) as ApiError | null
    const msg = body?.message ?? body?.error ?? `请求失败 (${res.status})`
    if (res.status === 401) onUnauthorized?.()
    throw new ApiClientError(res.status, body, msg)
  }

  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string) => request<T>('DELETE', path),

  /** 文件上传（multipart） */
  async upload(path: string, file: File): Promise<any> {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${BASE}${path}`, { method: 'POST', credentials: 'include', body: form })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ApiError | null
      throw new ApiClientError(res.status, body, body?.message ?? '上传失败')
    }
    return res.json()
  },
}

/** 把 URL 参数对象拼成 query string（跳过 undefined/null/空） */
export function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    u.set(k, String(v))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

/** 统一错误提示（业务组件 catch 后调用） */
export function toastError(e: unknown) {
  const msg = e instanceof ApiClientError ? e.message : (e as Error)?.message ?? '未知错误'
  toast.error(msg)
}
