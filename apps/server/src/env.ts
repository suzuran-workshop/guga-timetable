import { applyEnvFile, defineConfig, parses, resolveConfigFilePath } from '@homurajs/core'

/**
 * 类型安全的配置装载（@homurajs/core）——「配置即文档」。
 *
 * 流程：applyEnvFile() 把 homura.config.env 并入 process.env（真实 env 优先），
 * 再由 defineConfig().load() 解析 + 校验。任何缺失的必填项在此 fail-fast。
 */
export const config = defineConfig({
  // 运行形态与监听
  runtime: { env: 'HOMURA_RUNTIME', default: 'auto', parse: parses.string, description: '运行形态 standalone|qw-pages|auto' },
  port: { env: 'PORT', default: 8787, parse: parses.int, description: '监听端口' },
  host: { env: 'HOST', default: '127.0.0.1', parse: parses.string, description: '监听地址' },
  trustProxy: { env: 'TRUST_PROXY', default: false, parse: parses.boolean, description: '是否位于反向代理后' },

  // 持久层（@homurajs/db）
  dbPath: { env: 'DB_PATH', default: 'data/guga.db', parse: parses.string, description: 'sqlite 文件路径或 :memory:' },
  databaseUrl: { env: 'DATABASE_URL', default: '', parse: parses.string, description: 'postgres 连接串（留空则用 sqlite）' },

  // 认证（@homurajs/auth）
  authSecret: { env: 'AUTH_SECRET', required: true, secret: true, parse: parses.string, description: 'HS256 会话密钥（>=32 字节）' },
  accessTokenTtlSec: { env: 'ACCESS_TOKEN_TTL_SEC', default: 900, parse: parses.int, description: 'access token 有效期（秒）' },
  refreshTokenTtlSec: { env: 'REFRESH_TOKEN_TTL_SEC', default: 604800, parse: parses.int, description: 'refresh token 有效期（秒）' },
  allowRegister: { env: 'ALLOW_REGISTER', default: true, parse: parses.boolean, description: '是否开放自助注册' },

  // 授权（@homurajs/license）
  licenseEnabled: { env: 'LICENSE_ENABLED', default: true, parse: parses.boolean, description: '是否启用授权守卫' },
  genuineServer: { env: 'GENUINE_SERVER', default: 'http://127.0.0.1:8790', parse: parses.string, description: 'genuine 授权中心地址' },
  genuineProductId: { env: 'GENUINE_PRODUCT_ID', default: 'guga-timetable', parse: parses.string, description: '产品标识' },
  genuineAppId: { env: 'GENUINE_APP_ID', default: 'guga-timetable-app', parse: parses.string, description: '应用标识' },
  genuineLicenseKey: { env: 'GENUINE_LICENSE_KEY', default: '', parse: parses.string, description: '许可证密钥（可空，由中心自助注册）' },
  genuinePublicKey: { env: 'GENUINE_PUBLIC_KEY', default: '', secret: true, parse: parses.string, description: '中心 Ed25519 公钥 PEM（配了才验签）' },

  // 对象存储（@homurajs/storage）
  storageDir: { env: 'STORAGE_DIR', default: 'data/storage', parse: parses.string, description: '本地对象存储根目录' },

  // 日志（@homurajs/core）
  logLevel: { env: 'LOG_LEVEL', default: 'info', parse: parses.string, description: '日志级别 debug|info|warn|error' },

  // 演示种子账号
  seedAdminUsername: { env: 'SEED_ADMIN_USERNAME', default: 'admin', parse: parses.string, description: '种子管理员用户名' },
  seedAdminPassword: { env: 'SEED_ADMIN_PASSWORD', default: 'guga@2025', secret: true, parse: parses.string, description: '种子管理员密码' },
  seedAdminNickname: { env: 'SEED_ADMIN_NICKNAME', default: '教务管理员', parse: parses.string, description: '种子管理员昵称' },
})

export type AppConfig = ReturnType<typeof config.load>

/**
 * 装载配置：先并入部署期配置文件，再解析校验。
 * 供 server 启动与 scripts/* 共用。
 */
export function loadConfig(): AppConfig {
  const resolved = resolveConfigFilePath(process.env)
  applyEnvFile(process.env)
  const cfg = config.load()

  // 生产环境必须覆盖 dev 缺省密钥（core README 的 assertSecretsOverridden 精神）
  const isProd = process.env.NODE_ENV === 'production'
  if (isProd && cfg.get('authSecret').includes('dev-only-change-me')) {
    throw new Error('生产环境必须覆盖 AUTH_SECRET（当前仍是开发缺省值）')
  }
  // HS256 密钥强度校验（SessionManager 要求 >=32 字节，提前给出可读错误）
  if (cfg.get('authSecret').length < 32) {
    throw new Error(`AUTH_SECRET 至少 32 字节（当前 ${cfg.get('authSecret').length}）`)
  }
  return cfg
}

/** help() 生成 .env.example 片段——配置即文档 */
export function configHelp(): string {
  return config.help()
}

/** 暴露解析出的配置文件路径（启动日志用） */
export { resolveConfigFilePath }
