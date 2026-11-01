// 진단 중 지도 viewport의 지연 수심 요청이 포인트별 자료 준비와 경쟁하지 않게 한다.
showTab('bite'); S.playing=false; clearTimeout(OFFICIAL_DEPTH.timer);
await Promise.all([...OFFICIAL_DEPTH.pending.values()]);
clearTimeout(OFFICIAL_DEPTH.timer); await new Promise(r=>setTimeout(r,250)); clearTimeout(OFFICIAL_DEPTH.timer);
const corr=(a,b)=>{const av=a.reduce((s,x)=>s+x,0)/a.length,bv=b.reduce((s,x)=>s+x,0)/b.length;const aa=a.map(x=>x-av),bb=b.map(x=>x-bv);const den=Math.sqrt(aa.reduce((s,x)=>s+x*x,0)*bb.reduce((s,x)=>s+x*x,0));return den?aa.reduce((s,x,i)=>s+x*bb[i],0)/den:0;};
const points=[];
for(const lat of [38.2,37.9,37.5,36.05]) for(const rock of [false,true]){
 const p=POINTS.filter(p=>p.region==='동해'&&p.lon<130&&(p.kind==='rock')===rock).sort((a,b)=>Math.abs(a.lat-lat)-Math.abs(b.lat-lat))[0]; if(!p)continue;
 await depthPrepareAreas([[p.lon-.008,p.lat-.008,p.lon+.008,p.lat+.008]]);
 const st=STATIONS[p.st],t=performance.now();
 const matrix=FISH.filter(fishHasBiteModel).map(f=>({name:f.n,curve:Array.from({length:24},(_,h)=>biteEvalAt(f,p,st,S.day,h).rawScore)}));
 const ms=performance.now()-t,pairs=[];
 matrix.forEach((a,i)=>matrix.slice(i+1).forEach(b=>pairs.push({a:a.name,b:b.name,r:corr(a.curve,b.curve)})));
 const e=biteEvalAt(FISH[0],p,st,S.day,9);
 if(typeof getPointEnvironment==='function' && getPointEnvironment(p)!==getPointEnvironment(p))throw Error('포인트 환경 캐시 재사용 실패');
 points.push({name:p.name,kind:p.kind||'port',environment:typeof getPointEnvironment==='function'?getPointEnvironment(p):null,current:e.sources.current,temperature:e.sources.temperature,matrix,ms,highCorrelation:pairs.filter(x=>x.r>.95),pairCount:pairs.length,top10:matrix.slice().sort((a,b)=>b.curve[9]-a.curve[9]).slice(0,10).map(x=>x.name)});
}
let sharedCurveCalls=null;
if(typeof getPointEnvironment==='function' && S.day===TODAY_IDX){const original=biteAt;let calls=0;try{biteAt=(...args)=>{calls++;return original(...args);};renderBite();}finally{biteAt=original;}if(calls!==FISH.filter(fishHasBiteModel).length*24)throw Error('오늘·입질 곡선 중복 계산 '+calls);sharedCurveCalls=calls;}
const renders=[];for(let i=0;i<8;i++){const t=performance.now();renderBite();renders.push(performance.now()-t);}renders.sort((a,b)=>a-b);
return {sharedCurveCalls,renderMedianMs:renders[4],renderMaxMs:renders[7],numericSpecies:FISH.filter(fishHasBiteModel).length,points,meanMs:points.reduce((s,p)=>s+p.ms,0)/points.length,highCorrelationFraction:points.reduce((s,p)=>s+p.highCorrelation.length/p.pairCount,0)/points.length};
