import { useState, type FormEvent } from 'react'
import { LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'

type Props = {
  onLogin: (username: string, password: string) => Promise<void>
  serverError: string
}

export function LoginScreen({ onLogin, serverError }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try { await onLogin(username, password) }
    catch (err) { setError(err instanceof Error ? err.message : '로그인에 실패했어요.') }
    finally { setBusy(false) }
  }

  return (
    <div className="soc-auth-page">
      <main className="soc-auth-card">
        <div className="soc-auth-brand"><span className="soc-auth-brand-icon"><ShieldCheck size={25} /></span><span><strong>JIKIMI</strong></span></div>
        <div className="soc-auth-kicker">SECURITY OPERATIONS CENTER</div>
        <h1>LOGIN</h1>
        <p className="soc-auth-description">관제 요원 계정으로 로그인해 주세요.</p>
        <form onSubmit={submit} className="soc-auth-form">
          <label htmlFor="soc-user"><UserRound size={17} /> 사용자 ID</label>
          <input id="soc-user" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="아이디" required />
          <label htmlFor="soc-pass"><LockKeyhole size={17} /> 비밀번호</label>
          <input id="soc-pass" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="비밀번호" required />
          {(error || serverError) && <p className="soc-auth-error" role="alert">{error || serverError}</p>}
          <button className="soc-auth-submit" type="submit" disabled={busy}>{busy ? '로그인 중...' : 'SOC 대시보드 로그인'}</button>
        </form>
        <p className="soc-auth-note">관리자가 발급한 계정만 이용할 수 있습니다.</p>
      </main>
    </div>
  )
}
