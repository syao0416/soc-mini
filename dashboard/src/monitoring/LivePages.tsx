import { ReputationVisuals } from './ReputationVisuals'
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRight, CheckCircle2, ChevronDown, Clock3,
  Fingerprint, Globe2, HardDrive, ListFilter, Lock, Network, Radio,
  RefreshCw, Search, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  dateText, decideResponse, eventTitle, getEvent, getOverview, getResponses, getStats,
  listEvents, requestBlock, responseLabel, reviewEvent, riskColor, statusLabel, typeColor,
  type ResponseItem, type ReviewStatus, type SocEvent, type SocEventDetail, type SocStats,
} from './liveApi'
import './live-pages.css'

type Period = 'day' | 'month' | 'year'
type GoTo = (page: 'dashboard' | 'alerts' | 'logs' | 'monitoring' | 'responses' | 'reputation' | 'reports' | 'settings') => void
const categories = ['snort','iptables','auditd','mariadb','dvwa']
const statuses: ReviewStatus[] = ['new','investigating','resolved','false_positive']
const periods: { id: Period; label: string }[] = [{id:'day',label:'일별'}, {id:'month',label:'월별'}, {id:'year',label:'연도별'}]
const selectStyle = { minWidth: 0 }

function Pill({children,color}:{children:ReactNode;color:string}) {
  return <span className="pill" style={{'--pill-color':color} as CSSProperties}>{children}</span>
}
function ErrorNotice({message}:{message:string}) {return message ? <div role="alert" className="live-error"><AlertCircle size={18}/>{message}</div> : null}
function Hint({children}:{children:ReactNode}) { return <div className="notice-box"><AlertCircle size={17}/><span>{children}</span></div> }
function Section({eyebrow,title,aside}:{eyebrow:string;title:string;aside?:ReactNode}) {
  return <div className="section-header"><div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>{aside}</div>
}
function Panel({title,aside,children,className=''}:{title:string;aside?:ReactNode;children:ReactNode;className?:string}) {
  return <section className={`glass-card ${className}`}><div className="card-title-row"><h3>{title}</h3>{aside}</div>{children}</section>
}
function PeriodTabs({period,onChange}:{period:Period;onChange:(p:Period)=>void}) {
  return <div className="period-tabs">{periods.map(p=><button key={p.id} type="button" className={period===p.id?'selected':''} onClick={()=>onChange(p.id)}>{p.label}</button>)}</div>
}
function useSnapshot() {
  const [rows,setRows] = useState<SocEvent[]>([])
  const [stats,setStats] = useState<SocStats|null>(null)
  const [responses,setResponses] = useState<ResponseItem[]>([])
  const [capped,setCapped] = useState(false)
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [events, summary, history] = await Promise.all([getOverview(),getStats(),getResponses()])
      setRows(events.rows); setCapped(events.capped); setStats(summary); setResponses(history.results); setError('')
    } catch(e) {setError(String(e instanceof Error ? e.message : e))}
    finally {setLoading(false)}
  },[])
  useEffect(() => {
    let active = true
    Promise.all([getOverview(), getStats(), getResponses()])
      .then(([events, summary, history]) => {
        if (!active) return
        setRows(events.rows); setCapped(events.capped); setStats(summary)
        setResponses(history.results); setError('')
      })
      .catch(e => { if (active) setError(String(e instanceof Error ? e.message : e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  // VIOLET SOC LIVE POLL: when the page is visible, refresh stats and event summaries.
  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void reload() }, 15000)
    return () => window.clearInterval(timer)
  }, [reload])
  return {rows,stats,responses,capped,error,loading,reload}
}

function CountTrend({rows,period}:{rows:SocEvent[];period:Period}) {
  const valid = rows.filter(r => r.event_time)
  const latest = [...valid].sort((a,b)=>(b.event_time ?? '').localeCompare(a.event_time ?? ''))[0]?.event_time
  const keys: {key:string;label:string}[] = []
  if (latest) {
    if(period==='day') {
      const day=latest.slice(0,10)
      for(let h=0;h<24;h++) keys.push({key:`${day}T${String(h).padStart(2,'0')}`,label:h%4===0?`${h}시`:''})
    } else if(period==='month') {
      const [y,m]=latest.slice(0,7).split('-').map(Number)
      const days=new Date(y,m,0).getDate()
      for(let d=1;d<=days;d++) keys.push({key:`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,label:d===1||d%5===0?String(d):''})
    } else {
      const year=latest.slice(0,4)
      for(let m=1;m<=12;m++) keys.push({key:`${year}-${String(m).padStart(2,'0')}`,label:`${m}월`})
    }
  }
  const counts=keys.map(({key})=>valid.filter(r=>r.event_time?.startsWith(key)).length)
  const max=Math.max(1,...counts)
  const coords=counts.map((n,i)=>[42+i*728/Math.max(1,counts.length-1),210-n/max*155] as const)
  const path=coords.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  return <div className="chart-holder">
    {keys.length===0 ? <p className="live-empty">발생 시간 정보가 없어 추이를 표시할 수 없습니다.</p> : <svg viewBox="0 0 810 250" preserveAspectRatio="none" role="img" aria-label="수집된 이벤트 발생 추이">
      <defs><linearGradient id="liveLineShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d6ceff" stopOpacity=".35"/><stop offset="1" stopColor="#d6ceff" stopOpacity="0"/></linearGradient></defs>
      {[55,107,158,210].map(y=><line key={y} x1="42" x2="772" y1={y} y2={y} stroke="#d7d5ff" strokeOpacity=".18" strokeDasharray="3 7"/>) }
      {[0,1,2,3].map(i=><text key={i} x="31" y={59+i*51} textAnchor="end" fill="#c4baf4" fontSize="11">{Math.round(max*(3-i)/3)}</text>)}
      <path d={`${path} L770,210 L42,210 Z`} fill="url(#liveLineShade)"/><path d={path} stroke="#fff" strokeWidth="3" strokeLinejoin="round" fill="none"/>
      {coords.map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===coords.length-1?4:2.2} fill="#fff"/>)}
      {keys.map((item,i)=>item.label?<text key={i} x={coords[i][0]} y="237" textAnchor="middle" fill="#ddd6ff" fontSize="10">{item.label}</text>:null)}
    </svg>}
  </div>
}
function SeverityDonut({stats}:{stats:SocStats}) {
  const levels=['critical','high','medium','low','info']
  const total=stats.total_events || 1
  let used=0
  const arcs=levels.map(s=>{
    const count=stats.by_severity[s]??0
    const share=count/total*100
    const start=used;used+=share
    return <circle key={s} cx="60" cy="60" r="46" fill="none" stroke={riskColor(s)} strokeWidth="12" strokeDasharray={`${share} ${100-share}`} strokeDashoffset={-start} pathLength="100" transform="rotate(-90 60 60)"/>
  })
  return <div className="donut-wrap"><svg className="donut" viewBox="0 0 120 120" role="img" aria-label="실제 로그 등급 분포"><circle cx="60" cy="60" r="46" stroke="#d4c8ff33" strokeWidth="12" fill="none"/>{arcs}<text x="60" y="58" textAnchor="middle" fontSize="24" fill="white" fontWeight="700">{stats.total_events}</text><text x="60" y="74" textAnchor="middle" fontSize="9" fill="#c9c3ef">EVENTS</text></svg><div className="donut-legend">{levels.map(s=><div className="legend-line" key={s}><span className="legend-label"><i style={{background:riskColor(s)}}/>{s}</span><strong>{stats.by_severity[s]??0}</strong></div>)}</div></div>
}
function EventsTable({rows,onSelect,limit}:{rows:SocEvent[];onSelect:(id:string)=>void;limit?:number}) {
  return <div className="table-scroller"><table className="data-table"><thead><tr><th>DB 발생 시간</th><th>탐지 메시지</th><th>로그 종류</th><th>출발지 IP</th><th>위험도</th><th>상태</th></tr></thead><tbody>
    {rows.slice(0,limit).map(e=><tr key={e.event_id} tabIndex={0} role="button" className="interactive-row" onClick={()=>onSelect(e.event_id)} onKeyDown={ev=>{if(ev.key==='Enter')onSelect(e.event_id)}}><td className="mono muted">{dateText(e.event_time)}</td><td><strong className="live-event-title">{eventTitle(e)}</strong><small>{e.event_id.slice(0,8)} · {e.event_type}</small></td><td><span className="source-dot" style={{background:typeColor(e.log_type)}}/>{e.log_type}</td><td className="mono">{e.src_ip??'—'}</td><td><Pill color={riskColor(e.severity)}>{e.severity}</Pill></td><td><span className={`status ${e.review_status==='new'?'new':''}`}>{statusLabel(e.review_status)}</span></td></tr>)}
  </tbody></table>{rows.length===0&&<div className="empty-state">조건에 맞는 이벤트가 없습니다.</div>}</div>
}function DetailDrawer({eventId,onClose,onSaved,onResponse}:{eventId:string|null;onClose:()=>void;onSaved:()=>void;onResponse:()=>void}) {
  const [detail,setDetail] = useState<SocEventDetail|null>(null)
  const [status,setStatus] = useState<ReviewStatus>('new')
  const [note,setNote] = useState('')
  const [error,setError] = useState('')
  const [feedback,setFeedback] = useState('')
  const [busy,setBusy] = useState(false)
  useEffect(()=>{
    if(!eventId)return
    let alive=true
    void getEvent(eventId).then(d=>{if(alive){setDetail(d);setStatus(d.review_status);setNote(d.review_note??'')}}).catch(e=>{if(alive)setError(String(e))})
    return ()=>{alive=false}
  },[eventId])
  if(!eventId)return null
  const save=async()=>{
    if(!detail)return
    setBusy(true);setError('')
    try {
      await reviewEvent(detail.event_id,status,note)
      const d=await getEvent(detail.event_id)
      setDetail(d);setStatus(d.review_status);setNote(d.review_note??'')
      setFeedback('처리 상태와 분석 메모가 DB에 저장됐어.');onSaved()
    } catch(e){setError(String(e))} finally{setBusy(false)}
  }
  const block=async()=>{
    if(!detail?.src_ip){setError('이 이벤트에는 출발지 IP가 없습니다.');return}
    if(!window.confirm(`${detail.src_ip} 차단 검토 요청을 남길까요? 실제 차단 명령은 실행되지 않습니다.`))return
    setBusy(true);setError('')
    try{
      await requestBlock(detail.event_id, detail.src_ip, note||eventTitle(detail))
      setFeedback('차단 검토 요청이 DB에 기록되었습니다. 실제 방화벽은 변경되지 않았습니다.');onResponse()
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
  return <><button className="detail-backdrop" aria-label="이벤트 상세 닫기" onClick={onClose}/><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label="실제 이벤트 상세">
    <div className="detail-head"><span className="eyebrow">EVENT INVESTIGATION / DATABASE</span><button className="icon-btn" onClick={onClose} aria-label="닫기"><X size={22}/></button></div>
    {error&&<ErrorNotice message={error}/>} {feedback&&<p className="live-success">{feedback}</p>}
    {!detail?<p className="live-empty">상세 정보를 불러오는 중…</p>:<>
      <h2>{eventTitle(detail)}</h2><div className="detail-badges"><Pill color={riskColor(detail.severity)}>{detail.severity}</Pill><Pill color={typeColor(detail.log_type)}>{detail.log_type}</Pill><span className="live-uuid">{detail.event_id}</span></div>
      <div className="detail-info">{[['발생 시간 (DB)',dateText(detail.event_time)],['수집 VM',detail.source_vm],['이벤트 유형',detail.event_type],['출발지 IP',detail.src_ip??'—'],['목적지 IP',detail.dst_ip??'—'],['프로토콜',detail.protocol??'—'],['위험도 근거',detail.severity_reason??'—']].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div>
      <h3>탐지 내용</h3><p className="detail-paragraph">{eventTitle(detail)}</p>
      <h3>원본 로그</h3><pre className="log-code">{detail.raw_log}</pre>
      <h3>정규화 상세</h3><pre className="log-code">{JSON.stringify(detail.details,null,2)}</pre>
      <h3>분석 및 처리</h3><label className="field-label">처리 상태<select className="field-input" value={status} onChange={e=>setStatus(e.target.value as ReviewStatus)}>{statuses.map(v=><option key={v} value={v}>{statusLabel(v)}</option>)}</select></label>
      <label className="field-label">분석 메모<textarea className="field-input note-area" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="분석 근거와 판단 사항을 기록"/></label>
      <div className="detail-actions"><button disabled={busy} className="solid-button" onClick={()=>void save()}><CheckCircle2 size={17}/> DB 저장</button><button disabled={busy||!detail.src_ip} className="line-button" onClick={()=>void block()}><Lock size={17}/> 차단 검토 요청</button></div>
    
    </>}
  </aside></>
}

export function LiveDashboard({goTo}:{goTo:GoTo}) {
  const {rows,stats,responses,capped,error,loading,reload}=useSnapshot()
  const [period,setPeriod]=useState<Period>('day')
  const [selected,setSelected]=useState<string|null>(null)
  const open=rows.filter(e=>e.review_status==='new'||e.review_status==='investigating').length
  const risk=rows.filter(e=>e.severity_level>=2).length
  const recent=rows.slice(0,5)
  return <>
    <div className="hero-title"><div><div className="eyebrow wide">MONITORING DATABASE</div><h1>Security <span>&amp;</span><br/>Threat Intelligence</h1></div><div className="hero-right"><div className="hero-icon"><ShieldCheck size={42}/></div><span>DATA SOURCE</span><strong>DB SNAPSHOT</strong><small></small></div></div>
    <ErrorNotice message={error}/>
    {capped&&<Hint>전체 이벤트 수는 DB 통계입니다.</Hint>}
    <div className="kpi-strip">
      {[
        {label:'COLLECTED EVENTS',value:stats?.total_events,icon:HardDrive,sub:'socdb.events 전체 행 수'},
        {label:'SNORT EVENTS',value:stats?.by_log_type.snort,icon:ShieldAlert,sub:'Snort IDS 정규화 로그'},
        {label:'MEDIUM+ EVENTS',value:risk,icon:AlertCircle,sub:'위험도 medium 이상 (조회 범위)'},
        {label:'PENDING REVIEWS',value:open,icon:Clock3,sub:'신규 + 분석 중 (조회 범위)'},
      ].map((c,i)=>{const Icon=c.icon;return <div className="kpi glass-card" key={c.label}><span className="kpi-label">{c.label}<Icon size={18}/></span><strong className={i===2?'danger-value':''}>{loading?'…':(c.value??0).toLocaleString()}</strong><small>{c.sub}</small></div>})}
    </div>
    <section className="glass-card primary-chart"><div className="card-title-row"><div><span className="micro-label">SECURITY ANALYTICS</span><h2>Collected Event Trends</h2><p className="card-sub">최신 기록 날짜 기준 발생 추이 · 실제 로그 스냅샷</p></div><PeriodTabs period={period} onChange={setPeriod}/></div><CountTrend rows={rows} period={period}/><div className="chart-bottom"><span><span className="legend-dot"/> 로그 이벤트 건수</span><button className="live-refresh" onClick={()=>void reload()}><RefreshCw size={14}/> DB 다시 조회</button></div></section>
    <div className="dashboard-grid">
      <Panel title="Event Severity" aside={<Pill color="#eacbff">DB LEVEL</Pill>} className="severity-card">{stats?<SeverityDonut stats={stats}/>:<p>불러오는 중…</p>}</Panel>
      <Panel title="Detection Sources" aside={<Pill color="#eacbff">LOG TYPE</Pill>} className="source-card"><div className="source-bars">{categories.map((t,i)=>{const n=stats?.by_log_type[t]??0;return <div className="bar-line" key={t}><div className="bar-label"><span>{t}</span><strong>{n}</strong></div><div className="bar-track"><div style={{width:`${n?Math.max(2,n/Math.max(1,stats?.total_events??1)*100):0}%`,background:['#8fe0d6','#ffe0b1','#bbaaff','#9bcfff','#f4b0d3'][i]}}/></div></div>})}</div><p className="source-disclaimer"></p></Panel>
      <Panel title="Review Snapshot" aside={<Pill color="#f3d9ff">WORKFLOW</Pill>} className="response-card"><div className="response-gauge"><div><span>처리 완료</span><strong>{rows.length?Math.round(rows.filter(e=>e.review_status==='resolved').length/rows.length*100):0}%</strong><small>표시 중인 이벤트 기준</small></div><svg viewBox="0 0 160 100" aria-hidden="true"><path d="M 22 82 A 58 58 0 0 1 138 82" fill="none" stroke="#d4c8ed" strokeWidth="14" strokeLinecap="round"/><path d="M 22 82 A 58 58 0 0 1 138 82" pathLength="100" strokeDasharray={`${rows.length?Math.round(rows.filter(e=>e.review_status==='resolved').length/rows.length*100):0} 100`} fill="none" stroke="#5031b3" strokeWidth="14" strokeLinecap="round"/></svg></div><div className="response-summary"><span>차단 검토 요청 <strong>{responses.length}</strong></span><span>실제 차단 <strong>미연동</strong></span></div></Panel>
    </div>
    <div className="bottom-grid"><Panel title="Recent Events" aside={<button className="text-link" onClick={()=>goTo('alerts')}>전체 보기 <ArrowRight size={15}/></button>}><EventsTable rows={recent} onSelect={setSelected}/></Panel><Panel title="Recent Response Reviews" aside={<ShieldCheck size={17}/>}><div className="response-feed">{responses.length?responses.slice(0,3).map(r=><div className="feed-entry" key={r.id}><span className="timeline-dot"/><div><strong>{r.action==='block'?'차단 검토':'해제 검토'}</strong><small>{r.target_ip} · {dateText(r.created_at)}</small><p>{responseLabel(r.status)} · 실제 실행 없음</p></div></div>):<p className="live-empty">저장된 검토 요청이 없습니다.</p>}</div></Panel></div>
    <DetailDrawer key={selected ?? "closed"} eventId={selected} onClose={()=>setSelected(null)} onSaved={()=>void reload()} onResponse={()=>void reload()}/>
  </>
}

export function LiveAlerts() {
  const {rows,stats,capped,error,loading,reload}=useSnapshot()
  const [search,setSearch]=useState('');const [risk,setRisk]=useState('전체');const [type,setType]=useState('전체');const [status,setStatus]=useState('전체')
  const [selected,setSelected]=useState<string|null>(null)
  const [page,setPage]=useState(0)
  const filtered=useMemo(()=>rows.filter(e=>{
    const q=search.toLowerCase().trim()
    return (risk==='전체'||e.severity===risk)&&(type==='전체'||e.log_type===type)&&(status==='전체'||e.review_status===status)
      && (!q||[e.event_id,e.event_type,e.message??'',e.src_ip??'',e.dst_ip??'',e.source_vm].some(v=>v.toLowerCase().includes(q)))
  }),[rows,search,risk,type,status])
  const visible=filtered.slice(page*50,(page+1)*50)
  return <>
    <Section eyebrow="EVENT TRIAGE / DATABASE" title="Alert Management" aside={<Pill color="#d8cdff">{filtered.length} EVENTS</Pill>}/>
    <ErrorNotice message={error}/>{capped&&<Hint>최신 2,000건만 조회하고 있씁니다. 더 많은 데이터가 필요하면 서버 페이지네이션을 확장해야 합니다.</Hint>}
    <div className="toolbar glass-card"><label className="searchbox"><Search size={18}/><input placeholder="이벤트 메시지, IP, UUID 검색" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}/></label><label className="selectbox"><ListFilter size={16}/><select value={risk} onChange={e=>{setRisk(e.target.value);setPage(0)}}><option>전체</option>{['critical','high','medium','low','info'].map(s=><option key={s}>{s}</option>)}</select></label><label className="selectbox"><Network size={16}/><select value={type} onChange={e=>{setType(e.target.value);setPage(0)}}><option>전체</option>{categories.map(s=><option key={s}>{s}</option>)}</select></label><label className="selectbox"><ShieldCheck size={16}/><select value={status} onChange={e=>{setStatus(e.target.value);setPage(0)}}><option value="전체">전체 상태</option>{statuses.map(s=><option key={s} value={s}>{statusLabel(s)}</option>)}</select></label></div>
    <Panel title="Investigated Events" aside={<button className="live-refresh" onClick={()=>void reload()}><RefreshCw size={14}/> 새로고침</button>}>
      {loading?<p className="live-empty">데이터 조회 중…</p>:<EventsTable rows={visible} onSelect={setSelected}/>}
      <Pagination page={page} total={filtered.length} size={50} onChange={setPage}/>
    </Panel>
    <p className="live-fine">총 {stats?.total_events??'—'}건의 DB 이벤트 중 표시 조건에 맞는 항목 · 스냅샷 시점의 로그</p>
    <DetailDrawer key={selected ?? "closed"} eventId={selected} onClose={()=>setSelected(null)} onSaved={()=>void reload()} onResponse={()=>void reload()}/>
  </>
}
function Pagination({page,total,size,onChange}:{page:number;total:number;size:number;onChange:(p:number)=>void}) {
  const max=Math.max(1,Math.ceil(total/size))
  return <div className="live-pagination"><span>{total}건 · {total?`${page*size+1}–${Math.min(total,(page+1)*size)}`:'0'} 표시</span><div><button className="line-button" disabled={page===0} onClick={()=>onChange(Math.max(0,page-1))}>이전</button><span>{page+1} / {max}</span><button className="line-button" disabled={page+1>=max} onClick={()=>onChange(page+1)}>다음</button></div></div>
}

export function LiveLogs() {
  const [rows,setRows]=useState<SocEvent[]>([])
  const [total,setTotal]=useState(0)
  const [term,setTerm]=useState('');const [query,setQuery]=useState('')
  const [kind,setKind]=useState('');const [page,setPage]=useState(0)
  const [selected,setSelected]=useState<SocEventDetail|null>(null)
  const [error,setError]=useState('');const [loading,setLoading]=useState(true)
  const load=useCallback(async()=>{
    setLoading(true)
    try{const result=await listEvents({limit:50,offset:page*50,q:query,log_type:kind});setRows(result.results);setTotal(result.total);setError('')}
    catch(e){setError(String(e))}finally{setLoading(false)}
  },[page,query,kind])
  useEffect(() => {
    let active = true
    listEvents({limit:50, offset:page*50, q:query, log_type:kind})
      .then(result => {
        if (!active) return
        setRows(result.results); setTotal(result.total); setError('')
      })
      .catch(e => { if (active) setError(String(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page,query,kind])
  const choose=async(id:string)=>{
    if(selected?.event_id===id){setSelected(null);return}
    try{setSelected(await getEvent(id));setError('')}catch(e){setError(String(e))}
  }
  const searchNow=()=>{setSelected(null);setPage(0);setLoading(true);setQuery(term)}
  return <>
    <Section eyebrow="EVENT INVESTIGATION / MARIA DB" title="Log Management" aside={<Pill color="#d8cdff">{total} RECORDS</Pill>}/>
    <ErrorNotice message={error}/>
    <div className="toolbar glass-card"><div className="searchbox"><Search size={18}/><input placeholder="출발지·목적지 IP, 로그 내용, 이벤트 유형" value={term} onChange={e=>setTerm(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')searchNow()}}/><button className="live-inline-button" onClick={searchNow}>검색</button></div><label className="selectbox"><SlidersHorizontal size={16}/><select style={selectStyle} value={kind} onChange={e=>{setKind(e.target.value);setPage(0);setSelected(null);setLoading(true)}}><option value="">전체 로그</option>{categories.map(s=><option key={s}>{s}</option>)}</select></label><button className="live-refresh" onClick={()=>void load()}><RefreshCw size={15}/> 새로고침</button></div>
    <Panel title="Collected Logs" aside={<Pill color="#d8cdff">{total} DB EVENTS</Pill>}>
      <div className="table-scroller"><table className="data-table"><thead><tr><th>DB 발생 시간</th><th>로그 종류</th><th>수집 VM</th><th>출발지 IP</th><th>이벤트</th><th>상세</th></tr></thead><tbody>
        {rows.map(l=><tr key={l.event_id} tabIndex={0} role="button" className={`interactive-row ${selected?.event_id===l.event_id?'live-selected':''}`} onClick={()=>void choose(l.event_id)} onKeyDown={e=>{if(e.key==='Enter')void choose(l.event_id)}}><td className="mono muted">{dateText(l.event_time)}</td><td><Pill color={typeColor(l.log_type)}>{l.log_type}</Pill></td><td>{l.source_vm}</td><td className="mono">{l.src_ip??'—'}</td><td className="live-event-title">{eventTitle(l)}</td><td><ChevronDown size={16}/></td></tr>)}
      </tbody></table>{!loading&&rows.length===0&&<div className="empty-state">검색 결과가 없습니다.</div>}{loading&&<div className="empty-state">DB에서 조회 중…</div>}</div><Pagination page={page} total={total} size={50} onChange={p=>{setPage(p);setSelected(null);setLoading(true)}}/>
    </Panel>
    {selected&&<div className="details-grid"><Panel title="Raw Log · 원본 증적"><pre className="log-code">{selected.raw_log}</pre></Panel><Panel title="Normalized Log · 정규화 상세"><pre className="log-code">{JSON.stringify({event_id:selected.event_id,event_time:selected.event_time,source_vm:selected.source_vm,log_type:selected.log_type,severity:selected.severity,src_ip:selected.src_ip,dst_ip:selected.dst_ip,details:selected.details},null,2)}</pre></Panel></div>}
  </>
}

export function LiveMonitoring() {
  const {stats,error,loading,reload}=useSnapshot()
  const devices=[
    {name:'IDS · Snort',icon:Radio,desc:'Snort 침입 탐지 로그',n:stats?.by_log_type.snort??0},
    {name:'Firewall · iptables',icon:Shield,desc:'네트워크 방화벽 로그',n:stats?.by_log_type.iptables??0},
    {name:'auditd',icon:Fingerprint,desc:'리눅스 감사 이벤트 · EDR 제품과 별개',n:stats?.by_log_type.auditd??0},
    {name:'DVWA',icon:Network,desc:'취약 웹 앱 로그 · WAF 제품과 별개',n:stats?.by_log_type.dvwa??0},
    {name:'MariaDB',icon:HardDrive,desc:'DB 운영 및 감사 성격 로그',n:stats?.by_log_type.mariadb??0},
  ]
  return <><Section eyebrow="LOG SOURCE EVIDENCE" title="Security Monitoring" aside={<button className="live-refresh" onClick={()=>void reload()}><RefreshCw size={14}/> 새로고침</button>}/><ErrorNotice message={error}/>
    <div className="monitor-grid">{devices.map(d=>{const Icon=d.icon;return <div className="glass-card monitor-card" key={d.name}><div className="monitor-icon"><Icon size={25}/></div><h3>{d.name}</h3><p>{d.desc}</p><Pill color={d.n?'#a8f0eb':'#ffc8ae'}>{loading?'조회 중':d.n?`${d.n}건 수집 증적`:'데이터 없음'}</Pill><small>백업 시점의 이벤트 수</small></div>})}</div>
    <Panel title="Integration Pipeline"><div className="pipeline">{['Log Sources','Fluent Bit','Python Normalizer','MariaDB · socdb','Django API','React SOC'].map((s,i)=><div className="pipeline-item" key={s}><span>{String(i+1).padStart(2,'0')}</span><strong>{s}</strong><small>{i>=3?'로컬 스냅샷 연동':'팀 측 수집 파이프라인'}</small></div>)}</div></Panel>
    
  </>
}

export function LiveResponses() {
  const {user}=useAuth()
  const [records,setRecords]=useState<ResponseItem[]>([])
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [feedback,setFeedback]=useState('')
  const load=useCallback(async()=>{try{setRecords((await getResponses()).results);setError('')}catch(e){setError(String(e))}},[])
  useEffect(() => {
    let active = true
    getResponses()
      .then(result => { if (active) { setRecords(result.results); setError('') } })
      .catch(e => { if (active) setError(String(e)) })
    return () => { active = false }
  }, [])
  const decide=async(id:number,decision:'approved'|'rejected')=>{
    const action=decision==='approved'?'승인':'반려'
    if(!window.confirm(`요청 ${id}번을 ${action}할까요? 실제 방화벽 조치는 실행되지 않습니다.`))return
    setBusy(true)
    try{await decideResponse(id,decision);await load();setFeedback(`${action} 기록이 Django DB에 저장됐습니다.`)}catch(e){setError(String(e))}finally{setBusy(false)}
  }
  return <><Section eyebrow="ACTION AUDIT TRAIL / DATABASE" title="Response History" aside={<Pill color="#d8cdff">{records.length} REQUESTS</Pill>}/><ErrorNotice message={error}/>{feedback&&<p className="live-success">{feedback}</p>}
    <Panel title="Response Review Records" aside={<button className="live-refresh" onClick={()=>void load()}><RefreshCw size={14}/> 새로고침</button>}><div className="table-scroller"><table className="data-table"><thead><tr><th>요청 시간</th><th>출발지 IP</th><th>조치</th><th>검토 사유</th><th>상태</th><th>요청자</th><th>관리자 결정</th></tr></thead><tbody>
      {records.map(r=><tr key={r.id}><td className="mono muted">{dateText(r.created_at)}</td><td className="mono">{r.target_ip}</td><td>{r.action==='block'?'차단 검토':'해제 검토'}</td><td className="live-event-title">{r.reason||r.event_id}</td><td><Pill color={r.status==='pending'?'#ffce91':'#d4b5ff'}>{responseLabel(r.status)}</Pill></td><td>{r.created_by}</td><td>{r.status==='pending'&&user.role==='admin'?<div className="live-action-buttons"><button disabled={busy} className="line-button" onClick={()=>void decide(r.id,'approved')}>승인</button><button disabled={busy} className="line-button" onClick={()=>void decide(r.id,'rejected')}>반려</button></div>:r.decided_by??'—'}</td></tr>)}
    </tbody></table>{records.length===0&&<p className="live-empty">저장된 요청이 없어요. Alert Management에서 이벤트 상세를 열어 검토를 요청할 수 있습니다.</p>}</div></Panel><p className="live-fine">최신 100개 검토 요청까지 표시 · 승인/반려는 관리자로만 가능</p>
  </>
}

export function LiveReputation({ goTo }: { goTo: GoTo }) {
  const { rows, error, loading, capped } = useSnapshot()

  const [ip, setIp] = useState('')
  const [checked, setChecked] = useState<string | null>(null)

  const matching = useMemo(
    () => rows.filter(e => e.src_ip === checked || e.dst_ip === checked),
    [checked, rows]
  )

  return (
    <>
      <Section
        eyebrow="LOCAL INDICATOR SEARCH"
        title="IP Reputation"
      />

      <ErrorNotice message={error} />

      <Panel title="Local IP Lookup">
        <div className="ip-lookup">
          <div className="searchbox">
            <Globe2 size={22} />
            <input
              value={ip}
              onChange={e => setIp(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') setChecked(ip.trim())
              }}
              placeholder="로그의 IPv4 또는 IPv6 주소 검색"
            />
          </div>

          <button
            className="solid-button"
            onClick={() => setChecked(ip.trim())}
          >
            <Search size={18} />
            로컬 로그 조회
          </button>
        </div>

        {checked !== null && (
          <div className="ip-result">
            <div>
              <span className="micro-label">LOCAL EVIDENCE RESULT</span>
              <h3>{checked || 'IP를 입력해 주세요'}</h3>
            </div>

            <Pill color="#ffddb3">외부 악성 평판 미조회</Pill>

            <p>
              일치하는 수집 이벤트:
              <strong>{loading ? '조회 중' : matching.length}건</strong>
              ({capped ? '최신 2,000건 기준' : '현재 DB 스냅샷 기준'})
            </p>

            <p>
              수집 로그에 등장했다는 사실만으로 공격 주체로
              판단할 수 없습니다.
            </p>

            {matching.length > 0 && (
              <button
                className="text-link"
                onClick={() => goTo('alerts')}
              >
                Alert Management에서 분석하기
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        )}
      </Panel>

      {/* 새로 추가한 IP 분석 및 지도 화면 */}
      <ReputationVisuals
        events={rows}
        selectedIp={checked}
        capped={capped}
        onOpenAlerts={() => goTo('alerts')}
      />
    </>
  )
}

function downloadMarkdown(content:string){
  const file=new Blob([content],{type:'text/markdown;charset=utf-8'})
  const url=URL.createObjectURL(file)
  const a=document.createElement('a');a.href=url;a.download='SOC-event-analysis.md';a.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function LiveReports(){
  const {rows,stats,responses,capped,error,loading}=useSnapshot()
  const [report,setReport]=useState('')
  const generate=()=>{
    if(!stats)return
    const top=rows.slice(0,10)
    const lines=[
      '# SOC 이벤트 분석 보고서 (로컬 DB 스냅샷)',
      '',`작성일: ${new Date().toLocaleDateString('ko-KR')}`,
      `자료 출처: 팀 VM4의 socdb 백업을 로컬 MariaDB로 가져온 기록`,
      `분석 범위: ${rows.length}건${capped?' (최신 2,000건으로 제한됨)':''}; 전체 DB 이벤트: ${stats.total_events}건`,
      '', '## 1. 이벤트 통계',
      ...Object.entries(stats.by_log_type).sort((a,b)=>b[1]-a[1]).map(([name,count])=>`- ${name}: ${count}건`),
      '', '## 2. 위험도 분포',
      ...Object.entries(stats.by_severity).map(([level,count])=>`- ${level}: ${count}건`),
      '', '## 3. 최근 이벤트 (최대 10건)',
      ...top.map(e=>`- ${dateText(e.event_time)} / ${e.event_id} / ${e.log_type} / ${e.severity} / 출발지 ${e.src_ip??'—'} / ${eventTitle(e).replace(/\s+/g,' ')}`),
      '', '## 4. 대응 검토 이력', `- 조회된 검토 요청: ${responses.length}건 (최대 100건 조회)`,
      ...responses.slice(0,5).map(r=>`- 요청 #${r.id}: ${r.target_ip} / ${r.action} / ${responseLabel(r.status)} / 방화벽 실제 실행 없음`),
      '', '## 5. 해석 및 제한사항',
      '- 이 보고서는 침해사고 확정 보고서가 아니라 정규화된 수집 이벤트 검토용 자료입니다.',
      '- 발생 시간은 팀 DB의 event_time 문자열을 사용하며, 시간대 해석은 추가 확인이 필요합니다.',
      '- 서버와 브라우저는 지속적인 VM4 실시간 수집 상태를 검증하지 않습니다.',
      '- 분석 의견은 담당자가 원본 증적을 검토한 뒤 별도로 작성해야 합니다.',
      '- 방화벽 차단, 외부 IP 평판 조회, 자동 메일 발송은 실행되지 않았습니다.',
    ]
    setReport(lines.join('\n'))
  }
  return <><Section eyebrow="EVIDENCE-BASED REPORTING" title="Reports"/><ErrorNotice message={error}/><div className="reports-top">
    <Panel title="Database Report Builder"><p className="card-sub">MariaDB 수집 이벤트의 실제 건수와 최근 로그를 근거로 Markdown 보고서 초안을 생성해요.</p><div className="report-control"><label>데이터 출처</label><span>socdb.events · 로컬 스냅샷 · {stats?.total_events??'—'}건</span></div><div className="report-control"><label>포함할 항목</label><span>로그 유형 분포 · 위험도 · 최근 10건 · 대응 검토 이력 · 제한사항</span></div><button className="solid-button" disabled={loading||!stats} onClick={generate}><Sparkles size={18}/> DB 기반 보고서 생성</button></Panel>
    <Panel title="Evidence Coverage"><div className="evidence-list">{[{name:'전체 수집 이벤트',n:stats?.total_events??0},{name:'현재 분석 범위',n:rows.length},{name:'검토 요청(최대 100건)',n:responses.length}].map(e=><div key={e.name}><span>{e.name}</span><strong>{e.n}건</strong></div>)}</div><p className="fine-note">해시 증적 검증, 탐지 확정, PDF 생성은 아직 연결되지 않았습니다.</p></Panel>
  </div>{report&&<Panel title="Generated Database Draft" aside={<button className="line-button" onClick={()=>downloadMarkdown(report)}><ArrowDownToLine size={15}/> .md 다운로드</button>}><pre className="report-text">{report}</pre></Panel>}</>
}
export function LiveSettings(){
  const {user}=useAuth()
  const [error,setError]=useState('');const [connection,setConnection]=useState<string>('확인 전')
  const check=async()=>{try{const v=await getStats();setConnection(`Django ↔ MariaDB 연결됨 · 이벤트 ${v.total_events}건`);setError('')}catch(e){setConnection('연결 실패');setError(String(e))}}
  return <><Section eyebrow="SYSTEM PREFERENCES" title="Settings"/><ErrorNotice message={error}/><div className="settings-grid">
    <Panel title="System Connections"><div className="evidence-list">{[['Frontend','React / Vite'],['Backend','Django REST-style API'],['SOC logs','MariaDB · socdb.events'],['Login & Reviews','MariaDB · soc_dashboard'],['Current role',user.role],['Database check',connection]].map(([k,v])=><div key={k}><span>{k}</span><strong>{v}</strong></div>)}</div><button className="line-button live-check" onClick={()=>void check()}><Activity size={16}/> DB 연결 확인</button></Panel>
    <Panel title="Unavailable integrations"><div className="evidence-list">{[['SMTP 메일','미연동'],['VM4 실시간 스트리밍','미연동'],['방화벽 실행 승인 후 적용','미연동'],['외부 IP 평판 API','미연동']].map(([k,v])=><div key={k}><span>{k}</span><Pill color="#ffdab0">{v}</Pill></div>)}</div><p className="fine-note">설정 파일과 비밀번호는 프론트엔드에 노출하지 않고 서버에서 관리합니다.</p></Panel>
  </div></>
}
