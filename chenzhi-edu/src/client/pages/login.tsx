import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { School, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../store/app.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js'

/**
 * 登录页：密码登录 / 注册双 Tab（@homurajs/auth 的 password provider）。
 * 演示账号提示：admin / chenzhi@2025（种子脚本创建）。
 */
export function LoginPage() {
  const navigate = useNavigate()
  const { login, register, license } = useAppStore()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [busy, setBusy] = useState(false)

  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'chenzhi@2025' })
  const [regForm, setRegForm] = useState({ username: '', password: '', nickname: '' })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginForm.username || !loginForm.password) return toast.error('请输入用户名和密码')
    setBusy(true)
    const res = await login(loginForm.username, loginForm.password)
    setBusy(false)
    if (res.ok) {
      toast.success('登录成功')
      navigate('/', { replace: true })
    } else {
      toast.error(res.message ?? '登录失败')
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regForm.username || !regForm.password) return toast.error('请填写完整')
    if (regForm.password.length < 8) return toast.error('密码至少 8 位')
    setBusy(true)
    const res = await register(regForm.username, regForm.password, regForm.nickname || undefined)
    setBusy(false)
    if (res.ok) {
      toast.success('注册成功，已自动登录')
      navigate('/', { replace: true })
    } else {
      toast.error(res.message ?? '注册失败')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        {/* 品牌区 */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <School className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">辰知教务</h1>
          <p className="mt-1 text-sm text-muted-foreground">教务管理系统 · Academic Suite</p>
        </div>

        <Card className="shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">账户登录</CardTitle>
            <CardDescription>使用教务账号登录系统</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">登录</TabsTrigger>
                <TabsTrigger value="register">注册</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">用户名</Label>
                    <Input
                      id="username"
                      value={loginForm.username}
                      onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                      placeholder="请输入用户名"
                      autoComplete="username"
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">密码</Label>
                    <Input
                      id="password"
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="请输入密码"
                      autoComplete="current-password"
                      disabled={busy}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    登录
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register" className="mt-4">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">用户名</Label>
                    <Input
                      id="reg-username"
                      value={regForm.username}
                      onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                      placeholder="至少 3 位"
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-nickname">昵称（选填）</Label>
                    <Input
                      id="reg-nickname"
                      value={regForm.nickname}
                      onChange={(e) => setRegForm({ ...regForm, nickname: e.target.value })}
                      placeholder="显示名称"
                      disabled={busy}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">密码</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      placeholder="至少 8 位"
                      autoComplete="new-password"
                      disabled={busy}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    注册并登录
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    新注册账户默认「只读」角色，需管理员在设置中提升权限
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* 演示提示 + 授权状态 */}
        <div className="mt-6 space-y-2 text-center">
          <div className="rounded-lg border border-dashed border-border bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">
              演示账号：<span className="font-mono font-medium text-foreground">admin</span> / <span className="font-mono font-medium text-foreground">chenzhi@2025</span>
            </p>
          </div>
          {license && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              授权状态：
              <span className={license.status === 'active' ? 'font-medium text-emerald-600' : 'font-medium text-amber-600'}>
                {license.status === 'active' ? '正常' : license.status}
              </span>
              {license.signature === 'verified' && <span className="text-emerald-600">· 已验签</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
