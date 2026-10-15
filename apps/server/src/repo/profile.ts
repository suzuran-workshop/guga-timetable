import { eq } from 'drizzle-orm'
import type { DbBundle } from '../db/index.js'
import { Repository } from '../repo/base.js'
import type { Permission, Role, SessionUser } from '@guga/shared'
import { permissionsOf } from '@guga/shared'

/**
 * 用户档案仓储：把 @homurajs/auth 的 session claims（sub=userId）
 * 扩展为教务系统的 SessionUser（含 role + permissions）。
 *
 * auth 的 users 表存身份（username/nickname/avatar），profiles 表存角色。
 * 注册时若无 profile，按缺省角色建档（首个用户自动提升为 admin，见 ensureBootstrapAdmin）。
 */
export class ProfileRepo extends Repository {
  constructor(b: DbBundle) { super(b) }

  private toSessionUser(userRow: any, profileRow: any): SessionUser {
    const role = (profileRow?.role ?? 'viewer') as Role
    return {
      id: userRow.id,
      username: userRow.username ?? null,
      nickname: userRow.nickname ?? null,
      avatarUrl: userRow.avatarUrl ?? null,
      role,
      permissions: permissionsOf(role) as Permission[],
    }
  }

  /** 由 auth 的 userId（session.sub）解析完整 SessionUser */
  async resolveSessionUser(userId: string): Promise<SessionUser | null> {
    const t = this.t
    // authUsers 来自 @homurajs/auth/tables（身份锚点：username/nickname/avatar），按方言选取
    const userRows = await this.db.select().from(t.authUsers).where(eq(t.authUsers.id, userId)).limit(1)
    const user = userRows[0]
    if (!user) return null
    const profileRows = await this.db.select().from(t.profiles).where(eq(t.profiles.userId, userId)).limit(1)
    return this.toSessionUser(user, profileRows[0])
  }

  async getRole(userId: string): Promise<Role> {
    const rows = await this.db.select().from(this.t.profiles).where(eq(this.t.profiles.userId, userId)).limit(1)
    return (rows[0]?.role ?? 'viewer') as Role
  }

  async upsertProfile(userId: string, data: { role?: Role; realName?: string; phone?: string; teacherId?: string }): Promise<void> {
    const t = this.t
    const existing = await this.db.select().from(t.profiles).where(eq(t.profiles.userId, userId)).limit(1)
    if (existing[0]) {
      await this.db.update(t.profiles).set({ ...data, updatedAt: this.now() }).where(eq(t.profiles.userId, userId))
    } else {
      await this.db.insert(t.profiles).values({
        userId, role: data.role ?? 'viewer', realName: data.realName ?? null,
        phone: data.phone ?? null, teacherId: data.teacherId ?? null,
        createdAt: this.now(), updatedAt: this.now(),
      })
    }
  }

  async listProfiles() {
    const t = this.t
    const rows = await this.db.select().from(t.profiles)
    return rows.map((r: any) => ({ ...r, createdAt: Number(r.createdAt), updatedAt: Number(r.updatedAt) }))
  }
}
