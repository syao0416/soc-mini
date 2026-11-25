export type Severity = 'Emerg' | 'Notice' | 'Info' | 'Debug'
export type Source = 'EDR' | 'Firewall' | 'IDS' | 'IPS' | 'WAF'
export type AlertStatus = '신규' | '분석 중' | '처리 완료'
export type Period = 'day' | 'month' | 'year'

export interface SecurityAlert {
  id: string
  at: string
  severity: Severity
  source: Source
  title: string
  attackType: string
  srcIp: string
  dstIp: string
  status: AlertStatus
  rule: string
  evidence: string
  rawLog: string
  note: string
}
export interface SecurityLog {
  id: string
  at: string
  source: string
  type: 'access_log' | 'auth.log' | 'snort.alert' | 'firewall.log' | 'edr.event'
  srcIp: string
  event: string
  raw: string
  normalized: string
}
export interface ResponseRecord {
  id: string
  at: string
  srcIp: string
  action: '차단 검토' | '차단 시뮬레이션' | '해제 검토'
  reason: string
  result: string
  alertId: string
}
export const demoAlerts: SecurityAlert[] = [
 { id:'ALT-1042', at:'2026-11-24 13:42:18',severity:'Emerg',source:'IDS',title:'SSH Brute Force 의심',attackType:'무차별 대입',srcIp:'198.51.100.24',dstIp:'192.168.56.30',status:'신규',rule:'SOC-SSH-001',evidence:'5분 내 로그인 실패 28회 · auth.log 이벤트 상관 분석',rawLog:'Nov 24 13:42:18 target sshd[1932]: Failed password for invalid user admin from 198.51.100.24 port 51242 ssh2',note:''},
 { id:'ALT-1041', at:'2026-11-24 13:30:06',severity:'Notice',source:'Firewall',title:'비정상 포트 스캔 감지',attackType:'포트 스캔',srcIp:'203.0.113.18',dstIp:'192.168.56.30',status:'분석 중',rule:'SOC-NET-012',evidence:'짧은 시간 다수 포트 연결 시도 · 방화벽 허용/차단 로그 비교',rawLog:'Nov 24 13:30:06 firewall kernel: IPTABLES-LOG TCP 203.0.113.18:45128 -> 192.168.56.30:22 BLOCK',note:'동일 출발지의 최근 이벤트 확인 중'},
 { id:'ALT-1040', at:'2026-11-24 12:58:41',severity:'Info',source:'IDS',title:'HTTP 비정상 경로 요청',attackType:'웹 경로 탐색',srcIp:'192.0.2.77',dstIp:'192.168.56.30',status:'신규',rule:'SOC-WEB-003',evidence:'access_log에 비정상 경로 접근 14회 관찰',rawLog:'192.0.2.77 - - [24/Nov/2026:12:58:41 +0900] "GET /admin/ HTTP/1.1" 404 221',note:''},
 { id:'ALT-1039', at:'2026-11-24 11:42:03',severity:'Debug',source:'EDR',title:'호스트 프로세스 이벤트',attackType:'호스트 이벤트',srcIp:'192.168.56.30',dstIp:'—',status:'처리 완료',rule:'SOC-HOST-101',evidence:'훈련용으로 생성한 호스트 프로세스 실행 이벤트',rawLog:'{"timestamp":"2026-11-24T11:42:03+09:00","event":"process_start","host":"ubuntu-target","process":"/usr/bin/bash"}',note:'데모 호스트 이벤트로 분류'},
 { id:'ALT-1038', at:'2026-11-24 11:10:19',severity:'Emerg',source:'Firewall',title:'반복 접속 차단 이벤트',attackType:'접근 제어',srcIp:'198.51.100.91',dstIp:'192.168.56.10',status:'분석 중',rule:'SOC-FW-007',evidence:'동일 출발지의 반복 연결 차단 로그 · 정책 변경 여부 추가 확인 필요',rawLog:'Nov 24 11:10:19 firewall kernel: IPTABLES-LOG TCP 198.51.100.91:40421 -> 192.168.56.10:443 BLOCK',note:''},
 { id:'ALT-1037', at:'2026-11-24 10:35:12',severity:'Notice',source:'IDS',title:'웹 공격 탐지 시그니처',attackType:'웹 공격 의심',srcIp:'203.0.113.44',dstIp:'192.168.56.30',status:'신규',rule:'SID-2001219',evidence:'Snort IDS EVE 탐지 이벤트 · 페이로드 확인 필요',rawLog:'{"event_type":"alert","src_ip":"203.0.113.44","dest_ip":"192.168.56.30","alert":{"signature":"WEB suspicious request","severity":2}}',note:''},
 { id:'ALT-1036', at:'2026-11-23 21:16:27',severity:'Info',source:'Firewall',title:'정책 허용 이벤트',attackType:'정상 트래픽 확인',srcIp:'192.0.2.31',dstIp:'192.168.56.30',status:'처리 완료',rule:'SOC-FW-INFO',evidence:'사전 등록된 테스트 시나리오 · 허용 정책 일치',rawLog:'Nov 23 21:16:27 firewall kernel: IPTABLES-LOG TCP 192.0.2.31:57419 -> 192.168.56.30:80 PASS',note:'테스트 로그로 확인'},
 { id:'ALT-1035', at:'2026-11-23 19:22:54',severity:'Debug',source:'WAF',title:'WAF 이벤트 스키마 예시',attackType:'연동 데이터 예시',srcIp:'203.0.113.9',dstIp:'192.168.56.30',status:'처리 완료',rule:'SOC-DEMO-WAF',evidence:'실제 WAF 미연동 · UI 점검용 예시 데이터',rawLog:'{"source":"waf","mode":"demo","action":"observe","rule":"SOC-DEMO-WAF"}',note:'WAF 미연동 샘플'},
 { id:'ALT-1034', at:'2026-11-22 16:04:11',severity:'Notice',source:'IPS',title:'IPS 대응 데이터 예시',attackType:'연동 데이터 예시',srcIp:'198.51.100.65',dstIp:'192.168.56.30',status:'처리 완료',rule:'SOC-DEMO-IPS',evidence:'실제 IPS 미연동 · UI 점검용 예시 데이터',rawLog:'{"source":"ips","mode":"demo","action":"simulated"}',note:'IPS 미연동 샘플'},
]
export const demoLogs: SecurityLog[] = [
 {id:'LOG-1821',at:'2026-11-24 13:42:18',source:'Ubuntu Target',type:'auth.log',srcIp:'198.51.100.24',event:'SSH 로그인 실패',raw:'Nov 24 13:42:18 target sshd[1932]: Failed password for invalid user admin from 198.51.100.24 port 51242 ssh2',normalized:'{"event_type":"ssh_auth_failure","src_ip":"198.51.100.24","count":28,"host":"target"}'},
 {id:'LOG-1820',at:'2026-11-24 13:30:06',source:'Ubuntu iptables (데모)',type:'firewall.log',srcIp:'203.0.113.18',event:'다중 포트 연결 시도',raw:'Nov 24 13:30:06 firewall kernel: IPTABLES-LOG TCP 203.0.113.18:45128 -> 192.168.56.30:22 BLOCK',normalized:'{"event_type":"network_block","src_ip":"203.0.113.18","action":"block"}'},
 {id:'LOG-1819',at:'2026-11-24 12:58:41',source:'Apache (데모)',type:'access_log',srcIp:'192.0.2.77',event:'HTTP 404 요청',raw:'192.0.2.77 - - [24/Nov/2026:12:58:41 +0900] "GET /admin/ HTTP/1.1" 404 221',normalized:'{"event_type":"http_access","src_ip":"192.0.2.77","status_code":404,"path":"/admin/"}'},
 {id:'LOG-1818',at:'2026-11-24 11:42:03',source:'Host Sensor (데모)',type:'edr.event',srcIp:'192.168.56.30',event:'프로세스 실행',raw:'{"event":"process_start","process":"/usr/bin/bash","host":"ubuntu-target"}',normalized:'{"event_type":"process_start","host":"ubuntu-target"}'},
 {id:'LOG-1817',at:'2026-11-24 11:10:19',source:'Ubuntu iptables (데모)',type:'firewall.log',srcIp:'198.51.100.91',event:'연결 차단',raw:'Nov 24 11:10:19 firewall kernel: IPTABLES-LOG TCP 198.51.100.91:40421 -> 192.168.56.10:443 BLOCK',normalized:'{"event_type":"network_block","src_ip":"198.51.100.91","action":"block"}'},
 {id:'LOG-1816',at:'2026-11-24 10:35:12',source:'Snort IDS (데모)',type:'snort.alert',srcIp:'203.0.113.44',event:'IDS 시그니처 탐지',raw:'{"event_type":"alert","src_ip":"203.0.113.44","alert":{"signature":"WEB suspicious request"}}',normalized:'{"event_type":"ids_alert","src_ip":"203.0.113.44","signature_id":2001219}'},
 {id:'LOG-1815',at:'2026-11-23 21:16:27',source:'Ubuntu iptables (데모)',type:'firewall.log',srcIp:'192.0.2.31',event:'연결 허용',raw:'Nov 23 21:16:27 firewall kernel: IPTABLES-LOG TCP 192.0.2.31:57419 -> 192.168.56.30:80 PASS',normalized:'{"event_type":"network_allow","src_ip":"192.0.2.31","action":"pass"}'},
]
export const demoResponses: ResponseRecord[] = [
 {id:'RSP-064',at:'2026-11-24 13:41',srcIp:'198.51.100.24',action:'차단 검토',reason:'SSH 인증 실패 누적',result:'승인 대기 · 실행하지 않음',alertId:'ALT-1042'},
 {id:'RSP-063',at:'2026-11-24 12:20',srcIp:'203.0.113.18',action:'차단 시뮬레이션',reason:'다중 포트 연결 시도',result:'시뮬레이션만 완료',alertId:'ALT-1041'},
 {id:'RSP-062',at:'2026-11-23 17:32',srcIp:'192.0.2.31',action:'해제 검토',reason:'테스트 트래픽 식별',result:'검토 완료 · 실행하지 않음',alertId:'ALT-1036'},
]
export const timeline: Record<Period, {label:string; amount:number}[]> = {
 day:[{label:'00',amount:10},{label:'02',amount:13},{label:'04',amount:9},{label:'06',amount:22},{label:'08',amount:28},{label:'10',amount:18},{label:'12',amount:36},{label:'14',amount:31},{label:'16',amount:45},{label:'18',amount:38},{label:'20',amount:62},{label:'22',amount:40}],
 month:[{label:'1일',amount:20},{label:'3일',amount:29},{label:'5일',amount:23},{label:'7일',amount:44},{label:'9일',amount:40},{label:'11일',amount:52},{label:'13일',amount:48},{label:'15일',amount:68},{label:'17일',amount:61},{label:'19일',amount:82},{label:'21일',amount:74},{label:'24일',amount:91}],
 year:[{label:'1월',amount:22},{label:'2월',amount:26},{label:'3월',amount:35},{label:'4월',amount:33},{label:'5월',amount:41},{label:'6월',amount:43},{label:'7월',amount:56},{label:'8월',amount:51},{label:'9월',amount:66},{label:'10월',amount:75},{label:'11월',amount:84},{label:'12월',amount:0}],
}
