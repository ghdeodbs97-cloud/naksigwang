// bite_v21_assertions.js — 두 점수 층·실제 날짜 조회·누락·카드 계약 검사
const legacy=(()=>{/*LEGACY_V2_ASSERTIONS*/})();
let checks=legacy.checks;const check=(ok,label)=>{if(!ok)throw Error(label);checks++;};
check(FISH.length===39&&FISH.every(f=>f.habitatSummary&&f.catchSpotSummary),'39종 서식·포인트 문구');
check(FISH.find(f=>f.n==='우럭').habitatSummary===FISH.find(f=>f.n==='조피볼락').habitatSummary,'별칭 문구 공유');
check(combineBiteScores(0,100,1.15)<90,'나쁜 서식지를 날씨만으로 90점 만들지 않음');
check(combineBiteScores(100,0,1.15)<80,'나쁜 오늘 조건을 서식만으로 80점 만들지 않음');
check(combineBiteScores(50,50)===50,'두 층 중립');
const p=POINTS[S.pt],st=STATIONS[p.st],f=FISH.find(f=>f.n==='감성돔');
for(let day=0;day<7;day++){
 const c=biteContext(p,st,day,12),direct=wxAt(st,day,12.5,p);
 check(JSON.stringify(c.wx)===JSON.stringify(direct),'실제 날짜별 wxAt 일치 '+day);
 check(JSON.stringify(c.tide)===JSON.stringify(tideAt(st,day*24+12.5)),'조석 day*24 검증 '+day);
 if(c.fu.real)check(Math.abs(c.fu.r.sp-crntAt(c.fu.nc.c,day*24+12.5).sp)<1e-8&&c.fu.nc.km<=15,'실제 유속 날짜 오프셋 '+day);
 const ev=biteEvalAt(f,p,st,day,12);
 check(ev.habitatScore>=0&&ev.habitatScore<=100&&ev.dynamicScore>=0&&ev.dynamicScore<=100&&ev.score>=0&&ev.score<=99,'층별 범위 '+day);
}
const realPoint=POINTS.find(p=>flowU(STATIONS[p.st],p,0,12.5).real);check(!!realPoint,'실제 조류 지점 존재');
for(let day=0;day<7;day++){const st=STATIONS[realPoint.st],fu=flowU(st,realPoint,day,day*24+12.5);check(fu.real&&Math.abs(fu.r.sp-crntAt(fu.nc.c,day*24+12.5).sp)<1e-8,'조류 날짜 분리 '+day);}
const w=sstForLocation(p),temp0=biteTemperature(f,p,st,0,w),temp6=biteTemperature(f,p,st,6,w);check(temp6.reliability<=temp0.reliability&&Math.abs(temp6.effect)<=Math.abs(temp0.effect),'미래 관측 수온은 중립 방향');
const savedCell=WXG.cells,savedBases=WXG.bases,savedBase=WXG.base,savedContexts=BITE_CONTEXTS;
try{
 const key=kmaGrid(p.lat,p.lon).join(','),cell={};
 for(let day=0;day<4;day++)cell[dateAdd(DAY0,day).replaceAll('-','')+'12']=[90,2+day,day*.5];
 WXG.cells={[key]:cell};WXG.bases={};WXG.base='202610250500';WX_CELL.clear();BITE_CONTEXTS=new Map();
 for(let day=0;day<4;day++){const wx=biteContext(p,st,day,14).wx;check(wx.sp===2+day&&wx.wave===day*.5&&wx.slot===12&&wx.lagHours===2,'날짜별 기상 키·3시간 fallback·캐시 '+day);}
 check(wxAt(st,3,15,p)===null,'2시간 밖/전날 자료로 대체하지 않음');
}finally{WXG.cells=savedCell;WXG.bases=savedBases;WXG.base=savedBase;WX_CELL.clear();BITE_CONTEXTS=savedContexts;}
const c=biteContext(p,st,0,12),uniform={...c,date:'2026-10-15',observation:null,fu:{real:false,u:null},tide:null,wx:null,sun:[6,18]},constantFish={...f,ecology:{...f.ecology,seasonByMonth:Array(12).fill(.5)}};
const fixedSt={...st,days:st.days.map(d=>({...d,pct:50}))};
check(biteEvalAt(constantFish,p,fixedSt,0,12,uniform).rawScore===biteEvalAt(constantFish,p,fixedSt,6,12,uniform).rawScore,'동일 입력이면 날짜가 달라도 동일 점수');
for(const fish of FISH){
 const a=biteEvalAt(fish,p,st,0,12,{...c,wx:{sp:3,wave:.3}}),b=biteEvalAt(fish,p,st,0,12,{...c,wx:{sp:10,wave:2.5}});
 check(a.habitatScore===b.habitatScore,'기상은 서식 층을 바꾸지 않음 '+fish.n);
 check(a.dynamicScore!==b.dynamicScore&&a.rawScore!==b.rawScore,'실제 다른 기상은 오늘 조건에 반영 '+fish.n);
}
check(FISH.every(f=>{const light=biteEvalAt(f,p,st,0,12).factors.find(v=>v.key==='light');return light.effect<=0||!light.label.includes('밖');}),'긍정적 시간 조건의 문구와 부호 일치');
renderBite();check([...$('fishGrid').children].every(card=>!card.textContent.includes('자료 신뢰도')),'카드 신뢰도 완전 제거');
const top=FISH.map((f,i)=>({n:f.n,i,score:Math.max(...Array.from({length:24},(_,h)=>biteAt(f,p,st,TODAY_IDX,h)))})).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,4);
renderToday();check([...document.querySelectorAll('#tdBest .nm')].map(el=>el.firstChild.textContent).join('|')===top.map(r=>r.n).join('|'),'오늘 탭 같은 V2.1 엔진');
return {checks,legacyChecks:legacy.checks};
