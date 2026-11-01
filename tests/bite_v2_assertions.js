// bite_v2_assertions.js — 같은 권역의 환경 차이·생태 방향·결정성·누락 회귀 검사
const checks=[];const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
const st=STATIONS.find(s=>s.region==='동해'),p={lat:37.5,lon:129.2,name:'가상 동해',region:'동해',targets:[]};
const fish=n=>FISH.find(f=>f.n===n),env=(depth,habitat)=>({depth,depthConfidence:1,depthRelief:habitat.deepEdge?30:null,habitat,habitatConfidence:1,evidence:{},samples:[]});
const context=(environment,speed=.35,h=12,date='2026-10-15')=>({p,environment,wx:{sp:3,wave:.4,km:0,ageHours:1,lagHours:0},observation:{value:20,km:0,ageHours:1},fu:{real:true,u:speed,r:{sp:speed*100},nc:{km:0,c:{name:'가상 예보'}}},tide:{rate:st.maxRate*.5},sun:[6,18],date,quality:{temperature:{multiplier:1},weather:{multiplier:1},tide:{multiplier:1}}});
const score=(n,c,h=12)=>biteEvalAt(fish(n),p,st,0,h,c);
const ranking=c=>FISH.map(f=>({name:f.n,score:score(f.n,c).rawScore})).sort((a,b)=>b.score-a.score).map(f=>f.name);
const fixtures={east_harbor_shallow:context(env(3,{harbor:1,breakwater:.8,rock:0,sand:.5,openSea:0,deepEdge:0}),.1),east_rocky_mid:context(env(18,{rock:1,breakwater:.4,harbor:0,sand:0,openSea:.6,deepEdge:.4}),.4),east_offshore_edge:context(env(50,{rock:.3,harbor:0,breakwater:0,sand:0,openSea:1,deepEdge:1}),.9)};
const ranks=Object.fromEntries(Object.entries(fixtures).map(([k,c])=>[k,ranking(c)]));
check(new Set(Object.values(ranks).map(r=>r.join(','))).size===3,'같은 동해 3환경의 전체 순위가 다름');
check(score('숭어',fixtures.east_harbor_shallow).rawScore>score('숭어',fixtures.east_offshore_edge).rawScore,'숭어는 얕은 항 환경 우세');
check(score('방어',fixtures.east_offshore_edge).rawScore>score('방어',fixtures.east_harbor_shallow).rawScore,'방어는 외해 깊은 환경 우세');
check(score('우럭',fixtures.east_rocky_mid).rawScore>score('우럭',fixtures.east_offshore_edge).rawScore,'우럭은 중수심 암반 우세');
check(['피문어','용가자미','참가자미'].every(n=>fish(n).ecology.seasonByMonth.every(m=>m===.5)),'모르는 월별 계절은 중립');
const base=fixtures.east_rocky_mid,depths=[3,10,25,50].map(d=>({...base,environment:env(d,base.environment.habitat)}));
check(new Set(depths.map(c=>ranking(c).join(','))).size>=3,'3/10/25/50 m 순위 변화');
check(score('대구',depths[3]).rawScore>score('대구',depths[0]).rawScore,'깊은 바닥종 수심 방향');
const habitats=['sand','rock','breakwater','harbor','openSea'].map(h=>({...base,environment:env(15,{[h]:1})}));
check(new Set(habitats.map(c=>ranking(c).join(','))).size>=4,'모래·암반·방파제·항·외해 순위 차이');
check(score('광어',habitats[0]).rawScore>score('광어',habitats[1]).rawScore,'광어 모래 선호');
const seasons=[1,4,7,10].map(m=>({...base,date:`2026-${String(m).padStart(2,'0')}-01`}));
check(new Set(seasons.map(c=>ranking(c).join(','))).size===4,'1/4/7/10월 순위 변화');
for(const f of FISH){check(f.ecology.seasonByMonth.length===12,'12개월 '+f.n);const a=ecologySeason(f.ecology,'2026-10-31'),b=ecologySeason(f.ecology,'2026-11-01');check(Math.abs(a-b)<.04,'월경계 연속 '+f.n);}
const currents=[.1,.4,.9].map(u=>context(base.environment,u));
check(new Set(currents.map(c=>ranking(c).join(','))).size===3,'약·중·강 흐름 순위 차이');
check(score('방어',currents[2]).rawScore>score('방어',currents[0]).rawScore,'회유종 강한 흐름 우세');
check(score('참문어',currents[0]).rawScore>score('참문어',currents[2]).rawScore,'문어 약한 흐름 우세');
check(score('붕장어',base,23).rawScore>score('붕장어',base,12).rawScore,'붕장어 밤 활동');
check(score('삼치',base,6).rawScore>score('삼치',base,23).rawScore,'삼치 해뜰녘 활동');
check(new Set([6,12,18,23].map(h=>FISH.map(f=>score(f.n,base,h).rawScore).join(','))).size===4,'독립 시간대 4종류 반응');
const estimated={...base,fu:{real:false,u:.8}};
check(score('방어',estimated).factors.find(f=>f.key==='current').effect===0,'조석 상대세기를 실제 m/s 선호와 비교하지 않음');
const none={...base,environment:env(null,{}),observation:null,wx:null,fu:{real:false,u:null},tide:null};none.environment.depthConfidence=0;none.environment.habitatConfidence=0;
for(const f of FISH){
 const full=score(f.n,base),missing=score(f.n,none);
 check(Number.isFinite(missing.score)&&missing.score>=0&&missing.score<=99,'누락에서도 숫자 '+f.n);
 check(missing.confidence<full.confidence,'누락 신뢰도 하락 '+f.n);
 check(missing.factors.filter(f=>['depth','habitat','temperature','current','tide','wind','wave'].includes(f.key)).every(f=>f.effect===0),'누락 기여 중립 '+f.n);
 check(JSON.stringify(full)===JSON.stringify(score(f.n,base)),'결정성 '+f.n);
 check(Math.abs(full.rawScore-full.factors.reduce((s,f)=>s+f.effect,0))<1e-8,'기여분 합계 '+f.n);
}
check(biteEvalAt(fish('우럭'),{...p,targets:'조피볼락,볼락'},st,0,12,base).score===biteEvalAt(fish('조피볼락'),{...p,targets:'조피볼락,볼락'},st,0,12,base).score,'문자열 대상어·별칭 일치');
check([['광어','넙치'],['백조기','보구치']].every(([name,alias])=>biteEvalAt(fish(name),{...p,targets:alias},st,0,12,base).rawScore===biteEvalAt(fish(name),{...p,targets:name},st,0,12,base).rawScore),'기존 대상어 별칭 보조 증거 유지');
check(fish('우럭').ecology===fish('조피볼락').ecology,'우럭 별칭 프로필 동일 참조');
for(let h=0;h<24;h++)check(score('우럭',base,h).rawScore===score('조피볼락',base,h).rawScore,'별칭 점수 동일 '+h);
const change={...base,date:'2026-10-15'};const saved=CATCHES;try{CATCHES=[];const a=score('우럭',change);CATCHES=[{pt:p.name,region:st.region,date:'2026-10-01',species:'조피볼락',count:1}];const b=score('우럭',change);check(b.rawScore>a.rawScore&&b.confidence===a.confidence,'내 기록 별칭·신뢰도 독립');}finally{CATCHES=saved;}
return {checks:checks.length,syntheticRankings:ranks,depthRankings:depths.map(ranking),habitatRankings:habitats.map(ranking),seasonRankings:seasons.map(ranking),currentRankings:currents.map(ranking)};
