/** Read the real VM4 snapshot through the authenticated Django API. */
export type ReviewStatus = 'new' | 'investigating' | 'resolved' | 'false_positive'
export type SocEvent = {
  event_id: string; event_time: string | null; source_vm: string; source_tag: string | null;
  log_type: string; event_category: string; event_type: string; severity: string;
  severity_level: number; src_ip: string | null; src_port: number | null;
  dst_ip: string | null; dst_port: number | null; protocol: string | null;
  message: string | null; review_status: ReviewStatus; review_note?: string;
  reviewed_by: number | null; reviewed_at: string | null;
}
export type SocEventDetail = SocEvent & { raw_log: string; details: unknown; severity_reason: string | null }
export type SocStats = {
  total_events: number; by_log_type: Record<string, number>;
  by_severity: Record<string, number>; by_source_vm: Record<string, number>;
  review_records: number;
}
export type ResponseItem = {
  id: number; event_id: string; target_ip: string; action: 'block' | 'unblock';
  reason: string; status: 'pending' | 'approved' | 'rejected'; created_by: string;
  created_at: string; decided_by: string | null; decided_at: string | null; executed: boolean;
}
type EventList = {total: number; results: SocEvent[]; offset: number; limit: number}

async function read<T>(path: string, opts?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opts })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'detail' in body
      ? String((body as { detail: unknown }).detail)
      : `API 연결 실패 (${response.status})`
    throw new Error(message)
  }
  return body as T
}
async function submit<T>(path: string, body: object): Promise<T> {
  const { csrfToken } = await read<{ csrfToken: string }>('/api/auth/csrf/')
  return read<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
    body: JSON.stringify(body),
  })
}
export const listEvents = (options: { limit?: number; offset?: number; q?: string; log_type?: string; source_vm?: string; severity?: string } = {}) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(options)) if (value !== undefined && value !== '') params.set(key, String(value))
  return read<EventList>(`/api/events/?${params.toString()}`)
}
export const getStats = () => read<SocStats>('/api/events/stats/')
export const getEvent = (id: string) => read<SocEventDetail>(`/api/events/${encodeURIComponent(id)}/`)
export const getResponses = () => read<{results: ResponseItem[]}>('/api/responses/')
export const reviewEvent = (id: string, status: ReviewStatus, note: string) =>
  submit<{ok: boolean}>(`/api/events/${encodeURIComponent(id)}/review/`, { status, note })
export const requestBlock = (event_id: string, target_ip: string, reason: string) =>
  submit<ResponseItem>('/api/responses/', { event_id, target_ip, action: 'block', reason })
export const decideResponse = (id: number, decision: 'approved' | 'rejected') =>
  submit<ResponseItem>(`/api/responses/${id}/decision/`, {decision})

/** Overview pagination prevents pretending that the first 50 rows are the entire dataset. */
export async function getOverview(maxRows = 2000): Promise<{ rows: SocEvent[]; total: number; capped: boolean }> {
  const rows: SocEvent[] = []
  let total = 0
  while (rows.length < maxRows) {
    const page = await listEvents({ limit: Math.min(100, maxRows - rows.length), offset: rows.length })
    total = page.total
    rows.push(...page.results)
    if (page.results.length === 0 || rows.length >= total) break
  }
  return { rows, total, capped: rows.length < total }
}
export const dateText = (value: string | null) => value ? value.replace('T', ' ').slice(0,19) : '—'
export const statusLabel = (v: ReviewStatus) => ({new:'신규',investigating:'분석 중',resolved:'처리 완료',false_positive:'오탐'}[v])
export const responseLabel = (v: ResponseItem['status']) => ({ pending:'승인 대기', approved:'승인',rejected:'반려'}[v])
export const riskColor = (risk: string) => ({critical:'#ff6686',high:'#ff829d',medium:'#ffce91',low:'#99d8ff',info:'#d1c5ff'} as Record<string,string>)[risk.toLowerCase()] ?? '#e1cfff'
export const typeColor = (t: string) => ({snort:'#8ee7d7',iptables:'#ffdaaa',auditd:'#baaaff',dvwa:'#ffadc5',mariadb:'#9bcfff'} as Record<string,string>)[t] ?? '#e6d9ff'
export const eventTitle = (e: SocEvent) => e.message || e.event_type || '이벤트'
