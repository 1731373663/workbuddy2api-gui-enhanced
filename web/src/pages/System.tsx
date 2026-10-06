import { CircleCheck, KeyRound, Power, RefreshCw } from 'lucide-react'
// System.tsx 系统页：运行信息、容器状态与控制、任务历史、使用说明。
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../api'
import type { SessionInfo, SystemInfo, TaskListResponse } from '../types'
import { Alert, Badge, ConfirmDialog, fmtDuration, fmtISO, Modal, Spinner } from '../ui'

export default function System({
  session,
  onSessionRefresh,
}: {
  session: SessionInfo
  onSessionRefresh: () => Promise<SessionInfo | null>
}) {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [tasks, setTasks] = useState<TaskListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [i, t] = await Promise.all([api.system(), api.tasks()])
      setInfo(i)
      setTasks(t)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '加载系统信息失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(true), 20_000)
    return () => clearInterval(timer)
  }, [load])

  const doRestart = async () => {
    setRestarting(true)
    setNotice(null)
    try {
      const res = await api.restart()
      setNotice(res.message + '。网关需数秒恢复，请稍后刷新页面查看账号加载情况。')
      setConfirmRestart(false)
      // 重启不改变面板自身配置，但同步一次会话信息以保证模式标志（只读/高危）最新。
      void onSessionRefresh()
      // 给容器一点启动时间再刷新状态。
      setTimeout(() => void load(true), 4000)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '重启失败')
    } finally {
      setRestarting(false)
    }
  }

  if (loading && !info) return <Spinner label="正在加载系统信息…" />

  const c = info?.container
  const gatewayServiceOK = info?.gateway_health?.service === 'workbuddy2api'

  return (
    <>
      <header className="ios-page-title">
        <div><h1>系统</h1><p>面板与网关的运行状态、容器控制与任务历史</p></div>
        <div className="ios-toolbar"><button className="btn" onClick={() => void load()} disabled={loading}>{loading ? <Spinner /> : <RefreshCw size={16} />}刷新</button><button className="btn btn-primary" onClick={() => setConfirmRestart(true)} disabled={!session.dangerous_ops || !c?.exists}><Power size={16} />重启网关</button></div>
      </header>
      {notice && <Alert kind="ok" onClose={() => setNotice(null)}>{notice}</Alert>}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {session.using_default_password && <Alert kind="warn">面板正在使用默认口令，请在服务端配置中修改。</Alert>}

      <section className="ios-group">
        <div className="ios-group-head"><h2>运行状态</h2>{gatewayServiceOK ? <Badge cls="badge-ok">运行中</Badge> : <Badge cls="badge-danger">不可达</Badge>}</div>
        <dl className="ios-key-list">
          <div><dt>网关地址</dt><dd className="mono">{info?.gateway_url}</dd></div>
          <div><dt>身份标识</dt><dd>{gatewayServiceOK ? <><CircleCheck size={15} /> workbuddy2api</> : <span className="text-danger">{info?.gateway_health_error || '无法确认身份'}</span>}</dd></div>
          <div><dt>账号池</dt><dd>{info?.gateway_health ? `${info.gateway_health.healthy} / ${info.gateway_health.total} 可用` : '—'}</dd></div>
          <div><dt>面板版本</dt><dd className="mono">{info?.version || 'dev'}</dd></div>
          <div><dt>运行时长</dt><dd>{info ? fmtDuration(info.uptime_sec) : '—'}</dd></div>
          <div><dt>运行模式</dt><dd>{info?.read_only ? <Badge cls="badge-warn">只读</Badge> : <Badge cls="badge-ok">可写</Badge>}{info?.dangerous_ops ? <Badge cls="badge-warn">高危已解锁</Badge> : <Badge cls="badge-dim">高危已锁定</Badge>}</dd></div>
        </dl>
      </section>

      <section className="ios-group">
        <div className="ios-group-head"><h2>网关容器</h2><button className="ios-text-button" onClick={() => setShowPassword(true)} disabled={!session.password_changeable}><KeyRound size={15} />修改密码</button></div>
        <dl className="ios-key-list">
          <div><dt>容器名</dt><dd className="mono">{c?.name || '（未配置）'}</dd></div>
          <div><dt>容器状态</dt><dd>{c?.disabled ? '未配置' : c?.exists ? <><Badge cls={c.running ? 'badge-ok' : 'badge-danger'}>{c.status || 'unknown'}</Badge>{c.health && c.health !== '-' ? ` · ${c.health}` : ''}</> : <span className="text-danger">{c?.error || '容器不存在'}</span>}</dd></div>
          <div><dt>镜像</dt><dd className="mono">{c?.image || '—'}</dd></div>
          <div><dt>启动时间</dt><dd>{c?.started_at ? fmtISO(c.started_at) : '—'}</dd></div>
          <div><dt>凭证目录</dt><dd className="mono">{info?.auth_dir}</dd></div>
          <div><dt>Docker</dt><dd>{info?.docker_available ? '可用' : '不可用（容器控制已降级）'}</dd></div>
        </dl>
      </section>

      <section className="ios-group">
        <div className="ios-group-head"><h2>任务历史</h2><span>最近 20 条</span></div>
        {tasks?.running && tasks.running.length > 0 && <Alert kind="info">当前有 {tasks.running.length} 个任务正在执行。</Alert>}
        {!tasks?.tasks || tasks.tasks.length === 0 ? <div className="ios-empty-row">还没有执行过批量任务。<Link className="btn btn-primary btn-sm" to="/accounts">去账号管理</Link></div> : <div className="ios-list">
          {tasks.tasks.map((t) => <div className="ios-list-row" key={t.id}><div className="ios-list-main"><strong>{t.title}</strong><span>{fmtISO(t.started_at)}</span></div><Badge cls={t.running ? 'badge-accent' : t.failed > 0 ? 'badge-warn' : 'badge-ok'}>{t.running ? '执行中' : t.failed > 0 ? '有失败' : '已完成'}</Badge><span className="ios-list-value">{t.ok} / {t.failed}</span></div>)}
        </div>}
      </section>

      <section className="ios-group">
        <div className="ios-group-title">客户端接入</div>
        <div className="ios-code-row"><span>Base URL</span><code>{info?.gateway_url || 'http://127.0.0.1:7863'}/v1</code></div>
        <div className="ios-code-row"><span>API Key</span><code>网关 config.json 中的 api_key</code></div>
        <div className="ios-code-row"><span>模型</span><code>见聊天测试页的模型列表</code></div>
      </section>

      {confirmRestart && (
        <ConfirmDialog
          title="重启网关容器"
          danger
          confirmText="确认重启"
          busy={restarting}
          onCancel={() => setConfirmRestart(false)}
          onConfirm={() => void doRestart()}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                即将执行 <span className="mono">docker restart {c?.name}</span>。
              </p>
              <p>
                重启期间（约 2-5 秒）网关无法处理请求，正在进行的对话会中断。
                重启后新账号会被加载进账号池、新配置会生效。
              </p>
              <p style={{ marginBottom: 0 }}>账号池状态由 state.json 持久化，重启不会丢失冷却/熔断记录。</p>
            </>
          }
        />
      )}

      {showPassword && (
        <ChangePasswordDialog
          currentUser={session.username}
          onClose={() => setShowPassword(false)}
          onDone={async () => {
            setShowPassword(false)
            await onSessionRefresh()
          }}
        />
      )}
    </>
  )
}

