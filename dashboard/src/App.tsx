import { ProfileMenu } from './auth/ProfileMenu'
import { useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRight, Bell, CheckCircle2, ChevronDown,
  Clock3, Copy, FileText, Fingerprint, Globe2, HardDrive, ListFilter, Lock, Mail,
  Menu, Network, Radio, Search, Settings, Shield, ShieldAlert, ShieldCheck, ShieldHalf,
  ShieldX, SlidersHorizontal, Sparkles, TerminalSquare, X
} from 'lucide-react'
import { demoAlerts, demoLogs, demoResponses, timeline, type AlertStatus, type Period, type SecurityAlert, type Severity, type Source } from './data'


type Page = 'dashboard' | 'alerts' | 'logs' | 'monitoring' | 'responses' | 'reputation' | 'reports' | 'settings'
const navItems = [
  {id:'dashboard' as Page,label:'Dashboard',ko:'대시보드',icon:Activity},
  {id:'alerts' as Page,label:'Alert Management',ko:'경고 관리',icon:ShieldAlert},
  {id:'logs' as Page,label:'Log Management',ko:'로그 관리',icon:TerminalSquare},
  {id:'monitoring' as Page,label:'Security Monitoring',ko:'보안 모니터링',icon:Radio},
  {id:'responses' as Page,label:'Response History',ko:'대응 이력',icon:ShieldCheck},
  {id:'reputation' as Page,label:'IP Reputation',ko:'IP 평판 조회',icon:Globe2},
  {id:'reports' as Page,label:'Reports',ko:'보고서',icon:FileText},
  {id:'settings' as Page,label:'Settings',ko:'설정',icon:Settings},
]
const sevColors:Record<Severity,string> = {Emerg:'#ff829d', Notice:'#ffce91', Info:'#99d8ff',Debug:'#d1c5ff'}
const sourceItems:Source[] = ['EDR','Firewall','IDS','IPS','WAF']
const periodLabels:Record<Period,string> = {day:'일별',month:'월별',year:'연도별'}
const formatDate=(value:string)=>value.slice(5,16).replace(' ',' · ')
const sourceColor=(name:string)=>name==='EDR'?'#b0a0ff':name==='IDS'?'#8ee7d7':name==='Firewall'?'#ffd4a0':'#e6d9ff'
const isDemoSource = (name:string) => name === 'IPS' || name === 'WAF' || name === 'EDR'

