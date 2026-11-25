import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getCurrentUser, loginUser, logoutUser, type AuthUser } from './api'
import { LoginScreen } from './LoginScreen'
import './auth.css'

type AuthContextValue = { user: AuthUser; signOut: () => Promise<void> }
const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    getCurrentUser()
      .then((current) => { if (live) setUser(current) })
      .catch(() => { if (live) setError('Django API에 연결되지 않았어요. Docker 컨테이너를 확인해 줘.') })
      .finally(() => { if (live) setChecking(false) })
    return () => { live = false }
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    setError('')
    const current = await loginUser(username, password)
    setUser(current)
  }, [])

  const signOut = useCallback(async () => {
    await logoutUser()
    setUser(null)
  }, [])

  if (checking) return <div className="soc-auth-page"><p className="soc-auth-loading">사용자 정보를 확인하고 있어요...</p></div>
  if (!user) return <LoginScreen onLogin={signIn} serverError={error} />
  return <AuthContext.Provider value={{ user, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.')
  return value
}
