import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 生成 genuine 授权中心的 Ed25519 密钥对（开发/演示用）。
 *
 * @homurajs/license 用中心公钥验签 SignedEntitlement（Ed25519 over canonicalize(entitlement)）。
 * 本脚本产出：
 *   - tools/.keys/private.pem  （genuine-mock 签名用，勿泄露）
 *   - tools/.keys/public.pem   （配 GENUINE_PUBLIC_KEY，消费侧验签用）
 *
 * 生产环境应由供应方在受控环境生成并妥善保管私钥。
 */
const dir = resolve('tools/.keys')
mkdirSync(dir, { recursive: true })
const privPath = resolve(dir, 'private.pem')
const pubPath = resolve(dir, 'public.pem')

if (existsSync(privPath) && existsSync(pubPath)) {
  console.log('密钥已存在，跳过生成：', privPath)
  console.log('如需重新生成，请先删除 tools/.keys/ 目录。')
  process.exit(0)
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
const pubPem = publicKey.export({ type: 'spki', format: 'pem' }) as string

writeFileSync(privPath, privPem)
writeFileSync(pubPath, pubPem)

// 打印规范化后的公钥（去尾随换行），可直接粘进 GENUINE_PUBLIC_KEY
const { keyIdOf } = await import('@homurajs/license/contract')
console.log('✅ Ed25519 密钥对已生成')
console.log('  私钥:', privPath, '（genuine-mock 用，勿提交到公开仓库）')
console.log('  公钥:', pubPath)
console.log('  keyId:', keyIdOf(pubPem))
console.log('\n把下面这行公钥配到 homura.config.env 的 GENUINE_PUBLIC_KEY（单行，PEM 用 \\n 转义）：')
console.log(JSON.stringify(pubPem.trim()))
