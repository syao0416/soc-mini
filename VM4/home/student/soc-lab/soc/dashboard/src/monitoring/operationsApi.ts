export type OperationsSettings = {
  mail_enabled: boolean
  recipients: string
  min_severity: number
  protected_networks: string
  smtp_configured: boolean
  smtp_host: string
  smtp_sender: string
  smtp_port: number
  firewall_execution_enabled: boolean
  firewall_note: string
}

async function jsonOrEmpty(r: Response): Promise<Record<string, unknown>> {
  try { return await r.json() as Record<string, unknown> } catch { return {} }
}

async function token(): Promise<string> {
  const res = await fetch('/api/auth/csrf/', {credentials: 'same-origin'})
  const data = await jsonOrEmpty(res)
  if (!res.ok || typeof data.csrfToken !== 'string') throw new Error('인증 토큰을 가져오지 못했습니다. 다시 로그인해 주세요.')
  return data.csrfToken
}

async function operationsFetch(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', payload?: unknown) {
  const headers: Record<string, string> = {}
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['X-CSRFToken'] = await token()
  }
  const res = await fetch(`/api/operations/${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    ...(method !== 'GET' ? {body: JSON.stringify(payload)} : {}),
  })
  const data = await jsonOrEmpty(res)
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `요청에 실패했습니다. (${res.status})`)
  return data
}

export async function loadOperationsSettings(): Promise<OperationsSettings> {
  return await operationsFetch('settings/') as unknown as OperationsSettings
}
export async function saveOperationsSettings(data: Pick<OperationsSettings,'mail_enabled'|'recipients'|'min_severity'|'protected_networks'>): Promise<OperationsSettings> {
  return await operationsFetch('settings/', 'PUT', data) as unknown as OperationsSettings
}
export async function sendSmtpTest(email: string): Promise<string> {
  const result = await operationsFetch('test-email/', 'POST', {email})
  return String(result.detail ?? '테스트 메일 발송 요청을 완료했습니다.')
}
export async function previewBlock(ip: string): Promise<{eligible:boolean;reason:string;executed:boolean}> {
  return await operationsFetch('block-preview/', 'POST', {ip}) as unknown as {eligible:boolean;reason:string;executed:boolean}
}
