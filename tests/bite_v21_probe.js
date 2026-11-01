// bite_v21_probe.js — 날짜별 실제 입력·기여분과 화면 회귀 진단
showTab('bite');S.playing=false;clearTimeout(OFFICIAL_DEPTH.timer);await Promise.all([...OFFICIAL_DEPTH.pending.values()]);clearTimeout(OFFICIAL_DEPTH.timer);
const selected=[];
for(const [lat,rock] of [[38.2,false],[37.9,true],[36.05,false]]){const p=POINTS.filter(p=>p.region==='동해'&&p.lon<130&&(p.kind==='rock')===rock).sort((a,b)=>Math.abs(a.lat-lat)-Math.abs(b.lat-lat))[0];selected.push(p);}
const real=POINTS.find(p=>flowU(STATIONS[p.st],p,0,12.5).real);if(real&&!selected.includes(real))selected.push(real);
const stats=values=>{const mean=values.reduce((s,v)=>s+v,0)/values.length;return {min:Math.min(...values),max:Math.max(...values),mean,stddev:Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length),uniqueRaw:new Set(values).size,uniqueRounded:new Set(values.map(Math.round)).size};};
const points=[];
for(const p of selected){await depthPrepareAreas([[p.lon-.008,p.lat-.008,p.lon+.008,p.lat+.008]]);const st=STATIONS[p.st];BITE_CONTEXTS=new Map();const days=Array.from({length:7},(_,day)=>FISH.map(f=>{const ev=biteEvalAt(f,p,st,day,12);return {name:f.n,score:ev.score,rawScore:ev.rawScore,habitatScore:ev.habitatScore??null,dynamicScore:ev.dynamicScore??null,confidence:ev.confidence,factors:ev.factors,inputs:{date:dateAdd(DAY0,day),weather:wxAt(st,day,12.5,p),tide:tideAt(st,day*24+12.5),tidePhase:ev.sources.tide.phase,range:st.days[day].pct,current:ev.sources.current,temperature:ev.sources.temperature}};}));BITE_CONTEXTS=null;
 const curves=FISH.map(f=>({name:f.n,values:Array.from({length:24},(_,h)=>biteAt(f,p,st,0,h))}));
 const variation=FISH.map((f,i)=>({name:f.n,...stats(days.map(d=>d[i].rawScore))}));
 const warnings=variation.filter(v=>v.uniqueRaw===1).map(v=>{const rows=days.map(d=>d.find(r=>r.name===v.name)),inputs=new Set(rows.map(r=>JSON.stringify({weather:r.inputs.weather?[r.inputs.weather.sp,r.inputs.weather.wave]:null,temperature:r.inputs.temperature.enabled?[r.inputs.temperature.observation?.value,r.inputs.temperature.reliability]:null,current:r.inputs.current.source==='forecast'?r.inputs.current.speed:null,tide:[r.inputs.tidePhase,r.inputs.range]}))).size,effects=new Set(rows.map(r=>JSON.stringify(r.factors.filter(f=>['light','temperature','current','tide','wind','wave'].includes(f.key)).map(f=>f.effect)))).size;return {name:v.name,inputVariants:inputs,effectiveVariants:effects,reason:inputs===1?'동일/누락 입력':effects===1?'변화한 입력의 미적용·포화 또는 누락':'상쇄 확인 필요'};});
 points.push({name:p.name,region:p.region,environment:getPointEnvironment(p),days,curves,variation,warnings});
}
const times=[];for(let i=0;i<8;i++){const start=performance.now();renderBite();times.push(performance.now()-start);}times.sort((a,b)=>a-b);
const validations=typeof window.v21Assertions==='function'?window.v21Assertions():null;
const card=$('fishGrid').firstElementChild.getBoundingClientRect();
return {cardSize:{width:card.width,height:card.height},dataClock:META.generated,day0:DAY0,points,performance:{medianMs:times[4],maxMs:times[7]},validations};
