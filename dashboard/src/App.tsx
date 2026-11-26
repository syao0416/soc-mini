import { SocSettings } from './monitoring/SocSettings'
import { LiveDashboard, LiveAlerts, LiveLogs, LiveMonitoring, LiveResponses, LiveReputation, LiveReports } from './monitoring/LivePages'
import { ProfileMenu } from './auth/ProfileMenu'
import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Bell, FileText, Globe2, Menu, Radio, Settings, Shield, ShieldAlert, ShieldCheck, TerminalSquare, X } from 'lucide-react'


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
function App(){
  const [page,setPage]=useState<Page>('dashboard')
  const [drawerOpen,setDrawerOpen]=useState(false)
  const selectedTitle=navItems.find(i=>i.id===page)?.ko||'SOC 대시보드'
  const selectPage=(p:Page)=>{setPage(p);setDrawerOpen(false)}
  useEffect(()=>{
    function onEscape(e:KeyboardEvent){if(e.key==='Escape')setDrawerOpen(false)}
    window.addEventListener('keydown',onEscape)
    return ()=>window.removeEventListener('keydown',onEscape)
  },[])
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
      <div className="topbar-right"><span className="demo-chip"><span className="pulse-dot"/> DB SNAPSHOT</span><button className="icon-btn notifications" title="신규 Alert 확인" onClick={()=>selectPage('alerts')} aria-label="경고 관리 열기"><Bell size={20}/></button><ProfileMenu /></div>
    </header>
    <main className="page-wrap">
      {page==='dashboard' && <LiveDashboard goTo={selectPage}/>}
      {page==='alerts' && <LiveAlerts/>}
      {page==='logs' && <LiveLogs/>}
      {page==='monitoring' && <LiveMonitoring/>}
      {page==='responses' && <LiveResponses/>}
      {page==='reputation' && <LiveReputation goTo={selectPage}/>}
      {page==='reports' && <LiveReports/>}
      {page==='settings' && <SocSettings/>}
      <footer className="footer"><span>MINI SOC <i>✦</i> Security Operations Center</span><span>DESIGN SYSTEM / PURPLE GLASS · FRONTEND DEMO</span></footer>
    </main>
  </div>
}
export default App
