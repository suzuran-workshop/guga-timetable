import { readFileSync, writeFileSync } from 'node:fs'

/**
 * 生成开发用 homura.config.env：从 example 复制，注入 Ed25519 公钥（转义为单行）。
 * parseEnvFile 的双引号分支解析 \\n，故公钥写成 "-----BEGIN...\\n...\\n-----END PUBLIC KEY-----"。
 */
const pub = readFileSync('tools/.keys/public.pem', 'utf8').trim()
const escaped = '"' + pub.replace(/\n/g, '\\n') + '"'

let cfg = readFileSync('homura.config.env.example', 'utf8')
cfg = cfg.replace(/^GENUINE_PUBLIC_KEY=.*$/m, 'GENUINE_PUBLIC_KEY=' + escaped)
// 本机 8787 被其他 homura-genuine 服务占用，API 改用 8799（与 vite proxy 一致）
cfg = cfg.replace(/^PORT=.*$/m, 'PORT=8799')
writeFileSync('homura.config.env', cfg)

// 自检：解析后公钥应为多行 PEM
const { parseEnvFile } = await import('@homurajs/core')
const parsed = parseEnvFile(cfg)
console.log('✅ homura.config.env 已生成')
console.log('   公钥行数:', parsed.GENUINE_PUBLIC_KEY.split('\n').length)
console.log('   公钥首行:', parsed.GENUINE_PUBLIC_KEY.split('\n')[0])
