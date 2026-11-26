import { useEffect, useState } from 'react'
import { Activity, AlertCircle, CheckCircle2, Mail, RefreshCw, Save, ShieldAlert } from 'lucide-react'
import {
  loadOperationsSettings, saveOperationsSettings, sendSmtpTest, previewBlock,
  type OperationsSettings,
} from './operationsApi'
import './soc-settings.css'

const severities = [
  {value: 0,label: 'info 이상 (0)'},
  {value: 1,label: 'low 이상 (1)'},
  {value: 2,label: 'medium 이상 (2)'},
  {value: 3,label: 'high 이상 (3)'},
  {value: 4,label: 'critical (4)'},
]

export function SocSettings() {
  const [config,setConfig] = useState<OperationsSettings|null>(null)
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [testRecipient,setTestRecipient] = useState('')
  const [checkIp,setCheckIp] = useState('')
  const [checkResult,setCheckResult] = useState('')
  const [dbStatus,setDbStatus] = useState('확인 전')

  const refresh = async () => {
    setLoading(true)
    try {
      const data = await loadOperationsSettings()
      setConfig(data)
      setTestRecipient(data.recipients.split(',')[0] ?? '')
      setError('')
    } catch(e) {setError(e instanceof Error ? e.message : String(e))}
    finally {setLoading(false)}
  }
  useEffect(() => {
    let active = true
    void loadOperationsSettings().then(data => {
      if (active) { setConfig(data); setTestRecipient(data.recipients.split(',')[0] ?? ''); setError('') }
    }).catch(e => {
      if (active) setError(e instanceof Error ? e.message : String(e))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const save = async () => {
    if (!config) return
    setSaving(true); setError(''); setNotice('')
    try {
      const next = await saveOperationsSettings({
        mail_enabled: config.mail_enabled,
        recipients: config.recipients,
        min_severity: config.min_severity,
        protected_networks: config.protected_networks,
      })
      setConfig(next)
      setNotice('서버에 설정을 저장했습니다.')
    } catch(e) {setError(e instanceof Error ? e.message : String(e))}
    finally {setSaving(false)}
  }
  const test = async () => {
    setSaving(true); setError(''); setNotice('')
    try {setNotice(await sendSmtpTest(testRecipient))}
    catch(e) {setError(e instanceof Error ? e.message : String(e))}
    finally {setSaving(false)}
  }
  const checkPolicy = async () => {
    setSaving(true); setError(''); setCheckResult('')
    try {
      const result = await previewBlock(checkIp)
      setCheckResult(result.reason)
    } catch(e) {setError(e instanceof Error ? e.message : String(e))}
    finally {setSaving(false)}
  }

  return <>
    <div className="section-header"><div><div className="eyebrow">SECURITY OPERATIONS / SERVER CONFIG</div><h2>Settings</h2></div>
      <button className="line-button" type="button" onClick={()=>void refresh()}><RefreshCw size={15}/> 새로고침</button></div>
    <div className="notice-box"><AlertCircle size={17}/><span>설정은 관리자 계정에서만 변경할 수 있습니다. SMTP 비밀번호는 화면이나 DB에 저장하지 않고 서버 환경변수로 관리합니다. 방화벽 실제 차단은 VM2 연결 전까지 비활성화되어 있습니다.</span></div>
    {error && <p className="soc-setting-error" role="alert">{error}</p>}
    {notice && <p className="soc-setting-success" role="status"><CheckCircle2 size={16}/>{notice}</p>}
    {loading && <p>서버 설정을 조회하고 있습니다…</p>}
    {config && <div className="soc-settings-grid">
      <section className="glass-card soc-settings-card">
        <div className="card-title-row"><h3><Activity size={17}/> 시스템 연결 확인</h3></div>
        <p className="soc-settings-help">실제 SOC 로그 조회 API가 정상 동작하는지 확인합니다. 데이터베이스의 로그를 수정하지 않습니다.</p>
        <div className="soc-setting-info"><span>현재 연결</span><strong>{dbStatus}</strong></div>
        <button type="button" className="line-button" onClick={()=>void fetch('/api/events/stats/',{credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(d=>setDbStatus(`정상 · 이벤트 ${d.total_events}건`)).catch(()=>setDbStatus('연결 실패'))}><Activity size={16}/> DB 연결 확인</button>
        <p className="soc-settings-help">VM4 실시간 연동은 네트워크 연결과 전용 읽기 계정이 준비된 후 서버의 SOC_LOGS_* 설정으로 연결합니다.</p>
      </section>
      <section className="glass-card soc-settings-card">
        <div className="card-title-row"><h3><Mail size={17}/> SMTP 및 알림 메일</h3></div>
        <p className="soc-settings-help">메일 서버의 접속 정보는 <code>.env</code> 파일에서 설정해 주세요. 현재 정보는 비밀값 없이 표시됩니다.</p>
        <div className="soc-setting-info"><span>SMTP 상태</span><strong>{config.smtp_configured ? '서버 설정 감지됨' : '서버 설정 필요'}</strong></div>
        <div className="soc-setting-info"><span>서버</span><strong>{config.smtp_host || '미설정'} : {config.smtp_port}</strong></div>
        <div className="soc-setting-info"><span>발신자</span><strong>{config.smtp_sender || '미설정'}</strong></div>
        <label className="soc-setting-check"><input type="checkbox" checked={config.mail_enabled} onChange={e=>setConfig({...config,mail_enabled:e.target.checked})}/> 신규 위험 이벤트 메일 알림 사용</label>
        <label className="soc-setting-field">알림 수신자 (쉼표로 구분, 최대 5명)
          <textarea rows={2} value={config.recipients} onChange={e=>setConfig({...config,recipients:e.target.value})} placeholder="admin@example.com"/></label>
        <label className="soc-setting-field">메일 발송 최소 위험도
          <select value={config.min_severity} onChange={e=>setConfig({...config,min_severity:Number(e.target.value)})}>
            {severities.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}
          </select></label>
        <div className="soc-setting-divider"/>
        <label className="soc-setting-field">테스트 메일 수신자
          <input type="email" value={testRecipient} onChange={e=>setTestRecipient(e.target.value)} placeholder="test@example.com"/></label>
        <button className="line-button" type="button" disabled={saving || !config.smtp_configured} onClick={()=>void test()}><Mail size={16}/> 테스트 메일 발송</button>
        <p className="soc-settings-help">자동 알림은 신규 DB 이벤트를 조회하는 서버 명령을 실행해야 발송됩니다. 기존 367건은 최초 활성화 시 발송 대상에서 제외됩니다.</p>
      </section>
      <section className="glass-card soc-settings-card">
        <div className="card-title-row"><h3><ShieldAlert size={17}/> IP 차단 검토 정책</h3></div>
        <p className="soc-settings-help">관리자가 보호 IP 대역을 지정할 수 있습니다. 현재 기능은 차단 가능 여부 확인과 기존 승인 기록까지이며 실제 방화벽 명령을 실행하지 않습니다.</p>
        <div className="soc-setting-info"><span>실제 방화벽 차단</span><strong>연결되지 않음</strong></div>
        <div className="soc-setting-info"><span>실제 차단 승인 정책</span><strong>관리자 승인 필수</strong></div>
        <label className="soc-setting-field">보호 IP/CIDR (한 줄에 하나)
          <textarea rows={7} value={config.protected_networks} onChange={e=>setConfig({...config,protected_networks:e.target.value})} spellCheck={false} placeholder="192.168.56.140/32"/></label>
        <label className="soc-setting-field">차단 검토 대상 IP
          <input value={checkIp} onChange={e=>setCheckIp(e.target.value)} placeholder="예: 203.0.113.10"/></label>
        <button className="line-button" type="button" disabled={saving} onClick={()=>void checkPolicy()}><Activity size={16}/> 정책 검토</button>
        {checkResult && <p className="soc-settings-help" role="status">{checkResult}</p>}
      </section>
      <div className="soc-settings-actions"><button className="solid-button" type="button" disabled={saving} onClick={()=>void save()}><Save size={17}/> 설정 저장</button></div>
    </div>}
  </>
}
