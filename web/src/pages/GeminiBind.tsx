import { useState } from 'react'
import { ExternalLink, KeyRound, Sparkles } from 'lucide-react'
import { api, ApiError } from '../api'
import type { SessionInfo } from '../types'
import { Alert, Spinner } from '../ui'

export default function GeminiBind({ session }: { session: SessionInfo }) {
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [redirect, setRedirect] = useState<string>('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('gemini')
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const writeDisabled = session.read_only

  const start = async () => {
    setStarting(true)
    setError(null)
    setNotice(null)
    try {
      const res = await api.geminiAuthUrl()
      setAuthUrl(res.auth_url)
      setRedirect(res.redirect)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '获取授权链接失败')
    } finally {
      setStarting(false)
    }
  }

  const submit = async () => {
    if (!code.trim()) {
      setError('请粘贴授权码')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const res = await api.geminiExchange(code.trim(), name.trim() || 'gemini')
      setNotice(`${res.message}${res.email ? `（${res.email}）` : ``}`)
      setCode('')
      setAuthUrl(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '绑定失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ios-group">
      <div className="ios-group-head">
        <h2>Gemini 账号（Google AI Pro）</h2>
      </div>
      <p className="text-dim" style={{ marginTop: 0, fontSize: 13 }}>
        通过 Google OAuth 绑定账号，网关以 Gemini Code Assist 通道调用 Gemini 模型，无需 AI Studio API Key。
      </p>
      {notice && <Alert kind="ok" onClose={() => setNotice(null)}>{notice}</Alert>}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      <div className="field">
        <label>绑定名称</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="gemini" disabled={writeDisabled} style={{ maxWidth: 260 }} />
        <div className="desc">调用模型时使用：名称:模型名，例如 gemini:gemini-2.5-pro</div>
      </div>

      <div className="ios-toolbar">
        <button className="btn btn-primary" onClick={() => void start()} disabled={starting || writeDisabled}>
          {starting ? <Spinner /> : <KeyRound size={14} aria-hidden="true" />} 发起 Google 授权
        </button>
      </div>

      {authUrl && (
        <>
          <div className="ios-toolbar">
            <a className="btn" href={authUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} aria-hidden="true" /> 打开授权页面
            </a>
          </div>
          <div className="url-box" style={{ margin: '10px 0', wordBreak: 'break-all' }}>{authUrl}</div>
          <Alert kind="info">
            <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              <li>在授权页面登录并同意（提示无法访问此网站是正常的）</li>
              <li>复制地址栏里 code= 后面的整段内容</li>
              <li>粘贴到下方输入框并点完成绑定</li>
            </ol>
            <div style={{ marginTop: 6, fontSize: 12.5 }}>回调地址：<span className="mono">{redirect}</span></div>
          </Alert>
          <div className="field">
            <label>授权码</label>
            <textarea rows={3} value={code} onChange={(e) => setCode(e.target.value)} placeholder="粘贴 code 参数或整段回调 URL" disabled={writeDisabled} />
          </div>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy || writeDisabled}>
            {busy ? <Spinner /> : <Sparkles size={14} aria-hidden="true" />} 完成绑定
          </button>
        </>
      )}

      <div className="desc" style={{ marginTop: 12 }}>
        绑定后需重启网关，Gemini 模型才会出现在聊天模型列表。
      </div>
    </div>
  )
}
