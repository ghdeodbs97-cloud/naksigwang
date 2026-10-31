// 13a_east_ports.js — 기존 지도 이름·공식 예보 지점으로 동해 항구 목록 보강
const EAST_MAJOR_PORTS=new Set(['주문진항','속초항','묵호항','동해항','삼척항','옥계항','후포항','강구항','구룡포항','포항구항','포항영일신항만']);
// 2026-10-31 수집본의 KHOA 조석 지점. 하루 예보의 일시 누락과 항구 목록을 분리한다.
const EAST_PORT_REFS=[['묵호',37.55027,129.11638],['후포',36.6775,129.45305]];
function eastPortName(name){return String(name).replace(/\([^)]*\)/g,'').replace(/\s+/g,'').replace(/(?:선착장|나루터|포구|항구|항)$/,'');}
function eastPortSupplements(){
 const ports=[];
 for(const o of OSM.list){
  if(o.c!=='hn'||!o.name||o.name.includes('*')||/공항|비행장|호텔|크루즈|크루스/.test(o.name)||['포항','북포항'].includes(o.name))continue;
  if(!/(?:항|포구|선착장|나루터|항만)(?:\([^)]*\))?$/.test(o.name)||!o.R?.[0]?.n)continue;
  const name=o.name.replace(/\([^)]*\)/g,'').trim(),mx=o.R[0].xs[0],my=o.R[0].ys[0];
  ports.push({name,lat:latOf(my),lon:lonOf(mx),mx,my,type:EAST_MAJOR_PORTS.has(name)?'주요항 · OSM':'항·선착장 · OSM',portSource:'OpenStreetMap 항·선착장 이름 위치'});
 }
 // 지도 이름 자료에 없는 두 주요 항은 기존 국립해양조사원 지점을 대표 위치로 쓴다.
 for(const [name,lat,lon] of EAST_PORT_REFS){
  ports.push({name:name+'항',lat,lon,mx:mxOf(lon),my:myOf(lat),type:'주요항 · KHOA',portSource:'국립해양조사원 '+name+' 조석 예보 대표 위치'});
 }
 return ports;
}
