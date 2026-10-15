import { Hono } from 'hono'
import type { LicenseClient } from '@homurajs/license'
import type { LicenseStateDto } from '@guga/shared'

/**
 * 授权状态路由（前端横幅展示用）。
 *
 * LICENSE_STATUS_PATH = '/_license' 在 license 守卫的豁免清单里，
 * 即使 enforcement=all 全站 503，前端仍能读到这里问「为什么被停」。
 * 这里同时挂 /api/license（业务路由内）与根 /_license（守卫豁免），二者同源。
 */
export function licenseRoutes(client: LicenseClient | null): Hono {
  const app = new Hono()

  const read = (): LicenseStateDto => {
    if (!client) {
      return { status: 'disabled', enforcement: 'none', notice: null, features: [], expiresAt: null, signature: 'absent' }
    }
    const ent = client.getEntitlement()
    return {
      status: client.getStatus(),
      enforcement: client.getEnforcement(),
      notice: client.getNotice(),
      features: ent?.features ?? [],
      expiresAt: ent?.expiresAt ?? null,
      signature: client.getSignatureState().kind,
    }
  }

  app.get('/', (c) => c.json(read()))
  app.get('/status', (c) => c.json(read()))

  return app
}
