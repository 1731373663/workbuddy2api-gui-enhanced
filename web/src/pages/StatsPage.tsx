import { RefreshCw, RotateCcw } from 'lucide-react'
// StatsPage.tsx 请求统计：按模型分开统计首字延迟、吞吐、缓存命中、输入输出与扣费。
//
// 数据源是网关的 /v1/stats —— 网关是所有流量的必经点，因此这里看到的**包含**
// 绕过本面板的其他客户端（比如你自己的工具/脚本）的调用。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../api'
import type { ModelStat, ModelPrice, RequestDetail, SessionInfo, StatsResponse } from '../types'
import { Alert, Empty, fmtDuration, fmtISO, fmtNum, Modal, Spinner } from '../ui'

/** 数值格式化：大数用千分位，小数保留位数。 */
function fmtMs(v: number): string {
  if (!v) return '—'
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`
}
function fmtRate(v: number): string {
  return v ? v.toFixed(1) : '—'
}
function fmtPct(v: number): string {
  if (!v) return '0%'
  return `${(v * 100).toFixed(1)}%`
}
function fmtCredit(v: number): string {
  return v ? v.toFixed(4) : '0'
}
/** 大 token 数缩写（1.2M / 345.6K / 123）。 */
function fmtTok(v: number): string {
  if (!v) return '0'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

/** 缓存命中率配色：越高越省（命中部分通常便宜得多）。 */
function hitTone(rate: number): string {
  if (rate >= 0.5) return 'text-ok'
  if (rate >= 0.1) return 'text-warn'
  return 'text-dim'
}

export default function StatsPage({ session }: { session: SessionInfo }) {
  const [resp, setResp] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [sortKey, setSortKey] = useState<keyof ModelStat>('requests')
  const [resetting, setResetting] = useState(false)
  // timeMode 影响官方价换算：DeepSeek 空闲时段是高峰价的一半。
  const [timeMode, setTimeMode] = useState<'peak' | 'offpeak'>('peak')
  // 价格编辑弹窗：null = 关闭；否则为正在编辑的模型名
  const [editingModel, setEditingModel] = useState<string | null>(null)
  // 详情展开：同一时间只展开一个模型，数据按需加载并缓存。
  const [expandedModel, setExpandedModel] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, RequestDetail[]>>({})
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null)
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<{ model: string; detail: RequestDetail } | null>(null)

  const stats = resp?.stats ?? null

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      try {
        const s = await api.stats(timeMode)
        setResp(s)
        setError(null)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : '加载统计失败')
      } finally {
        setLoading(false)
      }
    },
    [timeMode],
  )

  useEffect(() => {
    void load()
  }, [load])

  // 自动刷新：统计是累计值，10 秒一次足够看出趋势。
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => void load(true), 10_000)
    return () => clearInterval(timer)
  }, [autoRefresh, load])

  const toggleDetails = async (model: string) => {
    setDetailsError(null)
    if (expandedModel === model) {
      setExpandedModel(null)
      return
    }
    setExpandedModel(model)
    if (details[model]) return
    setDetailsLoading(model)
    try {
      const r = await api.statsDetails(model, 100)
      setDetails((prev) => ({ ...prev, [model]: r.details ?? [] }))
    } catch (err) {
      setDetailsError(err instanceof ApiError ? err.message : '加载请求详情失败')
    } finally {
      setDetailsLoading(null)
    }
  }

  const doReset = async () => {
    setResetting(true)
    setNotice(null)
    try {
      const r = await api.resetStats()
      setNotice(r.message || '统计已重置')
      await load(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '重置失败')
    } finally {
      setResetting(false)
    }
  }

  // 排序后的模型列表（默认按请求数降序，热点模型在最上面）。
  const models = useMemo(() => {
    const list = [...(stats?.models ?? [])]
    list.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return bv - av
      return String(av).localeCompare(String(bv))
    })
    return list
  }, [stats, sortKey])

  if (loading && !stats) return <Spinner label="正在加载统计…" />

  // 统计未启用（服务端 metrics_enabled=false）。
  if (stats && !stats.enabled) {
    return (
      <>
        <div className="ios-page-title">
          <div>
            <h1>请求统计</h1>
            <p>按模型聚合的首字延迟、吞吐、缓存命中与扣费</p>
          </div>
        </div>
        <Alert kind="warn">
          <strong>网关未启用统计。</strong>
          <div style={{ marginTop: 4 }}>{stats.message || '请在网关配置中设置 server.metrics_enabled=true'}</div>
        </Alert>
      </>
    )
  }

  const t = stats?.total

  return (
    <div className="ios-page">
      <header className="ios-page-title"><div><h1>统计</h1><p>所有经过网关的请求 · 已运行 {stats ? fmtDuration(stats.uptime_sec) : '—'}</p></div><div className="ios-toolbar"><label className="checkbox"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />自动刷新</label><button className="btn" onClick={() => void load()} disabled={loading}>{loading ? <Spinner /> : <RefreshCw size={16} />}刷新</button><button className="btn btn-danger" onClick={() => void doReset()} disabled={resetting || session.read_only}>{resetting ? <Spinner /> : <RotateCcw size={16} />}重置</button></div></header>
      {notice && <Alert kind="ok" onClose={() => setNotice(null)}>{notice}</Alert>}{error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}{detailsError && <Alert kind="error" onClose={() => setDetailsError(null)}>{detailsError}</Alert>}{!stats?.enabled && <Alert kind="warn"><strong>网关未启用统计。</strong><div>{stats?.message || '请在网关配置中设置 server.metrics_enabled=true'}</div></Alert>}
      {t && <><section className="ios-group"><div className="ios-group-title">累计概览</div><div className="ios-grid-metrics"><Stat label="总请求" value={fmtNum(t.requests)} sub={`成功 ${fmtNum(t.success)} · 失败 ${fmtNum(t.failed)}`} /><Stat label="平均首字" value={fmtMs(t.avg_ttfb_ms)} sub={`平均耗时 ${fmtMs(t.avg_latency_ms)}`} tone={t.avg_ttfb_ms > 5000 ? 'warn' : undefined} /><Stat label="吞吐" value={t.tokens_per_sec ? `${fmtRate(t.tokens_per_sec)} tok/s` : '—'} sub="输出 token / 秒" /><Stat label="缓存命中" value={fmtPct(t.cache_hit_rate)} sub={`命中 ${fmtTok(t.cache_hit_tokens)}`} tone={t.cache_hit_rate >= 0.5 ? 'ok' : undefined} /></div></section><section className="ios-group"><div className="ios-group-title">Token 与费用</div><div className="ios-grid-metrics"><Stat label="输入 / 输出" value={`${fmtTok(t.prompt_tokens)} / ${fmtTok(t.completion_tokens)}`} sub={`合计 ${fmtTok(t.total_tokens)}`} /><Stat label="累计积分" value={fmtCredit(t.credit)} sub={`平均 ${fmtCredit(t.credit_per_req)} / 请求`} /><Stat label={timeMode === 'peak' ? '官方应付 · 高峰' : '官方应付 · 空闲'} value={`¥${resp?.total.total.toFixed(4) ?? '0'}`} sub={resp?.unpriced?.length ? `${resp.unpriced.length} 个模型未配价` : '按官方单价换算'} tone="warn" /><Stat label="流式请求" value={fmtNum(t.streaming)} sub="SSE 响应" /></div></section></>}
      {resp && <section className="ios-group"><div className="ios-group-head"><h2>价格换算</h2><div className="ios-toolbar"><select value={timeMode} onChange={(e) => setTimeMode(e.target.value as 'peak' | 'offpeak')}><option value="peak">高峰价</option><option value="offpeak">空闲价</option></select><button className="ios-text-button" onClick={() => setEditingModel('__new__')} disabled={!resp.pricing.editable || session.read_only}>编辑价格</button></div></div><div className="ios-key-list"><div><dt>官方应付</dt><dd>¥{resp.total.total.toFixed(4)} · 命中 ¥{resp.total.cached_input_cost.toFixed(4)} · 未命中 ¥{resp.total.miss_input_cost.toFixed(4)}</dd></div><div><dt>网关积分</dt><dd>{fmtCredit(t?.credit ?? 0)} 积分（量与元不同，不做相减）</dd></div>{resp.pricing.source && <div><dt>价格来源</dt><dd><a href={resp.pricing.source} target="_blank" rel="noopener noreferrer">官方定价页</a>{resp.pricing.updated_at ? ` · 更新于 ${resp.pricing.updated_at}` : ''}</dd></div>}</div></section>}
      <section className="ios-group"><div className="ios-group-head"><h2>模型明细</h2><select value={String(sortKey)} onChange={(e) => setSortKey(e.target.value as keyof ModelStat)}><option value="requests">按请求数</option><option value="avg_ttfb_ms">按首字延迟</option><option value="tokens_per_sec">按吞吐</option><option value="cache_hit_rate">按缓存命中</option><option value="credit">按扣费</option><option value="completion_tokens">按输出 token</option></select></div>{models.length === 0 ? <div className="ios-empty-row"><Empty>还没有统计数据。向网关发一次请求后即可看到。</Empty></div> : <div className="ios-model-list">{models.map((m) => { const c = resp?.costs?.[m.model]; const expanded = expandedModel === m.model; return <article className={`ios-model-row ${expanded ? 'expanded' : ''}`} key={m.model}><button className="ios-model-main" onClick={() => void toggleDetails(m.model)}><span className="ios-model-name">{m.model}</span><span className="ios-model-meta">{fmtNum(m.requests)} 请求{m.failed ? ` · ${m.failed} 失败` : ''}</span></button><div className="ios-model-metrics"><span><small>首字</small><strong>{fmtMs(m.avg_ttfb_ms)}</strong></span><span><small>吞吐</small><strong>{fmtRate(m.tokens_per_sec)}</strong></span><span><small>缓存</small><strong className={hitTone(m.cache_hit_rate)}>{fmtPct(m.cache_hit_rate)}</strong></span><span><small>官方价</small><strong>{c?.priced ? `¥${c.total.toFixed(4)}` : '未配置'}</strong></span></div><button className="ios-model-chevron" onClick={() => void toggleDetails(m.model)} aria-expanded={expanded}>{expanded ? '▾' : '▸'}</button>{expanded && <div className="ios-model-detail">{detailsLoading === m.model && <Spinner label="正在加载请求详情…" />}{expanded && <RequestDetails model={m.model} rows={details[m.model]} loading={detailsLoading === m.model} onSelect={(detail) => setSelectedRequest({ model: m.model, detail })} />}</div>}</article> })}</div>}</section>
      {editingModel && resp && <PriceEditor model={editingModel === '__new__' ? '' : editingModel} existing={resp.pricing.models?.[editingModel] ?? undefined} suggestions={editingModel === '__new__' ? [...new Set([...(resp.unpriced ?? []), ...(resp.stats.models ?? []).map((m) => m.model)])] : []} onClose={() => setEditingModel(null)} onSaved={async (msg) => { setEditingModel(null); setNotice(msg); await load(true) }} />}
      {selectedRequest && <RequestDetailModal model={selectedRequest.model} detail={selectedRequest.detail} onClose={() => setSelectedRequest(null)} />}
    </div>
  )
}


/** RequestDetails 单个模型的最近请求列表；点击一条打开纵向详情。 */
function RequestDetails({
  model,
  rows,
  loading,
  onSelect,
}: {
  model: string
  rows?: RequestDetail[]
  loading: boolean
  onSelect: (detail: RequestDetail) => void
}) {
  if (loading && !rows) return <div style={{ padding: 16 }}><Spinner label="正在加载请求详情…" /></div>
  if (!rows || rows.length === 0) {
    return <div className="text-faint" style={{ padding: '14px 18px', fontSize: 12.5 }}>该模型暂无最近请求详情（保留最近 100 条，网关重启后保留）。</div>
  }
  return (
    <div style={{ padding: '12px 14px 16px' }}>
      <div className="card-head" style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 13 }}>最近请求 · {model}</h2>
        <span className="hint">点击任意一条记录查看日志详情 · 保留最近 100 条 · 网关重启后保留</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>时间 / 请求 ID</th>
              <th>状态</th>
              <th className="num">响应时间</th>
              <th>推理强度</th>
              <th className="num">总计 Token</th>
              <th>路径</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.seq} className="request-row" onClick={() => onSelect(d)} title="点击查看完整日志详情">
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div className="mono" style={{ fontSize: 11.5 }}>{fmtISO(d.started_at)}</div>
                  <div className="text-faint mono" style={{ fontSize: 10.5 }} title={d.request_id || d.trace_id || ''}>
                    {d.request_id || d.trace_id || ('#' + d.seq)}
                  </div>
                </td>
                <td>
                  <span className={d.ok ? 'text-ok' : 'text-danger'}>{d.status || '—'}</span>
                  <div className="text-faint" style={{ fontSize: 10.5 }}>{d.stream ? '流式' : '非流式'}</div>
                </td>
                <td className="num">
                  {fmtMs(d.latency_ms)}
                  <div className="text-faint" style={{ fontSize: 10.5 }}>
                    首字 {fmtMs(d.ttfb_ms)} · 生成 {fmtMs(d.gen_ms)}
                  </div>
                </td>
                <td>
                  {d.reasoning_effort || '未声明'}
                  <div className="text-faint" style={{ fontSize: 10.5 }}>{d.reasoning_summary || ''}</div>
                </td>
                <td className="num" title={fmtNum(d.total_tokens)}>{fmtNum(d.total_tokens)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div className="mono" style={{ fontSize: 11 }}>{d.endpoint || '—'}{d.fallback ? '（已回退）' : ''}</div>
                  <div className="text-faint" style={{ fontSize: 10.5 }}>{d.realm || '—'}</div>
                </td>
                <td style={{ width: 88, textAlign: 'right' }}>
                  <span className="request-detail-link">
                    {d.error_message ? <span className="text-danger">错误 · </span> : null}
                    查看详情
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** RequestDetailModal 单条请求的纵向日志详情，避免宽表右侧被截断。 */
function RequestDetailModal({
  model,
  detail,
  onClose,
}: {
  model: string
  detail: RequestDetail
  onClose: () => void
}) {
  const cacheTotal = detail.cache_hit_tokens + detail.cache_miss_tokens
  const cacheRate = cacheTotal > 0 ? detail.cache_hit_tokens / cacheTotal : 0
  const outputRate = detail.gen_ms > 0 ? detail.completion_tokens / (detail.gen_ms / 1000) : 0
  return (
    <Modal title="日志详情" wide className="request-detail-modal" onClose={onClose}>
      <div className="request-detail">
        <section className="request-detail-section">
          <h3>基本信息</h3>
          <dl className="kv request-detail-kv">
            <dt>请求 ID</dt>
            <dd className="mono">{detail.request_id || detail.trace_id || `#${detail.seq}`}</dd>
            <dt>模型</dt>
            <dd className="mono">{model}</dd>
            <dt>账号 / 分组</dt>
            <dd>{detail.account_uid ? detail.account_uid.slice(0, 8) : '—'} · {detail.realm || '—'}</dd>
            <dt>响应时间</dt>
            <dd className="text-ok">
              {fmtMs(detail.latency_ms)}
              {detail.ttfb_ms > 0 && <span className="text-faint">（首字 {fmtMs(detail.ttfb_ms)}）</span>}
            </dd>
            <dt>推理强度</dt>
            <dd className="text-warn">{detail.reasoning_effort || '未声明'}{detail.reasoning_summary ? ` · ${detail.reasoning_summary}` : ''}</dd>
            <dt>状态</dt>
            <dd className={detail.ok ? 'text-ok' : 'text-danger'}>
              {detail.status || '—'} · {detail.stream ? '流式' : '非流式'}
            </dd>
            <dt>入口路径</dt>
            <dd className="mono">{detail.endpoint || '—'}{detail.fallback ? '（已回退）' : ''} · 尝试 {detail.attempts || 1} 次</dd>
            <dt>结束原因</dt>
            <dd>{detail.finish_reason || '—'}</dd>
          </dl>
        </section>

        <section className="request-detail-section">
          <h3>Token 明细</h3>
          <dl className="request-detail-box request-detail-kv">
            <dt>输入 Token</dt>
            <dd>{fmtNum(detail.prompt_tokens)}</dd>
            <dt>缓存命中输入 Token</dt>
            <dd className="text-ok">{fmtNum(detail.cache_hit_tokens)}</dd>
            <dt>缓存未命中输入 Token</dt>
            <dd>{fmtNum(detail.cache_miss_tokens)}</dd>
            <dt>输出 Token</dt>
            <dd>{fmtNum(detail.completion_tokens)}</dd>
            <dt>推理 Token</dt>
            <dd className="text-warn">{fmtNum(detail.reasoning_tokens)}</dd>
            <dt>总计 Token</dt>
            <dd>{fmtNum(detail.total_tokens)}</dd>
          </dl>
        </section>

        <section className="request-detail-section">
          <h3>性能与计费</h3>
          <dl className="request-detail-box request-detail-kv">
            <dt>缓存命中率</dt>
            <dd className={hitTone(cacheRate)}>{fmtPct(cacheRate)}</dd>
            <dt>生成速度</dt>
            <dd>{outputRate > 0 ? `${outputRate.toFixed(1)} tok/s` : '—'}</dd>
            <dt>生成时长</dt>
            <dd>{fmtMs(detail.gen_ms)}</dd>
            <dt>扣费</dt>
            <dd>{fmtCredit(detail.credit)} 积分</dd>
            <dt>工具调用 / 图片</dt>
            <dd>{detail.tool_calls} / {detail.image_inputs}</dd>
            <dt>参数</dt>
            <dd>
              temperature {detail.temperature ?? '—'} · top_p {detail.top_p ?? '—'} · max {detail.max_output_tokens ? fmtNum(detail.max_output_tokens) : '—'}
            </dd>
          </dl>
        </section>

        {detail.error_message && (
          <section className="request-detail-section">
            <h3 className="text-danger">错误详情</h3>
            <div className="request-detail-error mono">
              {detail.error_code ? detail.error_code + ': ' : ''}{detail.error_message}
            </div>
          </section>
        )}
      </div>
    </Modal>
  )
}

