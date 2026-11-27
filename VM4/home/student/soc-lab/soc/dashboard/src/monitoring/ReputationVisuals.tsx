import { useMemo, useState, type ReactNode, type CSSProperties } from 'react'
import {
  Activity, ArrowRight, Database, Globe2, Info, MapPin, Network,
  Radar, SearchCheck, Server, ShieldAlert, ShieldCheck, Terminal,
} from 'lucide-react'
import { dateText, riskColor, type SocEvent } from './liveApi'
import './reputation-visuals.css'

type MapMode = 'internal' | 'world'
type Range = 'all' | 'day' | 'week' | 'month'
type Props = {
  events: SocEvent[]
  selectedIp: string | null
  capped?: boolean
  onOpenAlerts?: () => void
}

type VisibleEvent = Pick<SocEvent, 'event_id'|'event_time'|'src_ip'|'dst_ip'|'severity'|'event_type'|'log_type'|'message'>

// Demo rows are intentionally synthetic. Never merge them with real SOC results.
const DEMO_ROWS: VisibleEvent[] = [
  {event_id:'demo-01',event_time:'2026-11-26T14:02:11',src_ip:'192.168.56.101',dst_ip:'192.168.56.103',severity:'high',event_type:'SSH Brute Force',log_type:'auditd',message:'SSH 반복 인증 시도 (시연)'},
  {event_id:'demo-02',event_time:'2026-11-26T13:48:07',src_ip:'192.168.56.101',dst_ip:'192.168.56.103',severity:'high',event_type:'SQL Injection',log_type:'dvwa',message:'SQL Injection 패턴 감지 (시연)'},
  {event_id:'demo-03',event_time:'2026-11-26T13:32:19',src_ip:'192.168.56.101',dst_ip:'192.168.56.103',severity:'medium',event_type:'Port Scan',log_type:'snort',message:'TCP 포트 스캔 의심 (시연)'},
  {event_id:'demo-04',event_time:'2026-11-26T13:20:03',src_ip:'192.168.56.101',dst_ip:'192.168.56.103',severity:'medium',event_type:'DoS Attempt',log_type:'iptables',message:'반복 패킷 유입 (시연)'},
  {event_id:'demo-05',event_time:'2026-11-26T13:05:44',src_ip:'192.168.56.101',dst_ip:'192.168.56.103',severity:'low',event_type:'Snort Alert',log_type:'snort',message:'Snort 탐지 이벤트 (시연)'},
]
const DEMO_COUNTS = {total:58, snort:32, ssh:18, sql:8, score:78}
const WORLD_MARKERS = [
  {name:'북미',x:215,y:120, count:12},
  {name:'유럽',x:470,y:107, count:7},
  {name:'남미',x:328,y:250, count:3},
  {name:'동남아시아',x:691,y:218, count:5},
] as const
const TARGET = {x:770,y:132}

