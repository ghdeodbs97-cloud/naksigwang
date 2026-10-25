// 14_bite.js — 시간별 입질 지수
// 규칙 기반 조건점수와 자료 신뢰도를 별도로 계산한다.
// 조차가 작은 바다는 조석 추정의 비중만 줄이고 실제 환경 차이는 유지한다.
const weakTide = st => st.maxCm - st.minCm < 60;
function biteDataQuality(name) {
  const m = META[name + '.json'], status = m?.status || '', age = (Date.now() - Date.parse(META.generated)) / 36e5;
  // P0 메타는 파일 단위이므로 특정 포인트의 복구 여부로 단정하지 않는다.
  const retained = status.startsWith('kept_previous') || status === 'no_data_to_save';
  const fallback = status === 'merged_fallback' || m?.fallback > 0, stale = !Number.isFinite(age) || age > 24;
  return { status, retained, fallback, stale, multiplier: META.degraded ? .7 : retained ? .65 : stale ? .75 : fallback ? .85 : 1 };
}
function biteTemperature(fish, p, st, day = 0, observation) {
  const w = observation === undefined ? sstForLocation(p) : observation, pref = fish.ecology.temperature, enabled=!!pref;
  const ahead = Math.max(0, (Date.parse(dateAdd(DAY0, day) + 'T12:00:00+09:00') - Date.now()) / 36e5);
  const reliability = w ? clamp(1-w.km/50,0,1)*clamp(1-.5*w.ageHours/24,0,1)/(1+ahead/48) : 0;
  const delta=w&&enabled?Math.max(0,pref[0]-w.value,w.value-pref[1]):0;
  return {observation:w,enabled,reliability,delta,effect:w&&enabled?14*(ecologyRange(w.value,pref)-.5)*reliability:0};
}
let CATCHES = [];
function myF(fish, st, pt) {
  const trips=new Map(),alias=n=>n==='조피볼락'?'우럭':n;
  for(const c of CATCHES){
    const local=pt&&c.pt===pt.name,near=pt&&Number.isFinite(c.lat)&&Number.isFinite(c.lon)&&gdist(pt,c)<5;
    const weight=local?1:near?.6:c.region===st.region?.15:0;if(!weight)continue;
    const key=c.date+'|'+c.pt,trip=trips.get(key)||{weight,hit:false};
    trip.hit ||= c.count>0&&alias(c.species)===alias(fish.n);trips.set(key,trip);
  }
  const n=[...trips.values()].reduce((s,t)=>s+t.weight,0),hit=[...trips.values()].reduce((s,t)=>s+(t.hit?t.weight:0),0);
  return {f:1+(hit-.5*n)/(n+8)*.3,n,hit};
}
// 한 번의 렌더 안에서만 공통 예보를 공유한다. 대역 함수·자료 변경이 캐시에 남지 않는다.
let BITE_CONTEXTS=null;
function biteContext(pt,st,day,h){
 const key=[pt?.lat,pt?.lon,st.id,day,h].join('|');if(BITE_CONTEXTS?.has(key))return BITE_CONTEXTS.get(key);
 const p=pt||st,t=day*24+h+.5,tide=tideAt(st,t),fu=flowU(st,pt,day,t);
 const value={p,environment:getPointEnvironment(p),wx:wxAt(st,day,h+.5,pt),observation:sstForLocation(p),fu,tide,sun:sunTimes(p.lat,p.lon,day),quality:{temperature:biteDataQuality('obs'),weather:biteDataQuality('wx'),tide:biteDataQuality('tide')}};
 BITE_CONTEXTS?.set(key,value);return value;
}
function biteEvalAt(fish, pt, st, day, h, supplied) {
 const profile=fish.ecology;if(!profile)return {modelStatus:'provisional',score:null,rawScore:null,confidence:null,confidenceLevel:'미설정',factors:[],sources:{}};
 const c=supplied||biteContext(pt,st,day,h),{p,environment:e,wx,fu,tide,quality}=c,temperature=biteTemperature(fish,p,st,day,c.observation);
 const factors=[],add=(key,label,effect,quality='estimated')=>factors.push({key,label,effect,quality});
 const season=ecologySeason(profile,c.date||dateAdd(DAY0,day)),prior=profile.regionPrior?.[REG_IDX[pt?.region||st.region]]??.5;
 // 총 100점 범위: 출현 20(권역은 6), 서식 33, 활동 47. 누락은 0.5 적합도.
 add('neutral','알 수 없는 조건은 중립',50,'rule');
 add('season','월별 계절 적합도',14*(season-.5),'rule');add('region','광역 출현 참고',6*(prior-.5),'rule');
 const depthFit=ecologyRange(e.depth,profile.depth);
 add('depth',e.depth==null?'수심 자료 없음':e.depthConfidence<.4?'넓은 격자 수심 참고 (추정)':depthFit>=.8?'선호 수심대':e.depth<profile.depth[0]?'선호 수심보다 얕음':'선호 수심보다 깊음',14*(depthFit-.5)*e.depthConfidence,e.depth==null?'missing':'estimated');
 let habitatSum=0,habitatWeight=0;const detail=[];
 for(const [key,pref] of Object.entries(profile.habitat)){if(e.habitat[key]==null)continue;const weight=e.habitat[key];habitatSum+=weight*pref;habitatWeight+=weight;detail.push([key,weight*(pref-.5)]);}
 const habitatFit=.5+(habitatSum-.5*habitatWeight)/Math.max(1,habitatWeight);
 detail.sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
 const habitatNames={rock:'암반·갯바위',breakwater:'방파제·구조물',harbor:'항 주변',sand:'모래 환경 추정',mud:'갯벌 환경 추정',openSea:'외해 노출 추정',deepEdge:'주변 수심 변화'};
 add('habitat',detail.length?habitatNames[detail[0][0]]+' '+(habitatFit>=.5?'환경 적합':'환경 덜 적합'):'서식환경 자료 부족',18*(habitatFit-.5)*e.habitatConfidence,habitatWeight?'estimated':'missing');
 add('target','기존 대상어 목록 참고',String(pt?.targets||'').replaceAll('조피볼락','우럭').replaceAll('넙치','광어').replaceAll('보구치','백조기').includes(fish.aliasOf||fish.n)?1:0,'rule');
 const light=ecologyLight(profile,h+.5,...c.sun);
 add('light',ecologyLightName(fish)+' 활동시간 '+(light>=.7?'적합':'밖'),16*(light-.5));
 add('temperature',!temperature.observation?'수온 자료 없음':!temperature.enabled?'수온 기준 미확인':temperature.delta?'선호 수온 범위 밖':'선호 수온대',temperature.effect,temperature.observation&&temperature.enabled?'measured':'missing');
 // 실제 cm/s 예보만 m/s 선호와 비교한다. 조석 상대세기는 유속으로 환산하지 않고 조석 조건에서만 참고한다.
 const [preferred,tolerance,sensitivity]=profile.current,realCurrent=fu.real&&Number.isFinite(fu.r?.sp),relativeAvailable=Number.isFinite(fu.u),u=realCurrent?Math.abs(fu.r.sp)/100:null;
 const currentFit=u==null?.5:clamp(1-Math.abs(u-preferred)/tolerance,0,1),currentReliability=realCurrent?1:0;
 add('current',realCurrent?(u<preferred?'선호 흐름보다 약함':'예보 유속 참고'):'조류 예보 없음 · 조석 변화만 참고',9*(currentFit-.5)*sensitivity*currentReliability,realCurrent?'forecast':relativeAvailable?'estimated':'missing');
 const [rising,falling,slack,rangeSensitivity]=profile.tide,rate=tide?.rate,phase=rate==null?'unknown':Math.abs(rate)/st.maxRate<.12?'nearSlack':rate>0?'rising':'falling';
 const tideFit=phase==='unknown'?.5:phase==='nearSlack'?slack:phase==='rising'?rising:falling;
 const tideReliability=phase==='unknown'?0:weakTide(st)?.15:1;
 add('tide','바닷물 높이 '+({rising:'오르는 중',falling:'내리는 중',nearSlack:'변화 작음',unknown:'자료 없음'}[phase]),4*(tideFit-.5)*tideReliability*rangeSensitivity*(.5+.5*(st.days[day]?.pct??50)/100),phase==='unknown'?'missing':'forecast');
 const [windSensitivity,wavePreferred,waveTolerance]=profile.weather,exposure=e.habitat.openSea??.5;
 add('wind',wx?.sp==null?'풍속 자료 없음':'바람의 수면 영향 (추정)',wx?.sp==null?0:2*(.5-clamp(wx.sp/14,0,1))*windSensitivity*(.5+exposure),wx?.sp==null?'missing':'forecast');
 const waveFit=wx?.wave==null?.5:clamp(1-Math.abs(wx.wave-wavePreferred)/waveTolerance,0,1);
 add('wave',wx?.wave==null?'파고 자료 없음':waveFit>.6?'활동에 맞는 파도 (추정)':'선호 파도 범위 밖',4*(waveFit-.5)*(.5+exposure)/1.5,wx?.wave==null?'missing':'forecast');
 const subtotal=factors.reduce((s,f)=>s+f.effect,0),mine=myF(fish,st,pt);add('catch','가까운 내 조황기록 보정',subtotal*(mine.f-1),'personal');
 const wxQuality=wx?clamp((wx.near?Math.max(.5,1-wx.km/25):1)*(wx.ageHours==null?.5:wx.ageHours>24?.6:1)*(1-.1*(wx.lagHours||0))*quality.weather.multiplier,0,1):0;
 const confidence=Math.round(clamp(15*profile.confidence+15*e.depthConfidence+15*e.habitatConfidence+20*temperature.reliability*(temperature.enabled?1:0)*quality.temperature.multiplier+(wx?.sp==null?0:5*wxQuality)+(wx?.wave==null?0:10*wxQuality)+(realCurrent?15*clamp(1-.3*fu.nc.km/15,0,1):relativeAvailable?3*quality.tide.multiplier:0)+5*tideReliability*quality.tide.multiplier,0,100));
 const rawScore=clamp(subtotal*mine.f,0,99);
 return {modelStatus:'partial',score:Math.round(rawScore),rawScore,confidence,confidenceLevel:confidence>=80?'높음':confidence>=55?'보통':'낮음',factors,components:{occurrenceFit:.7*season+.3*prior,habitatFit,depthFit,lightFit:light},sources:{profile:profile.provenance,environment:e,temperature:{...temperature,...quality.temperature},weather:{...(wx||{}),...quality.weather,stale:quality.weather.stale||!!wx&&(wx.ageHours==null||wx.ageHours>24),quality:wx?'forecast':'missing'},tide:{station:st.id,phase,km:gdist(p,st),weak:weakTide(st),...quality.tide},current:{source:realCurrent?'forecast':relativeAvailable?'tide_estimate':'missing',station:fu.real?fu.nc.c.name:st.id,km:fu.real?fu.nc.km:gdist(p,st),u:fu.u,speed:u,unit:realCurrent?'m/s':'relative_estimate'}}};
}
function biteAt(fish, pt, st, day, h) { return biteEvalAt(fish, pt, st, day, h).score; }
function biteReasons(ev) {
  if (ev.modelStatus === 'provisional') return '입질 계산 기준 미설정';
  if (ev.score === 0) return '현재 알려진 조건의 적합도가 매우 낮음';
  const relevant = ev.factors.filter(f => !['neutral', 'base', 'catch', 'region'].includes(f.key));
  const positive = relevant.filter(f => f.effect > .05).sort((a, b) => b.effect - a.effect);
  const negative = relevant.filter(f => f.effect < -.05).sort((a, b) => a.effect - b.effect);
  const environmental = relevant.filter(f => ['depth', 'habitat'].includes(f.key) && Math.abs(f.effect) > .4).sort((a,b) => Math.abs(b.effect)-Math.abs(a.effect));
  const chosen = environmental.slice(0,1);
  for (const f of [...positive.slice(0,1), ...negative.slice(0,1)]) if (!chosen.includes(f)) chosen.push(f);
  for (const f of [...relevant.filter(f => f.quality === 'missing' || f.key === 'current' && f.quality === 'estimated'), ...positive, ...negative]) if (!chosen.includes(f) && chosen.length < 4) chosen.push(f);
  return chosen.map(f => `${f.quality === 'missing' || f.key === 'current' && f.quality === 'estimated' ? '참고' : f.effect > 0 ? '+' : '−'} ${f.label}`).join(' · ');
}
const level = p => p >= 60 ? ['높음', 'hi'] : p >= 40 ? ['보통', 'mid'] : p > 0 ? ['낮음', 'lo'] : ['없음', 'none'];
function spark(arr, sel) {
  const w = 120, hh = 26, bw = w / 24;
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}" aria-hidden="true">` + arr.map((p, i) => { const bh = Math.max(1, p / 100 * (hh - 2)), c = p >= 60 ? '#5ff0a8' : p >= 40 ? '#ffb84d' : p > 0 ? '#3d6670' : '#22343a'; return `<rect x="${(i * bw + .5).toFixed(1)}" y="${(hh - bh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}"${i === sel ? ' stroke="#fff" stroke-width="1"' : ''}/>`; }).join('') + '</svg>';
}
let biteHour = -1, biteDataMinute = -1, BITE_H = null;
function renderBite() {
  const st = STATIONS[S.st], d = st.days[S.day], pt = POINTS[S.pt], H = Math.floor(S.t);
  biteHour = H;
  // 관측 만료·발표 자료의 24시간 경계와 수온 age를 최대 약 1분 안에 반영한다.
  biteDataMinute = Math.floor(Date.now() / 60000);
  $('biteSub').textContent = `${pt ? pt.name : st.name} · ${d.date.slice(5).replace('-', '/')} ${String(H).padStart(2, '0')}시 · ${d.mul}`;
  const [sr, ss] = sunTimes(pt ? pt.lat : st.lat, pt ? pt.lon : st.lon, S.day);
  BITE_CONTEXTS=new Map();
  const rows = FISH.filter(fishHasBiteModel).map((f, i) => { const arr = Array.from({ length: 24 }, (_, h) => biteAt(f, pt, st, S.day, h)); const best = arr.indexOf(Math.max(...arr)); return { f, i, arr, p: arr[H], best, ev: biteEvalAt(f, pt, st, S.day, H) }; }).sort((a, b) => b.p - a.p || b.arr[b.best] - a.arr[a.best]);
  BITE_CONTEXTS=null;
  BITE_H = { sr, ss, best: Array.from({ length: 24 }, (_, h) => { let b = null; for (const r of rows) if (!b || r.arr[h] > b.p) b = { p: r.arr[h], n: r.f.n }; return b; }) };
  const top = rows.filter(r => r.arr[r.best] >= 60);
  $('biteWin').textContent = `해 뜸 ${fmtH(sr)} · 해 짐 ${fmtH(ss)} · ` + (top.length ? '오늘 "높음"이 나오는 시간: ' + top.slice(0, 4).map(r => `${r.f.n} ${String(r.best).padStart(2, '0')}시`).join(', ') : '오늘은 "높음"이 나오는 시간이 없습니다.');
  $('fishGrid').innerHTML = rows.map(({ f, i, arr, p, best, ev }) => {
    const [lv, cls] = level(p);
    return `<div class="fish ${cls}"><div class="pic">${fishPicture(f, 'bite' + i)}</div><div class="fn">${f.n}<span class="lt">${ecologyLightName(f)}</span></div><div class="fp"><b>${p}점</b><span class="lv ${cls}">${lv}</span></div>${spark(arr, H)}<div class="bestH">최고 ${String(best).padStart(2, '0')}시 ${arr[best]}점</div><p class="biteConfidence">자료 신뢰도 ${ev.confidenceLevel}</p><p class="biteReasons">${biteReasons(ev)}</p></div>`;
  }).join('') + FISH.filter(f => !fishHasBiteModel(f)).map((f, i) => `<div class="fish provisional"><div class="pic">${fishPicture(f, 'new' + i)}</div><div class="fn">${f.n}</div><div class="fp"><b>—</b><span class="lv">미설정</span></div><p class="fishModelNote">입질 계산 기준 미설정 · 추천 순위 제외${f.aliasOf ? `<br>${f.aliasOf}과 같은 어종` : ''}</p></div>`).join('');
  if (pt && pt.kind === 'rock') $('rockInfo').innerHTML = rockInfoHTML(pt); else $('rockInfo').innerHTML = '';
  if (typeof renderBasis === 'function') renderBasis();
  if (typeof renderToday === 'function') renderToday(rows);
  if (typeof renderLog === 'function') renderLog();
}