/** ChangePasswordDialog 修改面板登录口令。 */
function ChangePasswordDialog({
  currentUser,
  onClose,
  onDone,
}: {
  currentUser: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [newUsername, setNewUsername] = useState(currentUser)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!current) {
      setError('请输入当前口令')
      return
    }
    if (next.length < 6) {
      setError('新口令至少 6 位')
      return
    }
    if (next !== confirm) {
      setError('两次输入的新口令不一致')
      return
    }
    setBusy(true)
    try {
      const res = await api.changePassword(current, next, newUsername)
      setDone(res.message || '口令已修改')
      // 改成功后可无缝继续（后端已重发会话 Cookie）。
      await onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '修改失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="修改登录口令"
      onClose={onClose}
      footer={
        done ? (
          <button className="btn btn-primary" onClick={onClose}>
            完成
          </button>
        ) : (
          <>
            <button className="btn" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner /> : null}
              保存修改
            </button>
          </>
        )
      }
    >
      {done ? (
        <Alert kind="ok">{done}</Alert>
      ) : (
        <>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="field">
            <label>用户名</label>
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoComplete="username" />
            <div className="desc">可同时修改登录用户名，留空则沿用当前用户名。</div>
          </div>
          <div className="field">
            <label>当前口令</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
          </div>
          <div className="field">
            <label>新口令（至少 6 位）</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>确认新口令</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="desc" style={{ marginTop: 12 }}>
            修改后所有已登录会话立即失效，需用新口令重新登录（本页面会自动续期）。
          </div>
        </>
      )}
    </Modal>
  )
}
