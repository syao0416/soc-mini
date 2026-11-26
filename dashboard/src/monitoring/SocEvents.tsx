import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import './soc-events.css'

type ReviewStatus = 'new' | 'investigating' | 'resolved' | 'false_positive'
type EventRow = {
  event_id: string
  event_time: string | null
  source_vm: string
  log_type: string
  event_type: string
  severity: string
  src_ip: string | null
  dst_ip: string | null
  message: string | null
  review_status: ReviewStatus; review_note?: string
}
type EventDetail = EventRow & { raw_log: string; details: unknown; severity_reason: string | null }
type ResponseItem = {
  id: number; event_id: string; target_ip: string; action: string; reason: string
  status: 'pending' | 'approved' | 'rejected'; created_by: string; executed: boolean
}

type EventsResult = { total: number; results: EventRow[] }
type Stats = { total_events: number; by_log_type: Record<string, number>; by_severity: Record<string, number>; by_source_vm: Record<string, number> }

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, credentials: 'same-origin' })
  const result = await response.json().catch(() => ({})) as { detail?: string }
  if (!response.ok) throw new Error(result.detail ?? `API 오류 (${response.status})`)
  return result as T
}
async function csrf(): Promise<string> {
  const result = await req<{ csrfToken: string }>('/api/auth/csrf/')
  return result.csrfToken
}
async function post<T>(url: string, body: object): Promise<T> {
  const token = await csrf()
  return req<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token },
    body: JSON.stringify(body),
  })
}
const statuses: { value: ReviewStatus; title: string }[] = [
  { value: 'new', title: '신규' },
  { value: 'investigating', title: '분석 중' },
  { value: 'resolved', title: '처리 완료' },
  { value: 'false_positive', title: '오탐' },
]
const labelStatus = (status: string) => statuses.find(s => s.value === status)?.title ?? status

