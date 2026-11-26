import { createContext, useContext } from 'react'
import type { AuthUser } from './api'

type AuthContextValue = { user: AuthUser; signOut: () => Promise<void> }

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.')
  return value
}
