import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Plus, RefreshCw, Save, Server, Trash2, Zap } from 'lucide-react'
import { api, ApiError } from '../api'
import type { SessionInfo } from '../types'
import { Alert, Spinner } from '../ui'

export interface ProviderModel { id: string; name?: string; owned_by?: string }
export interface Provider { name: string; base_url: string; api_key: string; protocol: string; test_model?: string; models?: ProviderModel[] }
const emptyProvider = (): Provider => ({ name: '', base_url: '', api_key: '', protocol: 'chat_completions', test_model: '', models: [] })

export default function Providers({ session }: { session: SessionInfo }) {
  const [items, setItems] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [testing, setTesting] = useState<number | null>(null)
  const [fetching, setFetching] = useState<number | null>(null)
  const [newModel, setNewModel] = useState<Record<number, string>>({})
  const writeDisabled = session.read_only

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await api.providers(); setItems(res.providers ?? []); setError(null) }
    catch (err) { setError(err instanceof ApiError ? err.message : '加载供应商失败') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const patch = (index: number, key: keyof Provider, value: string) => setItems((prev) => prev.map((item, i) => i === index ? { ...item, [key]: value } : item))
  const add = () => setItems((prev) => [...prev, emptyProvider()])
  const remove = (index: number) => setItems((prev) => prev.filter((_, i) => i !== index))

  const modelsOf = (index: number) => items[index]?.models ?? []
  const setModels = (index: number, models: ProviderModel[]) =>
    setItems((prev) => prev.map((item, i) => i === index ? { ...item, models } : item))
  const removeModel = (index: number, id: string) => setModels(index, modelsOf(index).filter((m) => m.id !== id))
  const renameModel = (index: number, id: string, name: string) =>
    setModels(index, modelsOf(index).map((m) => m.id === id ? { ...m, name } : m))
  const addModel = (index: number) => {
    const id = (newModel[index] ?? '').trim()
    if (!id) return
    const list = modelsOf(index)
    if (list.some((m) => m.id === id)) { setError(`模型 ${id} 已存在`); return }
    setModels(index, [...list, { id, name: id }])
    setNewModel((prev) => ({ ...prev, [index]: '' }))
  }

  const testConnection = async (index: number) => {
    const provider = items[index]
    if (!provider?.name.trim() || !provider.base_url.trim()) { setError('请先填写供应商名称和 Base URL'); return }
    setTesting(index); setError(null); setNotice(null)
    try {
      const res = await api.providerTest(provider)
      setNotice(res.message)
    } catch (err) { setError(err instanceof ApiError ? err.message : '测试连接失败') }
    finally { setTesting(null) }
  }

  const fetchModels = async (index: number) => {
    const provider = items[index]
    if (!provider?.name.trim() || !provider.base_url.trim()) { setError('请先填写供应商名称和 Base URL'); return }
    setFetching(index); setError(null); setNotice(null)
    try {
      const res = await api.providerModels(provider)
      setModels(index, res.models ?? [])
      setNotice(`“${provider.name}”获取到 ${res.count} 个模型，点“保存”后生效`)
    } catch (err) { setError(err instanceof ApiError ? err.message : '获取模型失败') }
    finally { setFetching(null) }
  }

  const save = async (restart = false) => {
    setSaving(true); setError(null); setNotice(null)
    try {
      const res = await api.saveProviders(items)
      if (restart) { const rr = await api.restart(); setNotice(rr.message) } else setNotice(res.message)
      await load()
    } catch (err) { setError(err instanceof ApiError ? err.message : '保存失败') }
    finally { setSaving(false) }
  }

  if (loading && items.length === 0) return <Spinner label="正在读取供应商配置…" />

  return (
    <div className="ios-page">
      <header className="ios-page-title">
        <div><h1>供应商</h1><p>接入任意 OpenAI 兼容供应商，模型统一从网关调用。</p></div>
        <div className="ios-toolbar"><button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />刷新</button><button className="btn" onClick={add} disabled={writeDisabled}><Plus size={16} />添加供应商</button><button className="btn btn-primary" onClick={() => void save(false)} disabled={writeDisabled || saving}><Save size={16} />保存</button></div>
      </header>
      {notice && <Alert kind="ok" onClose={() => setNotice(null)}>{notice}</Alert>}
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {items.length === 0 ? <section className="ios-group"><div className="ios-empty-row"><Server size={18} />暂无供应商。点击右上角“添加供应商”开始配置。</div></section> : items.map((item, index) => (
        <section className="ios-group" key={`${index}-${item.name}`}>
          <div className="ios-group-head"><h2>{item.name || `供应商 ${index + 1}`}</h2><button className="ios-text-button" onClick={() => remove(index)} disabled={writeDisabled}><Trash2 size={14} />删除</button></div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 180px' }}><label>名称</label><input value={item.name} onChange={(e) => patch(index, 'name', e.target.value)} placeholder="deepseek" disabled={writeDisabled} /><div className="desc">调用模型时使用：名称:模型名</div></div>
            <div className="field" style={{ flex: '2 1 320px' }}><label>Base URL</label><input value={item.base_url} onChange={(e) => patch(index, 'base_url', e.target.value)} placeholder="https://api.deepseek.com/v1" disabled={writeDisabled} /><div className="desc">OpenAI 兼容接口根地址，通常以 /v1 结尾。</div></div>
            <div className="field" style={{ flex: '1 1 220px' }}><label>API Key</label><input type="password" value={item.api_key} onChange={(e) => patch(index, 'api_key', e.target.value)} placeholder="sk-..." disabled={writeDisabled} /></div>
            <div className="field" style={{ flex: '0 1 190px' }}><label>上游协议</label><select value={item.protocol} onChange={(e) => patch(index, 'protocol', e.target.value)} disabled={writeDisabled}><option value="chat_completions">Chat Completions</option><option value="responses">Responses API</option></select></div>
          </div>
          <div className="row" style={{ paddingTop: 0 }}>
            <button className="btn" onClick={() => void testConnection(index)} disabled={testing === index}>{testing === index ? <Spinner /> : <Zap size={15} />}测试连接</button>
            <button className="btn" onClick={() => void fetchModels(index)} disabled={fetching === index}>{fetching === index ? <Spinner /> : <RefreshCw size={15} />}获取模型</button>
          </div>
          <div className="row" style={{ paddingTop: 0 }}>
            <div className="field" style={{ flex: '1 1 320px' }}><label>测试模型名（可选）</label><input value={item.test_model ?? ''} onChange={(e) => patch(index, 'test_model', e.target.value)} placeholder="例如 deepseek-chat；留空只测 /models" /><div className="desc">连接测试会尝试调用这个模型；不填则只验证模型列表接口。</div></div>
          </div>

          <div className="ios-list">
            <div className="ios-group-title">已保存模型 {modelsOf(index).length} 个（显示名用于聊天列表，保存后生效）</div>
            {modelsOf(index).length === 0 && <div className="ios-empty-row">暂无模型。点“获取模型”拉取，或在下方手动添加。</div>}
            {modelsOf(index).map((m) => (
              <div className="ios-list-row" key={m.id}>
                <CheckCircle2 size={16} className="text-ok" />
                <div className="ios-list-main">
                  <strong>{m.name || m.id}</strong>
                  <span>{m.id}</span>
                </div>
                <input style={{ maxWidth: 220 }} value={m.name ?? ''} placeholder={m.id} onChange={(e) => renameModel(index, m.id, e.target.value)} disabled={writeDisabled} />
                <span className="ios-list-value mono">{item.name}:{m.name || m.id}</span>
                <button className="ios-text-button" onClick={() => removeModel(index, m.id)} disabled={writeDisabled}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="ios-list-row">
              <Plus size={15} />
              <input style={{ flex: 1 }} value={newModel[index] ?? ''} placeholder="手动添加模型 ID，例如 claude-opus-5-5" onChange={(e) => setNewModel((prev) => ({ ...prev, [index]: e.target.value }))} disabled={writeDisabled} />
              <button className="btn btn-sm" onClick={() => addModel(index)} disabled={writeDisabled}>添加</button>
            </div>
          </div>
        </section>
      ))}
      <section className="ios-group"><div className="ios-group-head"><h2>保存与生效</h2></div><div className="ios-key-list"><div><dt>保存</dt><dd>写入网关 config.json，不中断当前请求。</dd></div><div><dt>生效</dt><dd>重启网关后，保存的模型出现在聊天列表。</dd></div></div><div className="row" style={{ paddingTop: 0 }}><button className="btn btn-primary" onClick={() => void save(true)} disabled={writeDisabled || saving || !session.dangerous_ops}><Zap size={16} />保存并重启网关</button></div></section>
    </div>
  )
}