function isPrivateOrLocal(raw: string): boolean {
  const ip=raw.trim().toLowerCase()
  const octets=ip.split('.').map(Number)
  if (octets.length===4 && octets.every(n=>Number.isInteger(n)&&n>=0&&n<=255)) {
    const [a,b]=octets
    return a===10 || (a===172&&b>=16&&b<=31) || (a===192&&b===168) ||
      a===127 || (a===169&&b===254) || (a===100&&b>=64&&b<=127) ||
      a===0 || a>=224 || (a===198&&(b===18||b===19))
  }
  return ip==='::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')
}
function classify(event: VisibleEvent): string {
  const value=`${event.event_type} ${event.message??''}`.toLowerCase()
  if (/ssh|brute|auth|password/.test(value)) return 'SSH 인증 시도'
  if (/sqli|sql.injection|injection/.test(value)) return 'SQL 인젝션 의심'
  if (/scan|nmap|probe|recon/.test(value)) return '포트 스캔'
  if (/dos|flood|syn/.test(value)) return 'DoS 관련'
  return event.log_type.toLowerCase()==='snort'?'Snort 탐지':'기타 로그'
}
function eventWeight(event: VisibleEvent): number {
  return ({critical:12,high:8,medium:5,low:2,info:0.5} as Record<string,number>)[event.severity.toLowerCase()] ?? 1
}
function inRange(event: VisibleEvent, range:Range): boolean {
  if (range==='all') return true
  const timestamp = event.event_time ? Date.parse(event.event_time) : NaN
  if (!Number.isFinite(timestamp)) return false
  const days=range==='day'?1:range==='week'?7:30
  return timestamp >= Date.now()-days*86400000
}
function Count({label,value,icon}:{label:string;value:string|number;icon:ReactNode}) {
  return <div className="rv-count"><span className="rv-count-icon">{icon}</span><span>{label}</span><strong>{value}</strong></div>
}
function InternalMap({selectedIp}:{selectedIp:string}) {
  return <div className="rv-topology" role="img" aria-label="실습용 VM1, VM2, VM3, VM4 네트워크 구성 개념도. 실제 공격 경로는 별도 확인이 필요합니다.">
    <div className="rv-topology-track"/>
    <div className="rv-node"><Terminal size={22}/><strong>VM1</strong><span>테스트 공격자</span></div>
    <div className="rv-net-arrow" aria-hidden="true">→</div>
    <div className="rv-node"><ShieldCheck size={23}/><strong>VM2</strong><span>방화벽 · Snort</span></div>
    <div className="rv-net-arrow" aria-hidden="true">→</div>
    <div className="rv-node"><Server size={22}/><strong>VM3</strong><span>DVWA · SSH</span></div>
    <div className="rv-net-arrow rv-net-arrow-dashed" aria-hidden="true">⇢</div>
    <div className="rv-node"><Database size={22}/><strong>VM4</strong><span>수집 · MariaDB</span></div>
    <div className="rv-topology-footer"><MapPin size={15}/><span>조회 IP: <strong>{selectedIp}</strong> · 위 배치는 VM 역할 설명용이며 실제 패킷 경로를 확정하지 않습니다.</span></div>
  </div>
}
function DemoWorldMap(){
  return <div className="rv-world-wrap"><div className="rv-world" role="img" aria-label="전 세계 가상 공격 위치 시연 지도. 실측 국가 정보가 아닙니다.">
    <img src="/soc-world.svg" alt="윤곽선으로 표시된 세계지도" loading="lazy"/>
    <svg className="rv-map-lines" viewBox="0 0 960 415" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><filter id="rv-glow"><feGaussianBlur stdDeviation="5" /></filter></defs>
     
{WORLD_MARKERS.map((m, i) => {
  const mx = m.x * 960 / 900
  const my = m.y * 415 / 360
  const tx = TARGET.x * 960 / 900
  const ty = TARGET.y * 415 / 360
  const bend = Math.min(my, ty) - 50

  // 공격 발생 지점 → 대한민국 곡선
  const route = `M ${mx} ${my} Q ${(mx + tx) / 2} ${bend} ${tx} ${ty}`

  return (
    <g key={m.name}>
      {/* 공격 경로 */}
      <path
        d={route}
        fill="none"
        stroke="#ff83c5"
        strokeOpacity=".55"
        strokeWidth="1.8"
        strokeDasharray="5 8"
      />

      {/* 곡선을 따라 이동하는 화살표 */}
      <g>
        <path
          d="M -7 -4 L 5 0 L -7 4 Z"
          fill="#ffd2e8"
        />
        <animateMotion
          path={route}
          dur={`${2.8 + i * 0.35}s`}
          begin={`${i * 0.6}s`}
          rotate="auto"
          repeatCount="indefinite"
        />
      </g>

      {/* 발생 지점의 빛나는 효과 */}
      <circle
        cx={mx}
        cy={my}
        r="15"
        fill="#f16aa3"
        opacity=".22"
        filter="url(#rv-glow)"
      />

      <circle
        cx={mx}
        cy={my}
        r="6.5"
        fill="#ff829d"
      />
    </g>
  )
})}

      <circle cx={TARGET.x*960/900} cy={TARGET.y*415/360} r="20" fill="#aa92ff" opacity=".25" filter="url(#rv-glow)"/>
      <circle cx={TARGET.x*960/900} cy={TARGET.y*415/360} r="8" fill="#e0d3ff" stroke="#b59bff" strokeWidth="3"/>
      <text x="830" y="118" fill="#e3daff" fontSize="16" fontWeight="700">예시 목적지</text>
      <text x="830" y="140" fill="#c9bbff" fontSize="12">대한민국</text>
    </svg>
    <div className="rv-world-demo-label">DEMO · 시연용 국가 및 이동선</div>
  </div>
  <div className="rv-world-countries"><strong>시연용 발생 지역 (가상 데이터)</strong><div>{WORLD_MARKERS.map(marker=><span key={marker.name}><i/>{marker.name} <b>{marker.count}건</b></span>)}</div></div>
  <p className="rv-map-note">지도상의 국가, 마커 및 연결선은 디자인 시연용입니다. 현재 수집된 사설 IP 로그의 실제 지리적 위치가 아닙니다.</p></div>
}

