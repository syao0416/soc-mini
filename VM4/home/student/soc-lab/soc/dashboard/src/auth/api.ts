export type AuthUser = {
  id: number
  username: string
  role: 'admin' | 'analyst'
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function message(data: Record<string, unknown>, fallback: string): string {
  return typeof data.detail === 'string' ? data.detail : fallback
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me/', { credentials: 'same-origin' })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('로그인 상태를 확인할 수 없어요. Django 서버를 확인해 줘.')
  const data = await readJson(response)
  return data.user as AuthUser
}

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/auth/csrf/', { credentials: 'same-origin' })
  if (!response.ok) throw new Error('CSRF 토큰을 가져올 수 없어요.')
  const data = await readJson(response)
  if (typeof data.csrfToken !== 'string') throw new Error('CSRF 토큰 응답이 올바르지 않아요.')
  return data.csrfToken
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  const token = await csrfToken()
  const response = await fetch('/api/auth/login/', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': token },
    body: JSON.stringify({ username, password }),
  })
  const data = await readJson(response)
  if (!response.ok) throw new Error(message(data, '로그인에 실패했어요.'))
  return data.user as AuthUser
}

export async function logoutUser(): Promise<void> {
  const token = await csrfToken()
  const response = await fetch('/api/auth/logout/', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'X-CSRFToken': token },
  })
  if (!response.ok) throw new Error('로그아웃 요청에 실패했어요.')
}