function Badge({children,color,soft=false}:{children:ReactNode,color:string,soft?:boolean}) {
  return <span className={'pill '+(soft?'pill-soft':'')} style={{'--pill-color':color} as CSSProperties}>{children}</span>
}
function PeriodTabs({period,onChange}:{period:Period,onChange:(v:Period)=>void}) {
  return <div className="period-tabs" role="group" aria-label="통계 조회 기간">{(['day','month','year'] as Period[]).map(p=><button type="button" key={p} className={period===p?'selected':''} onClick={()=>onChange(p)}>{periodLabels[p]}</button>)}</div>
}
function SectionTitle({eyebrow,title,extra}:{eyebrow:string,title:string,extra?:ReactNode}) {
  return <div className="section-header"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>{extra}</div>
}
function TrendChart({period}:{period:Period}) {
  const values=timeline[period]
  const maximum=Math.max(1,...values.map(i=>i.amount))
  const coords=values.map((item,i)=>[42+i*(728/(values.length-1)), 210-(item.amount/maximum)*155] as const)
  const path=coords.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')
  const area=`${path} L770,210 L42,210 Z`
  return <div className="chart-holder" aria-label={`${periodLabels[period]} 탐지 이벤트 추이 데모 차트`}>
    <svg viewBox="0 0 810 250" preserveAspectRatio="none" role="img" aria-label="모의 공격 탐지 추이 선 그래프">
      <defs>
        <linearGradient id="lineShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6ceff" stopOpacity=".35"/><stop offset="1" stopColor="#d6ceff" stopOpacity="0"/></linearGradient>
      </defs>
      {[55,107,158,210].map(y=><line key={y} x1="42" x2="772" y1={y} y2={y} stroke="#d7d5ff" strokeOpacity=".18" strokeDasharray="3 7"/>) }
      {[0,1,2,3].map((i)=><text key={i} x="31" y={59+i*51} textAnchor="end" fill="#c4baf4" fontSize="11" opacity=".7">{Math.round(maximum*(3-i)/3)}</text>)}
      <path d={area} fill="url(#lineShade)"/>
      <path d={path} stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" fill="none"/>
      {coords.map((p,i)=><circle key={i} cx={p[0]} cy={p[1]} r={i===coords.length-1?5:3.4} fill="#ffffff" stroke={i===coords.length-1?'#b3a5ff':'none'} strokeWidth="4"/>)}
      {values.map((item,i)=><text key={i} x={coords[i][0]} y="237" fontSize="11" textAnchor="middle" fill="#ddd6ff" opacity={i%2===0?1:.64}>{item.label}</text>)}
    </svg>
  </div>
}
function Donut({alerts}:{alerts:SecurityAlert[]}) {
  const counts=(['Emerg','Notice','Info','Debug'] as Severity[]).map(s=>({s,count:alerts.filter(a=>a.severity===s).length}))
  const total=alerts.length||1
  let offset=0
  const circles=counts.map(({s,count})=>{const dash=count/total*100;const circle=<circle key={s} cx="60" cy="60" r="46" fill="none" stroke={sevColors[s]} strokeWidth="12" strokeDasharray={`${dash} ${100-dash}`} strokeDashoffset={-offset} pathLength="100" transform="rotate(-90 60 60)"/>;offset+=dash;return circle})
  return <div className="donut-wrap"><svg className="donut" viewBox="0 0 120 120" role="img" aria-label="경고 등급 비율"><circle cx="60" cy="60" r="46" fill="none" stroke="#d4c8ff33" strokeWidth="12"/>{circles}<text x="60" y="58" textAnchor="middle" fontSize="24" fill="white" fontWeight="700">{alerts.length}</text><text x="60" y="74" textAnchor="middle" fontSize="9" fill="#c9c3ef">TOTAL</text></svg><div className="donut-legend">{counts.map(({s,count})=><div className="legend-line" key={s}><span className="legend-label"><i style={{background:sevColors[s]}}/>{s}</span><strong>{count}</strong></div>)}</div></div>
}
function AlertRows({alerts,onSelect,limit}:{alerts:SecurityAlert[],onSelect:(a:SecurityAlert)=>void,limit?:number}) {
  return <div className="table-scroller"><table className="data-table"><thead><tr><th>발생 시간</th><th>경고 내용</th><th>분류</th><th>출발지 IP</th><th>등급</th><th>상태</th></tr></thead><tbody>{alerts.slice(0,limit).map(a=><tr key={a.id} tabIndex={0} className="interactive-row" onClick={()=>onSelect(a)} onKeyDown={e=>{if(e.key==='Enter')onSelect(a)}}><td className="mono muted">{formatDate(a.at)}</td><td><strong>{a.title}</strong><small>{a.id} · {a.attackType}</small></td><td><span className="source-dot" style={{background:sourceColor(a.source)}}/>{a.source}</td><td className="mono">{a.srcIp}</td><td><Badge color={sevColors[a.severity]}>{a.severity}</Badge></td><td><span className={'status '+(a.status==='신규'?'new':'')}>{a.status}</span></td></tr>)}</tbody></table>{alerts.length===0&&<div className="empty-state">검색 조건에 맞는 Alert가 없습니다.</div>}</div>
}
function Card({title,aside,children,className=''}:{title:string,aside?:ReactNode,children:ReactNode,className?:string}) {return <section className={'glass-card '+className}><div className="card-title-row"><h3>{title}</h3>{aside}</div>{children}</section>}
function Placeholder({children}:{children:ReactNode}) {return <div className="notice-box"><AlertCircle size={17}/><span>{children}</span></div>}

