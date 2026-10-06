import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { BarChart3, Bot, ChevronRight, CircleUserRound, Gauge, LogOut, Menu, Search, Settings2, ShieldAlert, UsersRound, Wrench, X } from 'lucide-react'
import { api, setUnauthorizedHandler } from './api'
import type { SessionInfo } from './types'
import { Alert, readThemePreference, setThemePreference, Spinner, ThemePicker, type ThemePreference } from './ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import StatsPage from './pages/StatsPage'
import Accounts from './pages/Accounts'
import LoginWizard from './pages/LoginWizard'
import Playground from './pages/Playground'
import ConfigPage from './pages/ConfigPage'
import System from './pages/System'
const NAV = [
  { to: '/', label: '仪表盘', detail: '账号池概览', icon: Gauge, end: true },
  { to: '/accounts', label: '账号', detail: '管理与批处理', icon: UsersRound },
  { to: '/stats', label: '统计', detail: '请求与费用', icon: BarChart3 },
  { to: '/login', label: '添加账号', detail: 'OAuth 登录', icon: CircleUserRound },
  { to: '/playground', label: '聊天测试', detail: '接口验证', icon: Bot },
  { to: '/config', label: '配置', detail: 'gateway.json', icon: Settings2 },
  { to: '/system', label: '系统', detail: '容器与运行状态', icon: Wrench },
]
const MOBILE_NAV = NAV.slice(0, 5)
export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemePreference>(() => readThemePreference())
  const navigate = useNavigate()
  useEffect(() => { setThemePreference(theme) }, [theme])
  const refreshSession = useCallback(async () => { try { const s = await api.session(); setSession(s); return s } catch { setSession(null); return null } finally { setLoading(false) } }, [])
  useEffect(() => { void refreshSession() }, [refreshSession])
  useEffect(() => { setUnauthorizedHandler(() => { setSession((prev) => (prev ? { ...prev, authenticated: false } : prev)); setBanner('登录状态已失效，请重新登录'); navigate('/') }) }, [navigate])
  const handleLoggedOut = useCallback(async () => { await api.logout().catch(() => undefined); setSession((s) => (s ? { ...s, authenticated: false, username: '' } : s)) }, [])
  if (loading) return <div className="app-loading"><Spinner label="正在连接服务…" /></div>
  if (!session?.authenticated) return <Login info={session} banner={banner} onCloseBanner={() => setBanner(null)} onSuccess={refreshSession} theme={theme} onThemeChange={setTheme} />
  return <Shell session={session} onLogout={handleLoggedOut} onSessionRefresh={refreshSession} theme={theme} onThemeChange={setTheme} />
}
function Shell({ session, onLogout, onSessionRefresh, theme, onThemeChange }: { session: SessionInfo; onLogout: () => void; onSessionRefresh: () => Promise<SessionInfo | null>; theme: ThemePreference; onThemeChange: (value: ThemePreference) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [globalQuery, setGlobalQuery] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { setMobileOpen(false); document.documentElement.scrollTop = 0 }, [location.pathname])
  const warnings = useMemo(() => { const list: string[] = []; if (session.using_default_password) list.push('当前仍使用默认口令，建议在服务端配置中更换。'); if (session.read_only) list.push('服务端已开启只读模式，写操作暂不可用。'); return list }, [session])
  const active = NAV.find((item) => item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to))
  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); const q = globalQuery.trim(); if (q) navigate(`/accounts?q=${encodeURIComponent(q)}`) }
  return <div className="apple-shell">
    <header className="apple-toolbar"><button className="apple-toolbar-button mobile-only" onClick={() => setMobileOpen((v) => !v)} aria-label="打开导航">{mobileOpen ? <X size={21} /> : <Menu size={21} />}</button><NavLink to="/" className="apple-brand"><span className="apple-brand-mark">WB</span><span className="apple-brand-copy"><strong>WorkBuddy</strong><small>Gateway Console</small></span></NavLink><div className="apple-toolbar-title">{active?.label || '控制台'}</div><form className="apple-global-search" onSubmit={submitSearch}><Search size={16} aria-hidden="true" /><input value={globalQuery} onChange={(e) => setGlobalQuery(e.target.value)} placeholder="搜索账号" aria-label="搜索账号" /></form><div className="apple-toolbar-actions"><span className={`apple-presence ${session.read_only ? 'warning' : 'online'}`}><i />{session.read_only ? '只读' : '在线'}</span><ThemePicker className="apple-theme-toolbar" value={theme} onChange={onThemeChange} /><button className="apple-toolbar-button" onClick={onLogout} aria-label="退出登录"><LogOut size={18} /></button></div></header>
    <div className="apple-layout"><aside className={`apple-sidebar ${mobileOpen ? 'mobile-open' : ''}`}><nav className="apple-nav"><div className="apple-nav-label">工作区</div>{NAV.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `apple-nav-item ${isActive ? 'active' : ''}`}><span className="apple-nav-icon"><Icon size={18} strokeWidth={1.9} /></span><span className="apple-nav-copy"><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={15} className="apple-nav-chevron" /></NavLink> })}</nav><div className="apple-sidebar-footer"><div className="apple-account-chip"><span>{(session.username || 'A').slice(0, 1).toUpperCase()}</span><div><strong>{session.username || 'admin'}</strong><small>{session.gateway_url}</small></div></div><div className="apple-sidebar-status"><span className={session.read_only ? 'warning' : 'online'}><i />{session.read_only ? '只读模式' : session.dangerous_ops ? '高危操作已解锁' : '保护模式'}</span></div></div></aside>{mobileOpen && <button className="apple-sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}<main className="apple-content" key={location.pathname}>{warnings.map((w) => <Alert key={w} kind="warn"><span className="apple-alert-line"><ShieldAlert size={16} />{w}</span></Alert>)}<Routes><Route path="/" element={<Dashboard />} /><Route path="/accounts" element={<Accounts session={session} />} /><Route path="/stats" element={<StatsPage session={session} />} /><Route path="/login" element={<LoginWizard session={session} onDone={onSessionRefresh} />} /><Route path="/playground" element={<Playground />} /><Route path="/config" element={<ConfigPage session={session} />} /><Route path="/system" element={<System session={session} onSessionRefresh={onSessionRefresh} />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main></div>
    <nav className="apple-mobile-tabbar">{MOBILE_NAV.map((item) => { const Icon = item.icon; return <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''}><Icon size={21} /><span>{item.label}</span></NavLink> })}</nav>
  </div>
}