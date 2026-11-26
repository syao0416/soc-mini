import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, KeyRound, RefreshCw, Search, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { useAuth } from './AuthContext'
import { createUser, listUsers, resetPassword, updateUser, type ManagedUser } from './adminApi'
import './user-management.css'

export function UserManagement({ onClose }: { onClose: () => void }) {
  const { user: self } = useAuth()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ username: '', first_name: '', email: '', password: '', role: 'analyst' as 'admin' | 'analyst' })
  const [resetId, setResetId] = useState<number | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    setLoading(true)
    try { setUsers(await listUsers()) }
    catch (ex) { setError(ex instanceof Error ? ex.message : '사용자를 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    let active = true
    listUsers()
      .then(result => { if (active) { setUsers(result); setError('') } })
      .catch(ex => { if (active) setError(ex instanceof Error ? ex.message : '사용자를 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const keydown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [onClose])

  const visible = useMemo(() => users.filter(u => [u.username, u.first_name, u.email]
    .some(value => value.toLowerCase().includes(search.toLowerCase().trim()))), [users, search])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!window.confirm(`${form.username} 계정을 ${form.role === 'admin' ? '관리자' : '관제 요원'}로 생성할까요?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const user = await createUser(form)
      setUsers(prev => [...prev, user].sort((a, b) => a.id - b.id))
      setForm({ username: '', first_name: '', email: '', password: '', role: 'analyst' })
      setNotice(`${user.username} 계정을 생성했습니다.`)
    } catch (ex) { setError(ex instanceof Error ? ex.message : '계정 생성 실패') }
    finally { setBusy(false) }
  }

  async function onChangeRole(user: ManagedUser, role: 'admin' | 'analyst') {
    if (user.role === role) return
    if (!window.confirm(`${user.username}의 권한을 ${role === 'admin' ? '관리자' : '관제 요원'}로 변경할까요?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const changed = await updateUser(user.id, { role })
      setUsers(prev => prev.map(u => u.id === changed.id ? changed : u))
      setNotice('권한을 변경했습니다.')
    } catch (ex) { setError(ex instanceof Error ? ex.message : '권한 변경 실패') }
    finally { setBusy(false) }
  }

  async function onToggleActive(user: ManagedUser) {
    const next = !user.is_active
    if (!window.confirm(`${user.username} 계정을 ${next ? '활성화' : '비활성화'}할까요?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const changed = await updateUser(user.id, { is_active: next })
      setUsers(prev => prev.map(u => u.id === changed.id ? changed : u))
      setNotice(`${user.username} 계정이 ${next ? '활성화' : '비활성화'}되었습니다.`)
    } catch (ex) { setError(ex instanceof Error ? ex.message : '상태 변경 실패') }
    finally { setBusy(false) }
  }

  async function onReset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (resetId == null) return
    const target = users.find(u => u.id === resetId)
    if (!window.confirm(`${target?.username ?? '사용자'}의 비밀번호를 변경할까요?`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      await resetPassword(resetId, newPassword)
      setResetId(null); setNewPassword('')
      setNotice('비밀번호가 변경되었습니다. 사용자에게 안전한 방법으로 전달해 주세요.')
    } catch (ex) { setError(ex instanceof Error ? ex.message : '비밀번호 변경 실패') }
    finally { setBusy(false) }
  }

  return createPortal(
    <div className="soc-admin-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <section className="soc-admin-dialog" role="dialog" aria-modal="true" aria-label="사용자 관리">
        <header className="soc-admin-header">
          <div><div className="soc-admin-eyebrow"><ShieldCheck size={14} /> ADMINISTRATOR ONLY</div><h2><Users size={24} /> 사용자 관리</h2><p>관제 요원 계정을 발급하고 접근 권한을 관리합니다.</p></div>
          <button type="button" className="soc-admin-close" onClick={onClose} aria-label="닫기"><X size={20}/></button>
        </header>
        {error && <p className="soc-admin-feedback soc-admin-error" role="alert">{error}</p>}
        {notice && <p className="soc-admin-feedback soc-admin-success" role="status"><Check size={15}/>{notice}</p>}
        <div className="soc-admin-layout">
          <section className="soc-admin-panel">
            <h3><UserPlus size={18}/> 새 사용자 추가</h3>
            <form className="soc-admin-form" onSubmit={onCreate}>
              <label>사용자 ID<input value={form.username} onChange={e => setForm(s => ({ ...s, username: e.target.value }))} required maxLength={150} autoComplete="off" /></label>
              <label>표시 이름 (선택)<input value={form.first_name} onChange={e => setForm(s => ({ ...s, first_name: e.target.value }))} maxLength={150}/></label>
              <label>이메일 (선택)<input type="email" value={form.email} onChange={e => setForm(s => ({ ...s, email: e.target.value }))} maxLength={254}/></label>
              <label>비밀번호<input type="password" value={form.password} onChange={e => setForm(s => ({ ...s, password: e.target.value }))} required minLength={8} autoComplete="new-password" /></label>
              <label>권한<select value={form.role} onChange={e => setForm(s => ({ ...s, role: e.target.value as 'admin' | 'analyst' }))}><option value="analyst">관제 요원 (Analyst)</option><option value="admin">관리자 (Admin)</option></select></label>
              <button type="submit" className="soc-admin-primary" disabled={busy}>{busy ? '처리 중...' : '계정 생성'}</button>
            </form>
          </section>
          <section className="soc-admin-panel soc-admin-users">
            <div className="soc-admin-section-title"><h3><Users size={18}/> 사용자 목록 <small>{users.length}명</small></h3><button type="button" className="soc-admin-icon-button" onClick={() => void refresh()} disabled={loading} title="새로고침"><RefreshCw size={17}/></button></div>
            <label className="soc-admin-search"><Search size={17}/><input placeholder="사용자 검색" value={search} onChange={e => setSearch(e.target.value)} /></label>
            {loading && <p className="soc-admin-empty">사용자 목록 불러오는 중...</p>}
            {!loading && visible.length === 0 && <p className="soc-admin-empty">표시할 사용자가 없습니다.</p>}
            <div className="soc-admin-list">
              {!loading && visible.map(u => (
                <article className="soc-admin-user" key={u.id}>
                  <div className="soc-admin-user-top">
                    <span className="soc-admin-user-avatar">{u.username.slice(0, 2).toUpperCase()}</span>
                    <div className="soc-admin-user-ident"><strong>{u.username}{u.id === self.id ? ' (나)' : ''}</strong><small>{u.first_name || u.email || `#${u.id}`}</small></div>
                    <span className={u.is_active ? 'soc-admin-state' : 'soc-admin-state off'}>{u.is_active ? '활성' : '비활성'}</span>
                  </div>
                  <div className="soc-admin-user-actions">
                    <label>권한<select aria-label={`${u.username} 권한`} value={u.role} disabled={busy || u.id === self.id} onChange={e => void onChangeRole(u, e.target.value as 'admin' | 'analyst')}><option value="analyst">관제 요원</option><option value="admin">관리자</option></select></label>
                    <button type="button" disabled={busy || u.id === self.id} onClick={() => void onToggleActive(u)}>{u.is_active ? '비활성화' : '활성화'}</button>
                    <button type="button" disabled={busy || u.id === self.id} onClick={() => { setResetId(resetId === u.id ? null : u.id); setNewPassword('') }}><KeyRound size={14}/> 비밀번호</button>
                  </div>
                  {resetId === u.id && <form onSubmit={onReset} className="soc-admin-reset"><input type="password" autoComplete="new-password" placeholder="새 비밀번호 (8자 이상)" minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)} required/><button type="submit" disabled={busy}>변경</button></form>}
                </article>
              ))}
            </div>
          </section>
        </div>
        <footer className="soc-admin-footer">관리자 메뉴는 Django superuser 계정에만 표시되고, API에서도 권한을 검사합니다. 계정 삭제 기능은 제공하지 않습니다.</footer>
      </section>
    </div>, document.body
  )
}