export function ReputationVisuals({events, selectedIp, capped=false, onOpenAlerts}:Props) {
  const [mode,setMode]=useState<MapMode>('internal')
  const [range,setRange]=useState<Range>('all')
  const [showAll,setShowAll]=useState(false)
  const demo=selectedIp===null
  const ip=demo?'192.168.56.101':selectedIp.trim()
  const matched = useMemo(()=>selectedIp===null ? [] : events.filter(e=>e.src_ip===ip||e.dst_ip===ip),[events,ip,selectedIp])
  const sourceEvents = useMemo(()=>matched.filter(e=>e.src_ip===ip),[matched,ip])
  const relevant:VisibleEvent[] = demo?DEMO_ROWS:matched
  const filtered = useMemo(()=>relevant.filter(e=>inRange(e,range)),[relevant,range])
  const total=demo?DEMO_COUNTS.total:matched.length
  const snort=demo?DEMO_COUNTS.snort:sourceEvents.filter(e=>e.log_type.toLowerCase()==='snort').length
  const ssh=demo?DEMO_COUNTS.ssh:sourceEvents.filter(e=>classify(e)==='SSH 인증 시도').length
  const sql=demo?DEMO_COUNTS.sql:sourceEvents.filter(e=>classify(e)==='SQL 인젝션 의심').length
  const score=demo?DEMO_COUNTS.score:Math.round(Math.min(100,sourceEvents.reduce((sum,e)=>sum+eventWeight(e),0)))
  const riskText=score>=70?'높음':score>=30?'주의':score>0?'낮음':'정보 없음'
  const isPrivate=isPrivateOrLocal(ip)
  const visibleRows=showAll?filtered:filtered.slice(0,6)
  const counts=useMemo(()=>{
    const map=new Map<string,number>()
    for(const e of filtered)map.set(classify(e),(map.get(classify(e))??0)+1)
    return Array.from(map).sort((a,b)=>b[1]-a[1]).slice(0,4)
  },[filtered])
  return <section className="rv-showcase" aria-label="IP 위치 및 탐지 현황">
    <div className="rv-overline"><span>THREAT INTELLIGENCE / VISUAL ANALYSIS</span><span className="rv-source-pill">{demo?'시연 데이터 (DEMO)':'SOC 수집 로그'}</span></div>
    <header className="rv-heading"><div><h3>IP 위험 분석 및 발생 위치</h3><p>{demo?'화면 구성 미리보기입니다. 실제 IP를 조회하면 수집 로그 기반 통계로 전환됩니다.':'조회한 IP가 포함된 실제 이벤트를 요약합니다. 지리적 위치는 확인되지 않았습니다.'}</p></div><div className="rv-heading-icon"><Radar size={25}/></div></header>
    <div className="rv-layout">
      <div className="rv-left">
        <div className="rv-panel rv-ip-card"><div className="rv-panel-top"><span className="rv-kicker"><Network size={15}/> 조회 대상</span><span className="rv-tag">{demo?'DEMO':isPrivate?'사설·비공인 IP':'공인·기타 IP'}</span></div><strong className="rv-address">{ip||'IP를 먼저 조회해 주세요'}</strong><p>{demo?'아래 수치는 모두 화면 미리보기용 가상 데이터입니다.':isPrivate?'사설 IP는 외부 GeoIP 지리정보와 연결할 수 없습니다. 내부 로그 기반으로 분석합니다.':'공인 IP의 실제 위치를 표시하려면 별도의 GeoIP 조회 API가 필요합니다.'}</p></div>
        <div className="rv-panel rv-risk-card"><div className="rv-risk-top"><span className="rv-kicker"><ShieldAlert size={16}/> 내부 탐지 위험 지표</span><strong className={`rv-risk-badge ${score>=70?'rv-risk-high':score>=30?'rv-risk-mid':''}`}>{riskText}</strong></div><div className="rv-risk-track"><div style={{width:`${score}%`}}/></div><div className="rv-risk-value"><small>출발지 이벤트 빈도·위험도 기준</small><strong>{score} / 100</strong></div><p className="rv-fine">{demo?'78점은 예시 수치입니다.':'공식 평판 점수가 아니며 실제 악성 여부를 확정하지 않습니다.'}</p></div>
        <div className="rv-count-grid">
          <Count label="관찰 이벤트" value={`${total}건`} icon={<Activity size={19}/>}/>
          <Count label="Snort 로그" value={`${snort}건`} icon={<ShieldCheck size={19}/>}/>
          <Count label="SSH 의심" value={`${ssh}건`} icon={<Terminal size={19}/>}/>
          <Count label="SQLi 의심" value={`${sql}건`} icon={<SearchCheck size={19}/>}/>
        </div>
        <div className="rv-panel rv-external"><div className="rv-kicker"><Globe2 size={17}/> 외부 평판 정보</div><p>{isPrivate?'사설·비공인 IP는 AbuseIPDB의 인터넷 신고 평판 또는 국가 위치를 조회하는 대상으로 적합하지 않습니다.':'이 시각화에서는 외부 평판 API를 호출하지 않습니다. 기존 평판 조회 결과와 별도로 확인해 주세요.'}</p><div className="rv-soft-note"><Info size={16}/><span>실제 증적 확인 후 대응을 결정해 주세요. 지도만 보고 자동 차단하지 않습니다.</span></div></div>
      </div>
      <div className="rv-right">
        <div className="rv-panel rv-geo-card"><div className="rv-geo-head"><div className="rv-kicker"><MapPin size={17}/> 발생 위치 및 네트워크 분석</div><div className="rv-map-tabs" role="group" aria-label="위치 시각화 전환"><button type="button" className={mode==='internal'?'active':''} onClick={()=>setMode('internal')}>내부망</button><button type="button" className={mode==='world'?'active':''} onClick={()=>setMode('world')}>세계지도 (시연)</button></div></div>
          {mode==='internal'?<InternalMap selectedIp={ip}/>:<DemoWorldMap/>}
          {mode==='internal'&&<div className="rv-map-footer"><span><Network size={15}/> 실습 구성도</span><span>실제 공격 경로 및 국가 위치 미검증</span></div>}
        </div>
        <div className="rv-panel rv-events-card"><div className="rv-events-head"><div className="rv-kicker"><Activity size={17}/> 관련 이벤트 <small>{demo?'(시연용)':`(${filtered.length}건)`}</small></div><div className="rv-range" role="group" aria-label="기간 선택">{([['all','전체'],['day','24시간'],['week','7일'],['month','30일']] as [Range,string][]).map(([value,label])=><button type="button" key={value} className={range===value?'active':''} onClick={()=>{setRange(value);setShowAll(false)}}>{label}</button>)}</div></div>
          {capped&&!demo&&<p className="rv-limitation">전체 DB가 아닌 최신 조회 범위에서 집계한 값입니다.</p>}
          <div className="rv-table-scroll"><table><thead><tr><th>발생 시각</th><th>출발지 IP</th><th>탐지 유형</th><th>로그 출처</th><th>위험도</th></tr></thead><tbody>{visibleRows.map(e=><tr key={e.event_id}><td>{dateText(e.event_time)}</td><td className="rv-mono">{e.src_ip??'—'}</td><td title={e.message || e.event_type}>{classify(e)}</td><td>{e.log_type}</td><td><span className="rv-level" style={{'--rv-level-color':riskColor(e.severity)} as CSSProperties}>{e.severity}</span></td></tr>)}</tbody></table>{filtered.length===0&&<div className="rv-empty">선택한 기간에 일치하는 이벤트가 없습니다.</div>}</div>
          {counts.length>0&&<div className="rv-type-summary"><span>{demo?'예시 이벤트 5건의 탐지 유형':'검색 결과 탐지 유형'}</span><div className="rv-type-bars">{counts.map(([name,value])=><div className="rv-type-bar" key={name}><span>{name}</span><div><i style={{width:`${Math.max(4,Math.round(value/filtered.length*100))}%`}}/></div><strong>{value}건</strong></div>)}</div></div>}
          <div className="rv-table-footer"><span>{demo?'가상 이벤트 5건을 예시로 표시합니다.':`${filtered.length}건 중 ${visibleRows.length}건 표시${capped?' · 조회 제한 있음':''}`}</span><div className="rv-actions">{filtered.length>6&&<button type="button" onClick={()=>setShowAll(x=>!x)}>{showAll?'접기':'모두 표시'}</button>}{!demo&&onOpenAlerts&&<button type="button" onClick={onOpenAlerts}>이벤트 관리 열기 <ArrowRight size={14}/></button>}</div></div>
        </div>
      </div>
    </div>
    <p className="rv-disclaimer">{demo?'⚠ 현재 표시된 IP·탐지 건수·점수·이벤트는 예시이며 실제 관제 기록이 아닙니다.':'※ 실제 SOC 로그 기반 통계입니다. 내부 위험 지표는 출발지 IP 이벤트만 사용하는 참고값이며 지리적 위치나 악성 여부를 뜻하지 않습니다.'}</p>
  </section>
}
