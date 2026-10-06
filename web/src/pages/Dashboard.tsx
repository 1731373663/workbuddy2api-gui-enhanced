import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck, Gauge, RefreshCw, TrendingUp, UserPlus } from 'lucide-react'
import { api, ApiError } from '../api'
import type { Account, Overview } from '../types'
import { Alert, Badge, displayName, fmtDuration, fmtISO, fmtNum, Spinner, statusBadge } from '../ui'

export default function Dashboard() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [o, a] = await Promise.all([api.overview(), api.accounts()])
      setOv(o); setAccounts(a.accounts ?? []); setError(null); setRefreshedAt(new Date())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载失败')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(true), 15_000)
    return () => clearInterval(timer)
  }, [load])

  if (loading && !ov) return <Spinner label="正在加载仪表盘…" />
  const problems = accounts.filter((a) => a.status === 'disabled' || a.status === 'token_expired' || a.status === 'cooling')
  const topAccounts = [...accounts].sort((a, b) => (b.live_credits ?? b.credits) - (a.live_credits ?? a.credits)).slice(0, 6)
  const healthPct = ov && ov.total > 0 ? Math.round((ov.healthy / ov.total) * 100) : 0

  return (
    <div className="ios-page">
      <header className="ios-page-title">
        <div><h1>仪表盘</h1><p>账号池健康度、积分与运行状态</p></div>
        <button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin-icon' : undefined} aria-hidden="true" />刷新</button>
      </header>
      {error && <Alert kind="error">{error}</Alert>}
      {ov && !ov.gateway_ok && <Alert kind="error"><strong>无法连接网关（{ov.gateway_url}）</strong><div>{ov.gateway_error}</div></Alert>}
      {ov?.warnings?.map((w) => <Alert key={w} kind="warn">{w}</Alert>)}
      {ov && (ov.expired > 0 || ov.expiring > 0) && <Alert kind="warn">有 <strong>{ov.expired}</strong> 个 token 已过期，<strong>{ov.expiring}</strong> 个即将过期。<Link to="/accounts">前往账号管理</Link></Alert>}
      {ov && <>
        <section className="ios-hero-card">
          <div className="ios-hero-icon"><Gauge size={24} aria-hidden="true" /></div>
          <div className="ios-hero-copy"><span>账号池可用率</span><strong>{healthPct}%</strong><p>{ov.healthy} 个可用，共 {ov.total} 个账号</p></div>
          <div className="ios-health-ring" style={{ '--health': `${healthPct * 3.6}deg` } as React.CSSProperties}><span>{ov.healthy}</span><small>可用</small></div>
        </section>
        <section className="ios-group"><div className="ios-group-title">账号池</div><div className="ios-grid-metrics">
          <Metric label="可用账号" value={`${ov.healthy}/${ov.total}`} detail="健康 / 总数" />
          <Metric label="冷却中" value={String(ov.cooling)} detail="限流或熔断" tone={ov.cooling > 0 ? 'warn' : undefined} />
          <Metric label="已禁用" value={String(ov.disabled)} detail="需要重新登录" tone={ov.disabled > 0 ? 'danger' : undefined} />
          <Metric label="在途请求" value={String(ov.in_flight)} detail={`满载 ${ov.in_flight_full} 个`} />
        </div></section>
        <section className="ios-group"><div className="ios-group-title">积分与会话</div><div className="ios-grid-metrics">
          <Metric label="剩余积分" value={fmtNum(ov.credits.remain)} detail={ov.credits.size > 0 ? `总量 ${fmtNum(ov.credits.size)}` : '未查询到配额'} />
          <Metric label="粘性会话" value={String(ov.sticky_sessions)} detail={`Redis：${ov.redis_mode}`} />
          <Metric label="凭证文件" value={String(ov.file_count)} detail={ov.expired > 0 ? `${ov.expired} 个已过期` : '全部有效'} tone={ov.expired > 0 ? 'warn' : undefined} />
          <Metric label="更新时间" value={refreshedAt ? refreshedAt.toLocaleTimeString('zh-CN', { hour12: false }) : '—'} detail="每 15 秒自动刷新" />
        </div></section>
        <section className="ios-group"><div className="ios-group-head"><h2>需要处理</h2><span>{problems.length} 个账号</span></div>
          {problems.length === 0 ? <div className="ios-empty-row"><CircleCheck size={20} aria-hidden="true" />所有账号状态正常</div> : <div className="ios-list">{problems.map((a) => { const b = statusBadge(a.status); return <div className="ios-list-row" key={a.uid}><div className="ios-list-main"><strong>{displayName(a)}</strong><span>{a.uid.slice(0, 8)}</span></div><Badge cls={b.cls}>{b.text}</Badge><span className="ios-list-value">{a.cool_remaining_sec ? fmtDuration(a.cool_remaining_sec) : fmtISO(a.last_err)}</span></div> })}</div>}
        </section>
        <section className="ios-group"><div className="ios-group-head"><h2>积分最高的账号</h2><Link to="/accounts">查看全部</Link></div>
          {topAccounts.length === 0 ? <div className="ios-empty-row"><UserPlus size={20} aria-hidden="true" />还没有账号<Link className="btn btn-primary btn-sm" to="/login">添加账号</Link></div> : <div className="ios-list">{topAccounts.map((a) => { const b = statusBadge(a.status); return <div className="ios-list-row" key={a.uid}><div className="ios-list-main"><strong>{displayName(a)}</strong><span>{a.uid.slice(0, 8)}</span></div><Badge cls={b.cls}>{b.text}</Badge><span className="ios-list-number"><TrendingUp size={13} aria-hidden="true" />{fmtNum(a.live_credits ?? a.credits)}</span></div> })}</div>}
        </section>
        <section className="ios-group"><div className="ios-group-title">运行信息</div><dl className="ios-key-list">
          <div><dt>网关地址</dt><dd className="mono">{ov.gateway_url}</dd></div>
          <div><dt>身份标识</dt><dd>{ov.health?.service === 'workbuddy2api' ? <Badge cls="badge-ok">已确认</Badge> : <Badge cls="badge-warn">未确认</Badge>}</dd></div>
          <div><dt>凭证目录</dt><dd>{ov.file_count} 个文件</dd></div>
          <div><dt>服务端时间</dt><dd>{new Date(ov.server_time).toLocaleString('zh-CN', { hour12: false })}</dd></div>
        </dl></section>
      </>}
    </div>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'ok' | 'warn' | 'danger' }) {
  const cls = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : ''
  return <div className="ios-metric"><span>{label}</span><strong className={cls}>{value}</strong><small>{detail}</small></div>
}
