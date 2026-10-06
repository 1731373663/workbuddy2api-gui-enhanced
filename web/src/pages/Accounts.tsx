// Accounts.tsx 账号管理：列表 / 筛选 / 单账号操作 / 批量任务 / 详情 / 导入导出。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BadgeDollarSign,
  CheckCircle2,
  FileDown,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { api, ApiError } from '../api'
import type { Account, AccountProfile, SessionInfo } from '../types'
import {
  Alert,
  Badge,
  ConfirmDialog,
  coolKindText,
  displayName,
  fmtDuration,
  fmtISO,
  fmtNum,
  fmtTime,
  Modal,
  Spinner,
  statusBadge,
} from '../ui'
import TaskProgress from './TaskProgress'

type Filter = 'all' | 'healthy' | 'cooling' | 'problem' | 'expiring'

export default function Accounts({ session }: { session: SessionInfo }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [fileIssues, setFileIssues] = useState<string[]>([])
  const [gatewayOK, setGatewayOK] = useState(true)
  const [gatewayError, setGatewayError] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null)

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyUid, setBusyUid] = useState<string | null>(null)

  const [detailUid, setDetailUid] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const res = await api.accounts()
      setAccounts(res.accounts ?? [])
      setFileIssues(res.file_issues ?? [])
      setGatewayOK(res.gateway_ok)
      setGatewayError(res.gateway_error)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载账号失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(true), 20_000)
    return () => clearInterval(timer)
  }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return accounts.filter((a) => {
      if (q && !a.uid.toLowerCase().includes(q) && !a.nickname.toLowerCase().includes(q)) return false
      switch (filter) {
        case 'healthy':
          return a.status === 'healthy'
        case 'cooling':
          return a.status === 'cooling'
        case 'problem':
          return a.status === 'disabled' || a.status === 'token_expired' || a.status === 'missing_credential'
        case 'expiring':
          return a.expired || a.needs_refresh
        default:
          return true
      }
    })
  }, [accounts, filter, query])

  const allSelected = filtered.length > 0 && filtered.every((a) => selected.has(a.uid))
  const targetUIDs = useMemo(
    () => (selected.size > 0 ? [...selected] : []),
    [selected],
  )

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((a) => a.uid)))
    }
  }

  const toggleOne = (uid: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  /** runSingle 执行单账号操作并展示结果。 */
  const runSingle = async (a: Account, action: 'checkin' | 'refresh' | 'travel' | 'credits') => {
    setBusyUid(a.uid)
    setNotice(null)
    try {
      if (action === 'checkin' || action === 'refresh' || action === 'travel') {
        const res =
          action === 'checkin'
            ? await api.accountCheckin(a.uid)
            : action === 'refresh'
              ? await api.accountRefresh(a.uid)
              : await api.accountTravel(a.uid)
        setNotice({
          kind: res.ok ? 'ok' : 'error',
          text: `${displayName(a)}：${res.message}${res.reward ? `（+${res.reward}）` : ''}`,
        })
      } else {
        const c = await api.accountCredits(a.uid)
        setNotice({
          kind: 'ok',
          text: `${displayName(a)}：剩余 ${fmtNum(c.remain)} / 总量 ${fmtNum(c.size)}（${c.packages} 个套餐）`,
        })
      }
      await load(true)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : '操作失败' })
    } finally {
      setBusyUid(null)
    }
  }

  /** runBatch 提交批量任务。 */
  const runBatch = async (kind: 'checkin' | 'refresh' | 'travel' | 'credits') => {
    setNotice(null)
    try {
      const fn =
        kind === 'checkin'
          ? api.batchCheckin
          : kind === 'refresh'
            ? api.batchRefresh
            : kind === 'travel'
              ? api.batchTravel
              : api.batchCredits
      const task = await fn(targetUIDs)
      setTaskId(task.id)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : '任务提交失败' })
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await api.deleteAccount(deleteTarget.uid)
      setNotice({ kind: 'ok', text: res.message })
      setDeleteTarget(null)
      await load(true)
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : '删除失败' })
    } finally {
      setDeleting(false)
    }
  }

  const writeDisabled = session.read_only

  return (
    <div className="ios-page">
      <header className="ios-page-title">
        <div><h1>账号</h1><p>{accounts.length} 个账号 · {accounts.filter((a) => a.status === 'healthy').length} 个可用</p></div>
        <div className="ios-toolbar">
          <button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin-icon' : undefined} />刷新</button>
          <button className="btn" onClick={() => setShowImport(true)} disabled={writeDisabled}><FileDown size={16} />导入</button>
          <Link className="btn btn-primary" to="/login"><Plus size={16} />添加</Link>
        </div>
      </header>
      {writeDisabled && <Alert kind="warn">服务端已开启只读模式，写操作暂不可用。</Alert>}
      {notice && <Alert kind={notice.kind} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      {!gatewayOK && <Alert kind="warn">网关当前不可达{gatewayError ? `：${gatewayError}` : ''}，运行态数据可能不是最新的。</Alert>}
      {fileIssues.length > 0 && <Alert kind="warn">凭证目录存在无法解析的文件：{fileIssues.join('、')}</Alert>}
      <section className="ios-group"><div className="ios-group-title">账号概览</div><div className="ios-grid-metrics">
        <Metric label="可用" value={String(accounts.filter((a) => a.status === 'healthy').length)} detail="正常状态" />
        <Metric label="需处理" value={String(accounts.filter((a) => a.status !== 'healthy').length)} detail="冷却 / 禁用 / 过期" tone="warn" />
        <Metric label="已选择" value={String(selected.size)} detail={selected.size > 0 ? '批量操作作用于所选' : '未选择时作用于全部'} />
        <Metric label="结果" value={String(filtered.length)} detail={`筛选后 · 共 ${accounts.length}`} />
      </div></section>
      <section className="ios-group"><div className="ios-group-head"><h2>批量操作</h2><span>{selected.size > 0 ? `已选 ${selected.size} 个` : '全部账号'}</span></div>
        <div className="ios-action-grid">
          <ActionButton icon={<CheckCircle2 size={20} />} label="批量签到" disabled={writeDisabled || accounts.length === 0} onClick={() => void runBatch('checkin')} />
          <ActionButton icon={<KeyRound size={20} />} label="刷新 Token" disabled={writeDisabled || accounts.length === 0} onClick={() => void runBatch('refresh')} />
          <ActionButton icon={<Sparkles size={20} />} label="猫猫旅行" disabled={writeDisabled || accounts.length === 0} onClick={() => void runBatch('travel')} />
          <ActionButton icon={<BadgeDollarSign size={20} />} label="查询积分" disabled={accounts.length === 0} onClick={() => void runBatch('credits')} />
        </div>{selected.size > 0 && <button className="ios-clear-selection" onClick={() => setSelected(new Set())}>清除选择</button>}
      </section>
      <section className="ios-group">
        <div className="ios-group-head"><h2>账号列表</h2><button className="ios-text-button" onClick={toggleAll}>{allSelected ? '取消全选' : '全选筛选结果'}</button></div>
        <div className="ios-search-row"><div className="filter-search"><Search size={16} aria-hidden="true" /><input type="text" placeholder="搜索 uid 或昵称" value={query} onChange={(e) => setQuery(e.target.value)} /></div></div>
        <div className="ios-segmented">{([['all', '全部'], ['healthy', '正常'], ['cooling', '冷却'], ['problem', '异常'], ['expiring', '待刷新']] as [Filter, string][]).map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</div>
        {loading && accounts.length === 0 ? <div className="ios-empty-row"><Spinner label="加载中…" /></div> : filtered.length === 0 ? <div className="ios-empty-row"><UsersRound size={20} aria-hidden="true" />{accounts.length === 0 ? '还没有账号' : '没有符合筛选条件的账号'}{accounts.length === 0 && <Link className="btn btn-primary btn-sm" to="/login">添加账号</Link>}</div> : <div className="ios-account-list">
          {filtered.map((a) => { const b = statusBadge(a.status); const busy = busyUid === a.uid; const isSelected = selected.has(a.uid); return <article className={`ios-account-row ${isSelected ? 'selected' : ''}`} key={a.uid}>
            <div className="ios-account-select"><input type="checkbox" checked={isSelected} onChange={() => toggleOne(a.uid)} aria-label={`选择 ${a.uid}`} /></div>
            <button className="ios-account-identity" onClick={() => setDetailUid(a.uid)}><strong>{displayName(a)}</strong><span>{a.uid.slice(0, 8)}{a.in_gateway && a.in_flight > 0 ? ` · 在途 ${a.in_flight}` : ''}</span></button>
            <div className="ios-account-status"><Badge cls={b.cls}>{b.text}</Badge>{a.cooling && <small>{coolKindText(a.cool_kind)} · {fmtDuration(a.cool_remaining_sec)}</small>}{a.disabled && a.reason && <small>{a.reason}</small>}</div>
            <div className="ios-account-balance"><strong>{fmtNum(a.live_credits ?? a.credits)}</strong><small>积分</small></div>
            <div className="ios-account-actions"><QuickButton label="签到" busy={busy} disabled={busy || writeDisabled} onClick={() => void runSingle(a, 'checkin')} /><QuickButton label="刷新" busy={busy} disabled={busy || writeDisabled} onClick={() => void runSingle(a, 'refresh')} /><QuickButton label="猫猫" busy={busy} disabled={busy || writeDisabled} onClick={() => void runSingle(a, 'travel')} /><QuickButton label="积分" busy={busy} disabled={busy} onClick={() => void runSingle(a, 'credits')} /><button className="ios-danger-button" disabled={busy || writeDisabled || !session.dangerous_ops || !a.has_file} onClick={() => setDeleteTarget(a)} title="删除账号凭证"><Trash2 size={15} /></button></div>
          </article> })}
        </div>}
      </section>
      {detailUid && <AccountDetail uid={detailUid} onClose={() => setDetailUid(null)} />}
      {taskId && <TaskProgress taskId={taskId} onClose={() => setTaskId(null)} onFinished={() => void load(true)} />}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} onDone={(msg) => { setShowImport(false); setNotice({ kind: 'ok', text: msg }); void load(true) }} onError={(msg) => setNotice({ kind: 'error', text: msg })} />}
      {deleteTarget && <ConfirmDialog title="删除账号凭证" danger confirmText="确认删除" busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void doDelete()} message={<><p style={{ marginTop: 0 }}>即将删除账号 <strong>{displayName(deleteTarget)}</strong> 的凭证文件。</p><p>该操作不可从上游恢复，需要重新登录才能找回账号。</p></>} />}
    </div>
  )
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: 'ok' | 'warn' | 'danger' }) {
  const cls = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : ''
  return <div className="ios-metric"><span>{label}</span><strong className={cls}>{value}</strong><small>{detail}</small></div>
}
function ActionButton({ icon, label, disabled, onClick }: { icon: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return <button className="ios-action-button" disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>
}
function QuickButton({ label, busy, disabled, onClick }: { label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return <button className="ios-quick-button" disabled={disabled} onClick={onClick}>{busy ? <Spinner /> : label}</button>
}

/** AccountDetail 账号详情弹窗：实时积分、猫档案、冷却/熔断细节。 */
function AccountDetail({ uid, onClose }: { uid: string; onClose: () => void }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .account(uid)
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : '加载详情失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const a = profile?.account

  return (
    <Modal title={`账号详情 · ${a ? displayName(a) : uid.slice(0, 8)}`} onClose={onClose} wide>
      {loading && <Spinner label="正在查询上游…" />}
      {error && <Alert kind="error">{error}</Alert>}
      {profile?.upstream_error && <Alert kind="warn">上游查询失败：{profile.upstream_error}</Alert>}

      {a && (
        <>
          <div className="grid grid-stats" style={{ marginBottom: 16 }}>
            <div className="stat">
              <div className="stat-label">剩余积分</div>
              <div className="stat-value small">
                {profile?.credits ? fmtNum(profile.credits.remain) : fmtNum(a.live_credits ?? a.credits)}
              </div>
              {profile?.credits && <div className="stat-sub">总量 {fmtNum(profile.credits.size)}</div>}
              {profile?.credits_error && <div className="stat-sub text-danger">查询失败</div>}
            </div>
            <div className="stat">
              <div className="stat-label">累计成功</div>
              <div className="stat-value small text-ok">{fmtNum(a.success_count)}</div>
              <div className="stat-sub">失败 {fmtNum(a.err_total)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">在途请求</div>
              <div className="stat-value small">{a.in_flight}</div>
              <div className="stat-sub">熔断计数 {a.breaker_fails}</div>
            </div>
            <div className="stat">
              <div className="stat-label">猫猫旅行</div>
              <div className="stat-value small" style={{ fontSize: 15 }}>
                {profile?.buddy ? (profile.buddy.name || '已领养') : profile?.buddy_error ? '查询失败' : '未领养'}
              </div>
              <div className="stat-sub">
                {profile?.travel
                  ? `状态 ${profile.travel.state}${profile.travel.daily_limit_reached ? '（今日已派出）' : ''}`
                  : '—'}
              </div>
            </div>
          </div>

          <dl className="kv">
            <dt>UID</dt>
            <dd className="mono">{a.uid}</dd>
            <dt>昵称</dt>
            <dd>{a.nickname || '—'}</dd>
            <dt>企业 ID</dt>
            <dd className="mono">{a.enterprise_id || '—'}</dd>
            <dt>Domain</dt>
            <dd className="mono">{a.domain || '—'}</dd>
            <dt>凭证文件</dt>
            <dd className="mono">{a.file_name || '（无文件，仅网关内存）'}</dd>
            <dt>Token 过期</dt>
            <dd>{fmtTime(a.expires_at)}</dd>
            <dt>Refresh Token</dt>
            <dd>{a.has_refresh_token ? '存在' : '缺失（无法刷新，需重登）'}</dd>
            <dt>网关状态</dt>
            <dd>
              <Badge cls={statusBadge(a.status).cls}>{statusBadge(a.status).text}</Badge>
              {a.reason && <span className="text-faint"> · {a.reason}</span>}
            </dd>
            {a.cooling && (
              <>
                <dt>冷却类型</dt>
                <dd>
                  {coolKindText(a.cool_kind)} · 剩余 {fmtDuration(a.cool_remaining_sec)}
                  {a.soft_streak ? ` · 连续软限流 ${a.soft_streak} 次` : ''}
                </dd>
                <dt>冷却截止</dt>
                <dd>{fmtISO(a.breaker_until) !== '—' ? fmtISO(a.breaker_until) : fmtTime(a.expires_at)}</dd>
              </>
            )}
            <dt>最近成功</dt>
            <dd>{fmtISO(a.last_success)}</dd>
            <dt>最近失败</dt>
            <dd>{fmtISO(a.last_err)}</dd>
          </dl>
        </>
      )}

      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          关闭
        </button>
      </div>
    </Modal>
  )
}

/** ImportDialog 手工导入凭证（从别的机器迁移 / 复用 login.sh 产物）。 */
function ImportDialog({
  onClose,
  onDone,
  onError,
}: {
  onClose: () => void
  onDone: (msg: string) => void
  onError: (msg: string) => void
}) {
  const [raw, setRaw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      const res = await api.importAccount({ raw_json: raw })
      if (res.ok) onDone(res.message)
      else setError(res.message)
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '导入失败'
      setError(msg)
      onError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="导入账号凭证"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || !raw.trim()}>
            {busy ? <Spinner /> : null}
            导入
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="field">
        <label>粘贴凭证 JSON</label>
        <textarea
          rows={12}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={`支持两种格式：

1) workbuddy2api / 插件的嵌套格式（推荐，直接 cat auths/workbuddy-*.json 的内容）：
{
  "account": { "uid": "...", "enterpriseId": "", "nickname": "..." },
  "auth": { "accessToken": "...", "refreshToken": "...", "expiresAt": 1794289203, "domain": "copilot.tencent.com" }
}

2) 扁平格式：
{ "accessToken": "...", "refreshToken": "...", "uid": "...", "nickname": "..." }`}
        />
      </div>
      <div className="desc">
        导入后需重启网关容器，账号才会进入账号池（可在「系统」页一键重启）。若无 refreshToken，该账号在 token
        过期后必须重新登录。
      </div>
    </Modal>
  )
}