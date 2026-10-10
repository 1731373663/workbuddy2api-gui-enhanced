import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bot,
  ChevronRight,
  CircleUserRound,
  Gauge,
  LogOut,
  Server,
  ShieldAlert,
  SlidersHorizontal,
  UsersRound,
  Wrench,
} from 'lucide-react'
import { api, setUnauthorizedHandler } from './api'
import type { SessionInfo } from './types'
import { Alert, Spinner } from './ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import StatsPage from './pages/StatsPage'
import Accounts from './pages/Accounts'
import LoginWizard from './pages/LoginWizard'
import Playground from './pages/Playground'
import ConfigPage from './pages/ConfigPage'
import Providers from './pages/Providers'
import System from './pages/System'

const NAV = [
  { to: '/', label: '仪表盘', detail: '账号池概览', icon: Gauge, end: true },
  { to: '/accounts', label: '账号', detail: '管理与批处理', icon: UsersRound },
  { to: '/stats', label: '统计', detail: '请求与费用', icon: BarChart3 },
  { to: '/login', label: '添加账号', detail: 'OAuth 登录', icon: CircleUserRound },
  { to: '/playground', label: '聊天测试', detail: '接口验证', icon: Bot },
  { to: '/providers', label: '供应商', detail: '第三方模型接入', icon: Server },
  { to: '/config', label: '配置', detail: 'gateway.json', icon: SlidersHorizontal },
  { to: '/system', label: '系统', detail: '容器与运行状态', icon: Wrench },
]

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const navigate = useNavigate()

  const refreshSession = useCallback(async () => {
    try {
      const s = await api.session()
      setSession(s)
      return s
    } catch {
      setSession(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refreshSession() }, [refreshSession])

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSession((prev) => (prev ? { ...prev, authenticated: false } : prev))
      setBanner('登录状态已失效，请重新登录')
      navigate('/')
    })
  }, [navigate])

  const handleLoggedOut = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setSession((s) => (s ? { ...s, authenticated: false, username: '' } : s))
  }, [])

  if (loading) {
    return <div className="login-wrap"><Spinner label="正在连接服务…" /></div>
  }

  if (!session?.authenticated) {
    return <Login info={session} banner={banner} onCloseBanner={() => setBanner(null)} onSuccess={refreshSession} />
  }

  return <Shell session={session} onLogout={handleLoggedOut} onSessionRefresh={refreshSession} />
}

function Shell({ session, onLogout, onSessionRefresh }: { session: SessionInfo; onLogout: () => void; onSessionRefresh: () => Promise<SessionInfo | null> }) {
  const warnings = useMemo(() => {
    const list: string[] = []
    if (session.using_default_password) list.push('当前仍使用默认口令，建议在服务端配置中更换。')
    if (session.read_only) list.push('服务端已开启只读模式，写操作暂不可用。')
    return list
  }, [session])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot">WB</div>
          <div className="brand-text">
            <strong>WorkBuddy</strong>
            <span>Gateway Console</span>
          </div>
        </div>

        <div className="nav-section">工作区</div>
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span className="nav-copy"><strong>{item.label}</strong><small>{item.detail}</small></span>
              <ChevronRight className="nav-chevron" size={15} aria-hidden="true" />
            </NavLink>
          )
        })}

        <div className="nav-spacer" />
        <div className="nav-foot">
          <div className="gateway-url">{session.gateway_url}</div>
          <div className="account-line">
            <span>{session.username || 'admin'}</span>
            {session.read_only ? <span className="badge badge-warn">只读</span> : session.dangerous_ops ? <span className="badge badge-warn">高危已解锁</span> : <span className="badge badge-dim">受保护</span>}
          </div>
          <button className="btn btn-sm" onClick={onLogout}><LogOut size={14} aria-hidden="true" />退出登录</button>
        </div>
      </aside>

      <main className="main">
        {warnings.map((w) => <Alert key={w} kind="warn"><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><ShieldAlert size={16} aria-hidden="true" />{w}</span></Alert>)}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts session={session} />} />
          <Route path="/stats" element={<StatsPage session={session} />} />
          <Route path="/login" element={<LoginWizard session={session} onDone={onSessionRefresh} />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/providers" element={<Providers session={session} />} />
          <Route path="/config" element={<ConfigPage session={session} />} />
          <Route path="/system" element={<System session={session} onSessionRefresh={onSessionRefresh} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}