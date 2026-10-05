// App.tsx 应用外壳：登录门禁 + 侧边导航 + 路由。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bot,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldAlert,
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
import System from './pages/System'

const NAV = [
  { to: '/', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/accounts', label: '账号管理', icon: UsersRound },
  { to: '/stats', label: '请求统计', icon: BarChart3 },
  { to: '/login', label: '添加账号', icon: CircleUserRound },
  { to: '/playground', label: '聊天测试', icon: Bot },
  { to: '/config', label: '网关配置', icon: Settings2 },
  { to: '/system', label: '系统', icon: Wrench },
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
      // 会话接口失败（后端未起来）也要结束 loading，否则页面永久空白。
      setSession(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  // 任何接口返回 401 时统一回到登录页，避免用户在坏会话里反复点。
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setSession((prev) => (prev ? { ...prev, authenticated: false } : prev))
      setBanner('会话已过期，请重新登录')
      navigate('/')
    })
  }, [navigate])

  const handleLoggedOut = useCallback(async () => {
    await api.logout().catch(() => undefined)
    setSession((s) => (s ? { ...s, authenticated: false, username: '' } : s))
  }, [])

  if (loading) {
    return (
      <div className="login-wrap">
        <Spinner label="正在连接服务…" />
      </div>
    )
  }

  if (!session?.authenticated) {
    return <Login info={session} banner={banner} onCloseBanner={() => setBanner(null)} onSuccess={refreshSession} />
  }

  return (
    <Shell session={session} onLogout={handleLoggedOut} onSessionRefresh={refreshSession} />
  )
}

function Shell({
  session,
  onLogout,
  onSessionRefresh,
}: {
  session: SessionInfo
  onLogout: () => void
  onSessionRefresh: () => Promise<SessionInfo | null>
}) {
  const warnings = useMemo(() => {
    const list: string[] = []
    if (session.using_default_password) {
      list.push('面板正在使用默认口令（admin / workbuddy），建议在服务端配置中修改 ui.password')
    }
    if (session.read_only) {
      list.push('服务端处于只读模式：登录、签到、改配置等写操作全部禁用')
    }
    return list
  }, [session])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot">WB</div>
          <div className="brand-text">
            <strong>WorkBuddy 控制台</strong>
            <span>workbuddy2api gateway</span>
          </div>
        </div>
        <div className="nav-section">工作区</div>
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              {item.label}
            </NavLink>
          )
        })}
        <div className="nav-spacer" />
        <div className="nav-foot">
          <div className="gateway-url">网关：{session.gateway_url}</div>
          <div className="account-line">
            <span>
              <span style={{ color: '#8ca7ac' }}>身份：</span>
              {session.username}
            </span>
            {session.read_only ? (
              <span className="badge badge-warn">只读</span>
            ) : session.dangerous_ops ? (
              <span className="badge badge-warn">高危已解锁</span>
            ) : (
              <span className="badge badge-dim">受保护</span>
            )}
          </div>
          <button className="btn btn-sm" onClick={onLogout}>
            <LogOut size={13} aria-hidden="true" />
            退出登录
          </button>
        </div>
      </aside>

      <main className="main">
        {warnings.map((w) => (
          <Alert key={w} kind="warn">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <ShieldAlert size={15} aria-hidden="true" />
              {w}
            </span>
          </Alert>
        ))}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts session={session} />} />
          <Route path="/stats" element={<StatsPage session={session} />} />
          <Route path="/login" element={<LoginWizard session={session} onDone={onSessionRefresh} />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/config" element={<ConfigPage session={session} />} />
          <Route path="/system" element={<System session={session} onSessionRefresh={onSessionRefresh} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