export function SocEvents() {
  const { user, signOut } = useAuth()
  const [list, setList] = useState<EventRow[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [selected, setSelected] = useState<EventDetail | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<ReviewStatus>('new')
  const [responses, setResponses] = useState<ResponseItem[]>([])
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' })
    if (typeFilter) params.set('log_type', typeFilter)
    if (search) params.set('q', search)
    const [events, summary, requests] = await Promise.all([
      req<EventsResult>(`/api/events/?${params}`),
      req<Stats>('/api/events/stats/'),
      req<{ results: ResponseItem[] }>('/api/responses/'),
    ])
    setList(events.results)
    setTotal(events.total)
    setStats(summary)
    setResponses(requests.results)
  }, [typeFilter, search])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams({ limit: '50' })
    if (typeFilter) params.set('log_type', typeFilter)
    if (search) params.set('q', search)
    Promise.all([
      req<EventsResult>(`/api/events/?${params}`),
      req<Stats>('/api/events/stats/'),
      req<{ results: ResponseItem[] }>('/api/responses/'),
    ])
      .then(([events, summary, requests]) => {
        if (!active) return
        setList(events.results)
        setTotal(events.total)
        setStats(summary)
        setResponses(requests.results)
        setError('')
      })
      .catch(e => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [typeFilter, search])

  const choose = async (eventId: string) => {
    setFeedback('')
    setError('')
    try {
      const detail = await req<EventDetail>(`/api/events/${eventId}/`)
      setSelected(detail)
      setStatus(detail.review_status)
      setNote(detail.review_note ?? '')
    } catch (e) { setError(String(e)) }
  }
  const saveReview = async () => {
    if (!selected) return
    setBusy(true)
    try {
      await post(`/api/events/${selected.event_id}/review/`, { status, note })
      await choose(selected.event_id)
      await load()
      setFeedback('처리 상태가 MariaDB에 저장됐습니다.')
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  const createResponse = async () => {
    if (!selected?.src_ip) { setError('이벤트에 출발지 IP가 없어.'); return }
    if (!window.confirm(`${selected.src_ip} 차단 검토를 요청할까요? 실제 차단은 실행되지 않습니다.`)) return
    setBusy(true)
    try {
      await post('/api/responses/', { event_id: selected.event_id, target_ip: selected.src_ip, action: 'block', reason: note || selected.message || '관제 검토' })
      await load()
      setFeedback('차단 검토 요청이 MariaDB에 저장됐습니다. 실제 방화벽은 변경되지 않았습니다.')
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  const decide = async (id: number, decision: 'approved' | 'rejected') => {
    setBusy(true)
    try {
      await post(`/api/responses/${id}/decision/`, { decision })
      await load()
      setFeedback('승인·반려 이력이 저장됐습니다. 실제 방화벽 명령은 실행되지 않았습니다.')
    } catch (e) { setError(String(e)) } finally { setBusy(false) }
  }
  return <div className="soc-events-page">
    <div className="soc-events-header">
      <div><small>VIOLET SOC / LIVE DATA TEST</small><h1>실제 SOC 이벤트 조회</h1><p>VM4 덤프에서 가져온 데이터 · 자동 갱신되는 실시간 스트림이 아니라 백업 시점의 스냅샷</p></div>
      <div><b>{user.username}</b> ({user.role}) <button onClick={() => void signOut()}>로그아웃</button><a href="/">기존 대시보드</a></div>
    </div>
    {error && <p className="soc-event-error">{error}</p>}
    {feedback && <p className="soc-event-feedback">{feedback}</p>}
    <div className="soc-event-stats">
      <div><small>전체 로그</small><strong>{stats?.total_events ?? '—'}</strong></div>
      <div><small>Snort</small><strong>{stats?.by_log_type.snort ?? '—'}</strong></div>
      <div><small>iptables</small><strong>{stats?.by_log_type.iptables ?? '—'}</strong></div>
      <div><small>MariaDB</small><strong>{stats?.by_log_type.mariadb ?? '—'}</strong></div>
    </div>
    <div className="soc-event-toolbar">
      <input placeholder="IP, 메시지, 이벤트 검색" value={search} onChange={e => setSearch(e.target.value)} />
      <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
        <option value="">전체 로그</option>
        {['snort', 'iptables', 'auditd', 'mariadb', 'dvwa'].map(type => <option key={type}>{type}</option>)}
      </select>
      <button onClick={() => void load().catch(e => setError(String(e)))}>새로고침</button>
      <span>검색 결과 {total}건 · 최대 50건 표시</span>
    </div>
    <div className="soc-events-grid">
      <section className="soc-events-card">
        <h2>수집된 이벤트</h2>
        <div className="soc-events-overflow"><table><thead><tr><th>발생 시간</th><th>출처</th><th>종류</th><th>위험도</th><th>출발지 IP</th><th>메시지</th><th>상태</th></tr></thead>
          <tbody>{list.map(row => <tr key={row.event_id} onClick={() => void choose(row.event_id)} className={selected?.event_id === row.event_id ? 'chosen' : ''}>
            <td>{row.event_time ? new Date(row.event_time).toLocaleString('ko-KR') : '—'}</td>
            <td>{row.source_vm}</td><td>{row.log_type}</td><td>{row.severity}</td><td>{row.src_ip ?? '—'}</td><td>{row.message ?? row.event_type}</td><td>{labelStatus(row.review_status)}</td>
          </tr>)}</tbody></table></div>
        {!list.length && !error && <p>표시할 로그가 없습니다.</p>}
      </section>
      <section className="soc-events-card">
        <h2>이벤트 상세·처리</h2>
        {!selected ? <p>왼쪽에서 로그를 선택해 주세요.</p> : <>
          <p><b>이벤트 ID</b> {selected.event_id}</p>
          <p><b>출발지 IP</b> {selected.src_ip || '없음'} / <b>목적지</b> {selected.dst_ip || '없음'}</p>
          <p><b>탐지 내용</b> {selected.message}</p>
          <label>처리 상태<select value={status} onChange={e => setStatus(e.target.value as ReviewStatus)}>{statuses.map(s => <option value={s.value} key={s.value}>{s.title}</option>)}</select></label>
          <label>분석 메모<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={2000} rows={3} /></label>
          <div className="soc-event-actions"><button disabled={busy} onClick={() => void saveReview()}>처리 상태 DB 저장</button><button disabled={busy || !selected.src_ip} onClick={() => void createResponse()}>차단 검토 요청</button></div>
          <h3>정규화 상세</h3><pre>{JSON.stringify(selected.details, null, 2)}</pre>
          <h3>원본 로그</h3><pre>{selected.raw_log}</pre>
        </>}
      </section>
    </div>
    <section className="soc-events-card">
      <h2>차단 검토 및 승인 이력 (실제 방화벽 변경 없음)</h2>
      <div className="soc-events-overflow"><table><thead><tr><th>요청 ID</th><th>출발지 IP</th><th>조치</th><th>상태</th><th>요청자</th><th>검토</th></tr></thead><tbody>
        {responses.map(r => <tr key={r.id}><td>{r.id}</td><td>{r.target_ip}</td><td>{r.action}</td><td>{r.status}</td><td>{r.created_by}</td><td>{r.status === 'pending' && user.role === 'admin' ? <span className="soc-event-actions"><button disabled={busy} onClick={() => void decide(r.id, 'approved')}>승인</button><button disabled={busy} onClick={() => void decide(r.id, 'rejected')}>반려</button></span> : '—'}</td></tr>)}
      </tbody></table></div>
    </section>
  </div>
}
