export type ManagedUser = {
  id: number
  username: string
  first_name: string
  email: string
  role: 'admin' | 'analyst'
  is_active: boolean
  is_self: boolean
  last_login: string | null
}

type ApiJson = Record<string, unknown>

async function parseResponse(response: Response): Promise<ApiJson> {
  try { return (await response.json()) as ApiJson }
  catch { return {} }
}

async function csrf(): Promise<string> {
  const result = await fetch('/api/auth/csrf/', { credentials: 'same-origin' })
  const data = await parseResponse(result)
  if (!result.ok || typeof data.csrfToken !== 'string') throw new Error('CSRF 토큰을 확인할 수 없습니다.')
  return data.csrfToken
}

async function request(path: string, method: 'GET' | 'POST' | 'PATCH', body?: ApiJson): Promise<ApiJson> {
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['X-CSRFToken'] = await csrf()
  const response = await fetch(path, {
    method, credentials: 'same-origin', headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const data = await parseResponse(response)
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : `요청에 실패했습니다. (${response.status})`)
  }
  return data
}

export async function listUsers(): Promise<ManagedUser[]> {
  const result = await request('/api/auth/users/', 'GET')
  return result.users as ManagedUser[]
}

export async function createUser(data: {
  username: string; password: string; email: string; first_name: string; role: 'admin' | 'analyst'
}): Promise<ManagedUser> {
  const result = await request('/api/auth/users/', 'POST', data)
  return result.user as ManagedUser
}

export async function updateUser(userId: number, values: Partial<Pick<ManagedUser, 'role' | 'is_active' | 'first_name' | 'email'>>): Promise<ManagedUser> {
  const result = await request(`/api/auth/users/${userId}/`, 'PATCH', values)
  return result.user as ManagedUser
}

export async function resetPassword(userId: number, password: string): Promise<void> {
  await request(`/api/auth/users/${userId}/reset-password/`, 'POST', { password })
}