/** PriceEditor 编辑单个模型的官方单价（元/百万 token）。 */
function PriceEditor({
  model: initialModel,
  existing,
  suggestions,
  onClose,
  onSaved,
}: {
  model: string
  existing?: ModelPrice
  suggestions: string[]
  onClose: () => void
  onSaved: (msg: string) => Promise<void>
}) {
  const [model, setModel] = useState(initialModel)
  const [cached, setCached] = useState(existing ? String(existing.cached_input) : '')
  const [miss, setMiss] = useState(existing ? String(existing.miss_input) : '')
  const [output, setOutput] = useState(existing ? String(existing.output) : '')
  const [offPeak, setOffPeak] = useState(existing?.off_peak_ratio ? String(existing.off_peak_ratio) : '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!model.trim()) {
      setError('模型名不能为空')
      return
    }
    const num = (s: string) => (s.trim() === '' ? 0 : Number(s))
    const c = num(cached)
    const mi = num(miss)
    const o = num(output)
    if ([c, mi, o].some((v) => Number.isNaN(v) || v < 0)) {
      setError('单价必须是非负数字')
      return
    }
    if (c === 0 && mi === 0 && o === 0) {
      setError('至少填写一个非零单价（全 0 会被视为未配置）')
      return
    }
    setBusy(true)
    try {
      const r = await api.savePrice({
        model: model.trim(),
        cached_input: c,
        miss_input: mi,
        output: o,
        off_peak_ratio: num(offPeak),
        note: note.trim(),
      })
      await onSaved(r.message || '价格已保存')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={initialModel ? `编辑价格 · ${initialModel}` : '添加模型价格'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
            {busy ? <Spinner /> : null}
            保存
          </button>
        </>
      }
    >
      {error && <Alert kind="error">{error}</Alert>}
      <div className="field">
        <label>模型名（填网关里的模型 ID）</label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="例如 glm-5.3"
          list="price-model-suggestions"
          disabled={!!initialModel}
        />
        {suggestions.length > 0 && (
          <>
            <datalist id="price-model-suggestions">
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="desc">
              待配置：
              {suggestions.slice(0, 8).map((s) => (
                <button
                  key={s}
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '0 5px', fontSize: 11 }}
                  onClick={() => setModel(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>缓存命中输入（元/百万）</label>
          <input type="text" value={cached} onChange={(e) => setCached(e.target.value)} placeholder="0.04" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>缓存未命中输入（元/百万）</label>
          <input type="text" value={miss} onChange={(e) => setMiss(e.target.value)} placeholder="2" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>输出（元/百万）</label>
          <input type="text" value={output} onChange={(e) => setOutput(e.target.value)} placeholder="8" />
        </div>
      </div>

      <div className="field">
        <label>空闲时段价倍数（可选）</label>
        <input type="text" value={offPeak} onChange={(e) => setOffPeak(e.target.value)} placeholder="留空 = 不区分时段；DeepSeek 填 0.5" />
        <div className="desc">用于"空闲时段价"换算。填 0.5 表示空闲价是高峰价的一半。</div>
      </div>

      <div className="field" style={{ marginBottom: 0 }}>
        <label>备注（可选）</label>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="价格来源 / 口径说明" />
      </div>

      <div className="desc" style={{ marginTop: 12 }}>
        单价单位是<strong>元 / 百万 token</strong>，请以厂商官网定价页为准。
        缓存命中价通常远低于未命中（DeepSeek 相差 50 倍），分开填写才能算准。
      </div>
    </Modal>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'ok' | 'warn' | 'danger'
}) {
  const cls = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : ''
  return (
    <div className="summary-item">
      <div className="summary-label">{label}</div>
      <div className={`summary-value small ${cls}`}>{value}</div>
      {sub && <div className="summary-sub">{sub}</div>}
    </div>
  )
}