function App(){
  const [page,setPage]=useState<Page>('dashboard')
  const [drawerOpen,setDrawerOpen]=useState(false)
  const [period,setPeriod]=useState<Period>('day')
  const [alerts,setAlerts]=useState<SecurityAlert[]>(()=>{
    try{const saved=window.localStorage.getItem('soc-glass-alerts');if(saved){const changes=JSON.parse(saved) as Record<string,{status:AlertStatus;note:string}>;return demoAlerts.map(a=>({...a,...(changes[a.id]||{})}))}}catch(error){console.warn('데이터를 불러오는 중 오류가 발생했습니다.', error)}return demoAlerts.map(a=>({...a}))
  })
  const [activeAlert,setActiveAlert]=useState<SecurityAlert|null>(null)
  const [note,setNote]=useState('')
  const [status,setStatus]=useState<AlertStatus>('신규')
  const [search,setSearch]=useState('')
  const [severity,setSeverity]=useState('전체')
  const [source,setSource]=useState('전체')
  const [logSearch,setLogSearch]=useState('')
  const [logType,setLogType]=useState('전체')
  const [selectedLog,setSelectedLog]=useState<string|null>(null)
  const [ipInput,setIpInput]=useState('')
  const [ipChecked,setIpChecked]=useState<string|null>(null)
  const [emailEnabled,setEmailEnabled]=useState(false)
  const [mailAddress,setMailAddress]=useState('')
  const [mailLevels,setMailLevels]=useState<Severity[]>(['Emerg','Notice'])
  const [feedback,setFeedback]=useState('')
  const [report,setReport]=useState('')
  const [responseRequests,setResponseRequests]=useState<typeof demoResponses>(demoResponses)

  useEffect(()=>{
    const obj=Object.fromEntries(alerts.map(a=>[a.id,{status:a.status,note:a.note}]))
    try{window.localStorage.setItem('soc-glass-alerts',JSON.stringify(obj))}catch(error){console.warn('데이터를 불러오는 중 오류가 발생했습니다.', error)}
  },[alerts])
  useEffect(()=>{function onEscape(e:KeyboardEvent){if(e.key==='Escape'){setDrawerOpen(false);setActiveAlert(null)}}window.addEventListener('keydown',onEscape);return()=>window.removeEventListener('keydown',onEscape)},[])

  const openAlert=(a:SecurityAlert)=>{setActiveAlert(a);setNote(a.note);setStatus(a.status)}
  const filteredAlerts=useMemo(()=>alerts.filter(a=>{
    const word=search.toLowerCase().trim()
    return (severity==='전체'||a.severity===severity)&&(source==='전체'||a.source===source)&&(!word||[a.id,a.title,a.attackType,a.srcIp,a.rule].some(t=>t.toLowerCase().includes(word)))
  }),[alerts,search,severity,source])
  const filteredLogs=useMemo(()=>demoLogs.filter(l=>(logType==='전체'||l.type===logType)&&(!logSearch||[l.id,l.srcIp,l.event,l.raw,l.source].some(x=>x.toLowerCase().includes(logSearch.toLowerCase())))),[logType,logSearch])
  const unresolved=alerts.filter(a=>a.status!=='처리 완료').length
  const newCount=alerts.filter(a=>a.status==='신규').length
  const emergCount=alerts.filter(a=>a.severity==='Emerg').length
  const selectedTitle=navItems.find(i=>i.id===page)?.ko||'SOC 대시보드'
  const selectPage=(p:Page)=>{setPage(p);setDrawerOpen(false);setFeedback('')}
  const saveAlert=()=>{
    if(!activeAlert)return
    setAlerts(prev=>prev.map(a=>a.id===activeAlert.id?{...a,status,note}:a))
    setActiveAlert(prev=>prev?{...prev,status,note}:prev)
    setFeedback(`${activeAlert.id} 처리 상태와 메모가 브라우저에 저장됐습니다.`)
  }
  const createBlockReview=()=>{
    if(!activeAlert)return
    setResponseRequests(prev=>[{id:`RSP-${String(100+prev.length)}`,at:new Date().toLocaleString('sv-SE').slice(0,16),srcIp:activeAlert.srcIp,action:'차단 검토',reason:`${activeAlert.id} · ${activeAlert.title}`,result:'검토 요청만 기록 · 실제 차단 없음',alertId:activeAlert.id},...prev])
    setFeedback('차단 검토 이력만 추가했습니다. 방화벽 정책 X')
  }
  const generateReport=()=>{
    const count=timeline[period].reduce((n,x)=>n+x.amount,0)
    const main=alerts.slice(0,5)
    const text=[`# SOC 보안 분석 보고서 초안 (데모)`,``,`작성 기준: ${new Date().toLocaleDateString('ko-KR')}`,`조회 기간: ${periodLabels[period]}`,`출처: 가상 시연 데이터 · 실제 침해사고 아님`,``,`## 1. 관제 요약`,`- 화면 표시 로그: ${demoLogs.length}건 (샘플)`,`- 화면 표시 Alert: ${alerts.length}건 (샘플)`,`- Emerg: ${emergCount}건`,`- 미처리: ${unresolved}건`,`- 차트 가상 집계: ${count}건`,``,`## 2. 주요 탐지`,...main.map(a=>`- [${a.id}] ${a.at} / ${a.severity} / ${a.source} / ${a.title} / ${a.srcIp}`),``,`## 3. 탐지 근거 및 증적`,...main.map(a=>`- ${a.id} (규칙 ${a.rule}): ${a.evidence}\n  증적 로그: ${a.rawLog}`),``,`## 4. 분석자 의견`,`- [확인 필요] 실제 로그와 대조하여 오탐 여부 및 후속 조치 검토`,``,`## 5. 대응 사항`,`- 실제 방화벽 차단 및 메일 발송 미연동. UI의 검토 기록은 실제 조치가 아님.`,``,`※ 이 문서는 예시 데이터로 만든 초안이며 실증 자료가 아닙니다.`].join('\n')
    setReport(text)
    setFeedback('데모 보고서 초안을 생성했습니다. 복사하거나 .md 파일로 내려받을 수 있습니다.')
  }
  const downloadReport=()=>{
    if(!report)return
    const blob=new Blob([report],{type:'text/markdown;charset=utf-8'})
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='SOC-demo-report.md';a.click();URL.revokeObjectURL(url)
  }
  const copyReport=async()=>{if(!report)return;try{await navigator.clipboard.writeText(report);setFeedback('보고서 초안을 클립보드에 복사했습니다.')}catch{setFeedback('브라우저 복사가 제한됐습니다. 보고서 내려받기를 사용해주세요.')}}

  return <div className="app-shell">
    <div className="backdrop-beam backdrop-beam-a" aria-hidden="true"/><div className="backdrop-beam backdrop-beam-b" aria-hidden="true"/>
    <div className="sparkle-star star-one" aria-hidden="true">✦</div><div className="sparkle-star star-two" aria-hidden="true">✧</div>
    {drawerOpen&&<button className="drawer-scrim" aria-label="메뉴 닫기" onClick={()=>setDrawerOpen(false)}/>}
    <aside className={'slide-drawer '+(drawerOpen?'open':'')} aria-label="메인 메뉴" aria-hidden={!drawerOpen}>
      <div className="drawer-head"><div className="brand"><span className="brand-symbol"><Shield size={21}/></span><span>MINI<strong>SOC</strong><small>SECURITY INTELLIGENCE</small></span></div><button className="icon-btn" onClick={()=>setDrawerOpen(false)} aria-label="메뉴 닫기"><X size={21}/></button></div>
      <div className="drawer-label">WORKSPACE</div>
      <nav className="drawer-links">{navItems.map(i=>{const Icon=i.icon;return <button key={i.id} onClick={()=>selectPage(i.id)} className={'drawer-link '+(page===i.id?'active':'')} tabIndex={drawerOpen?0:-1}><Icon size={19}/><span>{i.label}<small>{i.ko}</small></span><ArrowRight size={16}/></button>})}</nav>
      <div className="drawer-foot"><span className="pulse-dot"/> DEMO MODE <small>실제 장비·메일·차단 미연동</small></div>
    </aside>
    <header className="topbar">
      <div className="topbar-start"><button onClick={()=>setDrawerOpen(true)} className="menu-toggle" aria-label="메뉴 열기"><Menu size={26}/></button><div className="wordmark">MINI<span>SOC</span></div><span className="topbar-sep"/><span className="topbar-label">{selectedTitle}</span></div>
      <div className="topbar-right"><span className="demo-chip"><span className="pulse-dot"/> DEMO DATA</span><button className="icon-btn notifications" title="신규 Alert 확인" onClick={()=>selectPage('alerts')} aria-label="경고 관리 열기"><Bell size={20}/>{newCount>0&&<em>{newCount}</em>}</button><ProfileMenu /></div>
    </header>
    <main className="page-wrap">
      {page==='dashboard'&&<>
        <div className="hero-title"><div><h1>Security <span>&amp;</span><br/>Threat Intelligence</h1><p>네트워크와 호스트의 이상 징후를 한눈에 확인하는 통합 보안관제</p></div><div className="hero-right"><div className="hero-icon"><ShieldHalf size={42}/></div><span>ALL SYSTEMS</span><strong>DEMO ENVIRONMENT</strong><small>아직 연결이 되지 않은 데모 페이지 입니다.</small></div></div>
        <div className="kpi-strip">
          {[{label:'COLLECTED LOGS',value:demoLogs.length.toLocaleString(),icon:HardDrive,sub:'수집 로그(샘플)'},{label:'DETECTED ALERTS',value:alerts.length.toLocaleString(),icon:ShieldAlert,sub:'탐지 건수(샘플)'},{label:'EMERG ALERTS',value:String(emergCount).padStart(2,'0'),icon:AlertCircle,sub:'긴급 알림 / Syslog 표기'},{label:'OPEN INCIDENTS',value:String(unresolved).padStart(2,'0'),icon:Clock3,sub:'신규 + 분석 중'}].map((c,i)=>{const Icon=c.icon;return <div className="kpi glass-card" key={c.label}><span className="kpi-label">{c.label}<Icon size={18}/></span><strong className={i===2?'danger-value':''}>{c.value}</strong><small>{c.sub}</small></div>})}
        </div>
        <section className="glass-card primary-chart"><div className="card-title-row"><div><span className="micro-label">SECURITY ANALYTICS</span><h2>Attack Detection Trends</h2><p className="card-sub">기간별 공격 탐지 추이 <span>· 예시 데이터</span></p></div><PeriodTabs period={period} onChange={setPeriod}/></div><TrendChart period={period}/><div className="chart-bottom"><span><span className="legend-dot"/> 탐지 이벤트 추이</span><span>일별 · 월별 · 연도별 조회 가능</span></div></section>
        <div className="dashboard-grid">
          <Card title="Alert Severity" aside={<Badge color="#eacbff">BY LEVEL</Badge>} className="severity-card"><Donut alerts={alerts}/></Card>
          <Card title="Detection Sources" aside={<Badge color="#eacbff">BY SOURCE</Badge>} className="source-card"><div className="source-bars">{sourceItems.map((s,i)=>{const count=alerts.filter(a=>a.source===s).length;return <div className="bar-line" key={s}><div className="bar-label"><span>{s}</span><strong>{count}</strong></div><div className="bar-track"><div style={{width:`${Math.max(5,count/alerts.length*100)}%`,background:['#cab9ff','#a9c9ff','#8fe0d6','#ffe0b1','#f4b0d3'][i]}}/></div></div>})}</div><p className="source-disclaimer">EDR · IPS · WAF는 미연동 예시 데이터 포함</p></Card>
          <Card title="Response Snapshot" aside={<Badge color="#f3d9ff">WORKFLOW</Badge>} className="response-card"><div className="response-gauge"><div><span>처리 완료</span><strong>{Math.round(alerts.filter(a=>a.status==='처리 완료').length/Math.max(1,alerts.length)*100)}%</strong><small>검토·분석 상태 기준</small></div><svg viewBox="0 0 160 100" aria-hidden="true"><path d="M 22 82 A 58 58 0 0 1 138 82" fill="none" stroke="#d4c8ed" strokeWidth="14" strokeLinecap="round"/><path d="M 22 82 A 58 58 0 0 1 138 82" pathLength="100" strokeDasharray={`${Math.round(alerts.filter(a=>a.status==='처리 완료').length/Math.max(1,alerts.length)*100)} 100`} fill="none" stroke="#5031b3" strokeWidth="14" strokeLinecap="round"/></svg></div><div className="response-summary"><span>차단 검토 이력 <strong>{responseRequests.length}</strong></span><span>실제 차단 <strong>미연동</strong></span></div></Card>
        </div>
        <div className="bottom-grid"><Card title="Recent Alerts" aside={<button className="text-link" onClick={()=>selectPage('alerts')}>전체 보기 <ArrowRight size={15}/></button>}><AlertRows alerts={alerts} onSelect={openAlert} limit={5}/></Card><Card title="Recent Response" aside={<ShieldCheck size={17}/>}><div className="response-feed">{responseRequests.slice(0,3).map(r=><div className="feed-entry" key={r.id}><span className="timeline-dot"/><div><strong>{r.action}</strong><small>{r.srcIp} · {r.at}</small><p>{r.result}</p></div></div>)}</div></Card></div>
      </>}
      {page==='alerts'&&<><SectionTitle eyebrow="DETECTION & TRIAGE" title="Alert Management" extra={<Badge color="#d8cdff">{filteredAlerts.length} EVENTS</Badge>}/><Placeholder>등급(Emerg·Notice·Info·Debug)은 요청한 분류를 그대로 표시합니다. 별도의 공격 위험도와 구분해서 관리하는 것이 좋아.</Placeholder><div className="toolbar glass-card"><label className="searchbox"><Search size={18}/><input placeholder="경고명, IP, 규칙 ID 검색" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="selectbox"><ListFilter size={16}/><select value={severity} onChange={e=>setSeverity(e.target.value)}><option>전체</option>{(['Emerg','Notice','Info','Debug'] as Severity[]).map(s=><option key={s}>{s}</option>)}</select></label><label className="selectbox"><Network size={16}/><select value={source} onChange={e=>setSource(e.target.value)}><option>전체</option>{sourceItems.map(s=><option key={s}>{s}</option>)}</select></label></div><Card title="Detected Alerts" aside={<span className="small-muted">행을 클릭하면 증적과 분석 메모 표시</span>}><AlertRows alerts={filteredAlerts} onSelect={openAlert}/></Card></>}
      {page==='logs'&&<><SectionTitle eyebrow="EVENT INVESTIGATION" title="Log Management"/><div className="toolbar glass-card"><label className="searchbox"><Search size={18}/><input placeholder="IP, 로그 내용, 이벤트 검색" value={logSearch} onChange={e=>setLogSearch(e.target.value)}/></label><label className="selectbox"><SlidersHorizontal size={16}/><select value={logType} onChange={e=>setLogType(e.target.value)}><option>전체</option>{['access_log','auth.log','snort.alert','firewall.log','edr.event'].map(t=><option key={t}>{t}</option>)}</select></label></div><Card title="Collected Logs" aside={<Badge color="#d8cdff">{filteredLogs.length} RECORDS</Badge>}><div className="table-scroller"><table className="data-table"><thead><tr><th>발생 시간</th><th>로그 종류</th><th>출처</th><th>출발지 IP</th><th>이벤트</th><th>확인</th></tr></thead><tbody>{filteredLogs.map(l=><tr key={l.id} className="interactive-row" onClick={()=>setSelectedLog(selectedLog===l.id?null:l.id)}><td className="mono muted">{formatDate(l.at)}</td><td>{l.type}</td><td>{l.source}</td><td className="mono">{l.srcIp}</td><td>{l.event}</td><td><ChevronDown size={16}/></td></tr>)}</tbody></table>{filteredLogs.length===0&&<div className="empty-state">검색 조건과 일치하는 로그가 없습니다.</div>}</div></Card>{selectedLog&&(()=>{const log=demoLogs.find(x=>x.id===selectedLog);return log?<div className="details-grid"><Card title="Raw Log · 원본 로그"><pre className="log-code">{log.raw}</pre></Card><Card title="Normalized Log · 정규화 데이터"><pre className="log-code">{log.normalized}</pre></Card></div>:null})()}</>}
      {page==='monitoring'&&<><SectionTitle eyebrow="SYSTEM VISIBILITY" title="Security Monitoring"/><Placeholder>현재 화면은 시연용 상태 표시야. 실제 EDR, IPS, WAF 에이전트나 장비에 연결되지 않았습니다.</Placeholder><div className="monitor-grid">{[
        {name:'EDR',icon:Fingerprint,sub:'호스트 프로세스 및 행위 이벤트',state:'미연동',detail:'호스트 이벤트 샘플만 포함'},
        {name:'Firewall',icon:Shield,sub:'방화벽 연결 및 차단 로그',state:'데모 데이터',detail:'Ubuntu iptables 로그 연동 대기'},
        {name:'IDS',icon:Radio,sub:'Snort IDS 네트워크 탐지 이벤트',state:'데모 데이터',detail:'Snort 경고 로그 연동 대기'},
        {name:'IPS',icon:ShieldX,sub:'침입 차단 대응 이벤트',state:'미연동',detail:'실제 차단 동작 없음'},
        {name:'WAF',icon:Network,sub:'웹 애플리케이션 보안 이벤트',state:'미연동',detail:'실제 WAF 장비 없음'},
      ].map(m=>{const Icon=m.icon;return <div className="glass-card monitor-card" key={m.name}><div className="monitor-icon"><Icon size={25}/></div><h3>{m.name}</h3><p>{m.sub}</p><Badge color={m.state==='미연동'?'#ffc8ae':'#a8f0eb'}>{m.state}</Badge><small>{m.detail}</small></div>})}</div><Card title="Integration Pipeline"><div className="pipeline">{['Log Source','Fluent Bit','Python Detection','PostgreSQL','Flask API','React SOC'].map((s,i)=><div className="pipeline-item" key={s}><span>{String(i+1).padStart(2,'0')}</span><strong>{s}</strong><small>{i===5?'현재 화면 구현':'향후 연결'}</small></div>)}</div></Card></>}
      {page==='responses'&&<><SectionTitle eyebrow="ACTION AUDIT TRAIL" title="Response History"/><Placeholder>차단·해제는 실제 방화벽 제어와 연결되지 않았습니다. 이 화면에서는 승인 대기, 시뮬레이션, 검토 이력만 기록하고 있어요.</Placeholder><Card title="Response Records" aside={<Badge color="#d8cdff">{responseRequests.length} RECORDS</Badge>}><div className="table-scroller"><table className="data-table"><thead><tr><th>시간</th><th>출발지 IP</th><th>조치</th><th>사유</th><th>처리 결과</th><th>관련 Alert</th></tr></thead><tbody>{responseRequests.map(r=><tr key={r.id}><td className="mono muted">{r.at}</td><td className="mono">{r.srcIp}</td><td>{r.action}</td><td>{r.reason}</td><td><Badge color="#d4b5ff">{r.result}</Badge></td><td className="mono">{r.alertId}</td></tr>)}</tbody></table></div></Card></>}
      {page==='reputation'&&<><SectionTitle eyebrow="THREAT INTELLIGENCE" title="IP Reputation"/><Placeholder>현재 외부 평판 API는 연결되지 않았습니다. 조회 버튼은 Alert 내역의 IP와 일치하는지만 확인하며 악성 여부를 판정하지 않습니다.</Placeholder><Card title="IP Lookup"><div className="ip-lookup"><div className="searchbox"><Globe2 size={22}/><input value={ipInput} onChange={e=>setIpInput(e.target.value)} placeholder="IP 주소를 입력해 줘 (예: 198.51.100.24)" onKeyDown={e=>{if(e.key==='Enter')setIpChecked(ipInput.trim())}}/></div><button className="solid-button" onClick={()=>setIpChecked(ipInput.trim())}><Search size={18}/> 조회하기</button></div>{ipChecked!==null&&<div className="ip-result"><div><span className="micro-label">LOOKUP RESULT</span><h3>{ipChecked||'IP 주소를 입력해 줘'}</h3></div>{ipChecked&&<><Badge color="#ffddb3">실시간 평판 미조회</Badge><p>화면 샘플 Alert에서 발견된 횟수: <strong>{alerts.filter(a=>a.srcIp===ipChecked).length}건</strong></p><p>198.51.100.0/24, 203.0.113.0/24, 192.0.2.0/24 대역은 문서용 IP이며 실제 악성 IP가 아니야.</p><button className="text-link" onClick={()=>{setSearch(ipChecked);selectPage('alerts')}}>관련 Alert 찾아보기 <ArrowRight size={15}/></button></>}</div>}</Card></>}
      {page==='reports'&&<><SectionTitle eyebrow="EVIDENCE-BASED REPORTING" title="Reports"/><div className="reports-top"><Card title="Report Builder"><p className="card-sub">화면에 표시된 데모 탐지 이벤트와 원본 로그를 참고하여 Markdown 보고서 초안을 작성할 수 있어요.</p><div className="report-control"><label>통계 조회 기준</label><PeriodTabs period={period} onChange={setPeriod}/></div><div className="report-control"><label>포함할 내용</label><span>탐지 통계 · Alert 상위 5건 · 탐지 근거 · 원본 로그 · 대응 주의사항</span></div><button className="solid-button" onClick={generateReport}><Sparkles size={18}/> 보고서 초안 생성</button></Card><Card title="Evidence Coverage"><div className="evidence-list">{[{name:'Alert 이벤트',n:alerts.length},{name:'원본 로그',n:demoLogs.length},{name:'대응 검토 기록',n:responseRequests.length}].map(e=><div key={e.name}><span>{e.name}</span><strong>{e.n}건</strong></div>)}</div><p className="fine-note">실제 증적 무결성 해시와 원본 파일 수집은 백엔드 연동 시 구현 예정</p></Card></div>{report&&<Card title="Generated Draft" aside={<div className="button-stack"><button className="line-button" onClick={copyReport}><Copy size={15}/> 복사</button><button className="line-button" onClick={downloadReport}><ArrowDownToLine size={15}/> .md 다운로드</button></div>}><pre className="report-text">{report}</pre></Card>}</>}
      {page==='settings'&&<><SectionTitle eyebrow="SYSTEM PREFERENCES" title="Settings"/><div className="settings-grid"><Card title="Email Notifications" aside={<Mail size={18}/>}><Placeholder>프론트엔드 설정만 시뮬레이션되며, 실제 메일은 발송되지 않습니다.</Placeholder><label className="toggle-row"><span><strong>이메일 알림 사용</strong><small>백엔드 연결 후 적용 예정</small></span><input type="checkbox" checked={emailEnabled} onChange={e=>setEmailEnabled(e.target.checked)}/></label><label className="field-label">알림 수신 이메일<input className="field-input" type="email" value={mailAddress} onChange={e=>setMailAddress(e.target.value)} placeholder="security@example.com"/></label><label className="field-label">알림 심각도</label><div className="checkrow">{(['Emerg','Notice','Info','Debug'] as Severity[]).map(s=><label key={s}><input type="checkbox" checked={mailLevels.includes(s)} onChange={e=>setMailLevels(prev=>e.target.checked?[...prev,s]:prev.filter(x=>x!==s))}/>{s}</label>)}</div><button className="solid-button" onClick={()=>setFeedback('알림 설정 UI를 확인했습니다. 서버에 저장하거나 메일을 보내지는 않아요.')}>설정 확인</button></Card><Card title="System Connections" aside={<Activity size={18}/>}><div className="evidence-list">{[['React 프론트엔드','실행 중'],['Flask API','미연동'],['PostgreSQL','미연동'],['Fluent Bit / 탐지 엔진','미연동'],['IP 평판 API','미연동'],['메일 발송','미연동']].map(([n,s])=><div key={n}><span>{n}</span><Badge color={s==='실행 중'?'#a5f6d5':'#ffdab0'}>{s}</Badge></div>)}</div><p className="fine-note">API 키, SMTP 비밀번호는 프론트엔드 코드에 저장하지 마.</p></Card></div></>}
      <footer className="footer"><span>MINI SOC <i>✦</i> Security Operations Center</span><span>DESIGN SYSTEM / PURPLE GLASS · FRONTEND DEMO</span></footer>
    </main>
    {feedback&&<div className="toast" role="status"><CheckCircle2 size={18}/>{feedback}<button onClick={()=>setFeedback('')} aria-label="알림 닫기"><X size={16}/></button></div>}
    {activeAlert&&<><button className="detail-backdrop" aria-label="경고 상세 닫기" onClick={()=>setActiveAlert(null)}/><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="Alert 상세 분석"><div className="detail-head"><span className="eyebrow">INCIDENT INVESTIGATION</span><button className="icon-btn" onClick={()=>setActiveAlert(null)} aria-label="닫기"><X size={22}/></button></div><h2>{activeAlert.title}</h2><div className="detail-badges"><Badge color={sevColors[activeAlert.severity]}>{activeAlert.severity}</Badge><Badge color={sourceColor(activeAlert.source)}>{activeAlert.source}</Badge><span>{activeAlert.id}</span></div><div className="detail-info">{[['발생 시간',activeAlert.at],['공격 유형',activeAlert.attackType],['출발지 IP',activeAlert.srcIp],['목적지 IP',activeAlert.dstIp],['탐지 규칙',activeAlert.rule],['연동 여부',isDemoSource(activeAlert.source)?'미연동 시연 예시':'샘플 데이터']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div><h3>탐지 근거</h3><p className="detail-paragraph">{activeAlert.evidence}</p><h3>상세 원본 로그</h3><pre className="log-code">{activeAlert.rawLog}</pre><h3>분석 및 처리</h3><label className="field-label">처리 상태<select className="field-input" value={status} onChange={e=>setStatus(e.target.value as AlertStatus)}><option>신규</option><option>분석 중</option><option>처리 완료</option></select></label><label className="field-label">분석 메모<textarea className="field-input note-area" value={note} onChange={e=>setNote(e.target.value)} placeholder="탐지 근거, 오탐 여부, 대응 의견 등을 기록해 줘"/></label><div className="detail-actions"><button className="solid-button" onClick={saveAlert}><CheckCircle2 size={17}/> 저장</button><button className="line-button" onClick={createBlockReview}><Lock size={16}/> 차단 검토 이력 추가</button></div><p className="fine-note">이 화면은 실제 IP 차단·해제 기능을 실행하지 않아.</p></aside></>}
  </div>
}
export default App
