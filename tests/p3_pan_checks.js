// p3_pan_checks.js — native 입력 선행 숨김·실제 draw stamp·지연 이벤트와 누적 이동 검사
window.p3PanTest=async({quick=false}={})=>{
  const p=PROVIDER_MAP,tick=()=>new Promise(requestAnimationFrame),check=(v,m)=>{if(!v)throw Error(m);};
  showTab('map');await new Promise(r=>setTimeout(r,350));S.playing=false;S.layers.flow=true;setMode('pan');
  const f=new FakeMapAdapter();f.init($('providerMap'));const surface=document.createElement('canvas');surface.width=surface.height=1;f.container.append(surface);
  Object.assign(p,{adapter:f,active:false,failed:false,loaded:true,signature:'',sizeKey:'',stableZoom:null,navigationFailed:false,fallbackCount:0,healthState:'healthy',moveGeneration:0});
  f.onViewportReady(providerViewportChanged);f.onTilesLoaded(providerTilesLoaded);
  const jang=PORTS.find(q=>q.name==='장봉항'),j=POINTS.findIndex(q=>q.name==='장봉항');check(jang&&j>=0,'실제 장봉항 자료');
  const wait=async()=>{for(let i=0;i<60;i++){await tick();if(!p.providerMoving&&!p.commandPending&&!p.revealAfterBase&&!dirty&&!stage.classList.contains('provider-moving'))return;}throw Error('자동 공개 상한 '+JSON.stringify(naksigwangMapDiagnostic.overlay()));};
  await fitGround(jang.lat,jang.lon,2500);await wait();
  S.A=[mxOf(jang.lon-.0006),myOf(jang.lat+.0006)];S.B=[mxOf(jang.lon+.0006),myOf(jang.lat-.0006)];S.pin=[mxOf(jang.lon),myOf(jang.lat)];analyzeSection();
  PROVIDER_DEBUG={lat:jang.lat,lon:jang.lon,native:f.createDebugMarker(jang.lat,jang.lon)};
  const ab=JSON.stringify([S.A,S.B,S.pin]),abMarkers=[S.A,S.B].map(a=>f.createDebugMarker(latOf(a[1]),lonOf(a[0])));
  let arcs=[],inUI=false;const arc=uctx.arc,draw=drawUI,prepare=depthPrepareAreas;
  uctx.arc=function(x,y,r,...args){if(inUI&&r===9)arcs.push([x,y]);return arc.call(this,x,y,r,...args);};
  drawUI=(...args)=>{arcs=[];inUI=true;try{return draw(...args);}finally{inUI=false;}};
  let movingDepthPrepare=0;depthPrepareAreas=(...a)=>{if(p.providerMoving)movingDepthPrepare++;return prepare(...a);};
  dirty=true;await p3WaitDepthQuiet();await wait();
  const counts={},latencies={pointerup:[],dragend:[],idle:[]},latencyWorst={},errors=[],baseCounts=[],uiCounts=[];let currentPhase='';
  let staleOverlayVisibleFrames=0,permanentHidden=0,maxAB=0,maxMarker=0,movingHeavy=0,total=0;
  // 구현의 reveal 카운터와 별개로 매 paint 기회에 실제 CSS와 현재 SDK/draw key를 대조한다.
  let auditRAF=0,auditing=true;
  const audit=()=>{if(!auditing)return;const visible=getComputedStyle(ui).visibility==='visible';if(visible&&p.active&&!p.failed&&(p.providerMoving||p.commandPending||nativePointers.size||RENDER.renderedProviderViewportKey!==providerViewportKey()))staleOverlayVisibleFrames++;auditRAF=requestAnimationFrame(audit);};
  auditRAF=requestAnimationFrame(audit);
  const work=()=>Object.fromEntries(['renderBase','maskRebuild','getImageData','buildFlowField','stepParticles','drawUI'].map(k=>[k,PERF.counts[k]||0]));
  const hidden=()=>{const visible=[base,flow,ui].some(c=>getComputedStyle(c).visibility!=='hidden');staleOverlayVisibleFrames+=Number(visible);check(!visible,'이동 첫 프레임부터 모두 숨김');};
  const pointer=(type)=>{const r=stage.getBoundingClientRect();$('providerMap').dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:991,pointerType:'mouse',clientX:r.left+cw*.8+(type==='pointerup'?15:0),clientY:r.top+ch*.8}));};
  const shift=(i)=>{const c=fakeWorld(...f.center),d=[[3,0],[-3,0],[0,3],[0,-3]][i%4];f.center=fakeCoord(c[0]+d[0]/f.scale(),c[1]-d[1]/f.scale());f.renderMarkers();};
  const inspect=()=>{
    permanentHidden+=Number(stage.classList.contains('provider-moving'));check(!p.failed&&p.active&&!p.fallbackCount,'정상 위성 provider 유지');
    check(!p.providerMoving&&!p.gesture&&!p.waitingIdle&&!p.commandPending&&!nativePointers.size,'종료 상태');
    const d=naksigwangMapDiagnostic.overlay();check(d.visible&&d.keysMatch,'실제 draw stamp = 현재 SDK');
    const m=providerProbeSample(PROVIDER_DEBUG,0);check(m.valid&&m.errorPx<=2,'DOM native와 실제 Canvas raster '+m.errorPx);maxMarker=Math.max(maxMarker,m.errorPx);errors.push(m.errorPx);
    check(arcs.length===2,'최종 UI 실제 A/B 원 그리기');
    for(let i=0;i<2;i++){const r=abMarkers[i].element.getBoundingClientRect(),o=ui.getBoundingClientRect();const e=Math.hypot(arcs[i][0]-(r.left+r.width/2-o.left),arcs[i][1]-(r.top+r.height/2-o.top));maxAB=Math.max(maxAB,e);check(e<=2,'A/B 실제 Canvas arc와 독립 DOM '+e);}
    check(JSON.stringify([S.A,S.B,S.pin])===ab,'원자료 좌표 보존');check(p.mode==='satellite','위성 기본 유지');total++;
  };
  const end=async(kind)=>{
    const at={pointerup:performance.now()};pointer('pointerup');
    if(!['no-idle','early-idle'].includes(kind)){at.idle=performance.now();f.viewportListener('idle');}
    if(kind!=='no-dragend'&&kind!=='late-dragend'){at.dragend=performance.now();f.viewportListener('dragend');}
    if(kind==='timeout'){cancelAnimationFrame(p.syncRAF);p.syncRAF=0;providerSettleTimeout();}
    await wait();const now=performance.now();for(const k in at){const ms=now-at[k];latencies[k].push(ms);if(ms>(latencyWorst[k]?.ms||0))latencyWorst[k]={ms,kind,phase:currentPhase,blockedReveals:p.blockedReveals||0};}
    if(kind==='late-dragend'){const b=PERF.counts.renderBase||0;f.viewportListener('dragend');await tick();await tick();check((PERF.counts.renderBase||0)===b,'늦은 dragend 중복 redraw 0');}
  };
  const move=async(kind,i)=>{
    const before=work();pointer('pointerdown');hidden();
    shift(i);hidden();
    if(kind==='early-idle'){f.viewportListener('idle');await tick();shift(i+1);hidden();}
    if(kind==='delayed-start'){for(let k=0;k<2+i%4;k++){await tick();hidden();}f.viewportListener('dragstart');}
    else if(!['no-dragstart','early-idle'].includes(kind))f.viewportListener('dragstart');
    await tick();hidden();const during=work();for(const k in before){movingHeavy+=during[k]-before[k];check(during[k]===before[k],'이동 중 heavy 금지 '+k);}
    await end(kind);inspect();const after=work();baseCounts.push(after.renderBase-before.renderBase);uiCounts.push(after.drawUI-before.drawUI);check(after.renderBase===before.renderBase+1&&after.drawUI===before.drawUI+1,'최종 base/UI 각각 정확히 1회 '+kind);
  };
  const phase=async(name,n,fn)=>{currentPhase=name;for(let i=0;i<(quick?Math.min(2,n):n);i++)await fn(i);counts[name]=quick?Math.min(2,n):n;console.log('pan progress '+name+' '+counts[name]);};
  try{
    await phase('pan',100,i=>move('delayed-start',i));
    await phase('noDragstart',50,i=>move('no-dragstart',i));
    await phase('noIdle',50,i=>move('no-idle',i));
    await phase('earlyIdle',50,i=>move('early-idle',i));
    await phase('lateDragend',50,i=>move('late-dragend',i));
    await phase('idleWithoutDragend',50,i=>move('no-dragend',i));
    await phase('timeout',10,i=>move('timeout',i));
    await phase('panPan',100,async i=>{
      await move('no-dragstart',i);pointer('pointerdown');shift(i+1);f.viewportListener('idle');f.viewportListener('dragend');await tick();hidden();await end('no-dragstart');inspect();
    });
    const zoom=async i=>{const before=work();stage.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:i%2?100:-100}));hidden();f.z+=i%2?-1:1;f.renderMarkers();f.viewportListener('zoomstart');await tick();hidden();const during=work();for(const k in before)check(before[k]===during[k],'wheel moving heavy '+k);f.viewportListener('zoomend');f.viewportListener('idle');await wait();inspect();};
    await phase('panZoom',50,async i=>{await move('no-dragstart',i);await zoom(i);});
    await phase('zoomPan',50,async i=>{await zoom(i);await move('no-dragstart',i);});
    await phase('panJang',50,async i=>{
      pointer('pointerdown');shift(i);pointer('pointerup');const promise=selectPoint(j,true);f.viewportListener('idle');f.viewportListener('dragend');const r=await promise;check(r.ok,'pan 다음 장봉항 명령');await wait();inspect();
    });
    await phase('jangPan',50,async i=>{const r=await selectPoint(j,true);check(r.ok,'장봉항 명령');await wait();const result=p.lastCommand;await move('no-dragstart',i);check(p.lastCommand===result,'완료된 명령 결과 유지');});
    const driftStart=errors.length;await phase('drift500',500,i=>move('no-dragstart',i));
    const drift=errors.slice(driftStart),half=Math.floor(drift.length/2),mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
    check(Math.abs(mean(drift.slice(half))-mean(drift.slice(0,half)))<=.5,'누적 오차 증가 없음');
    currentPhase='noZoom';await move('no-dragstart',0);await new Promise(r=>setTimeout(r,1000));inspect();
    // reveal 직전 SDK가 바뀌면 잘못된 stamp를 공개하지 않고 한 번 재생성한다.
    currentPhase='stampRace';const reveal=providerRevealOverlay;let changed=false;providerRevealOverlay=(...a)=>{if(!changed){changed=true;shift(1);}return reveal(...a);};
    try{await moveWithStampRace();}finally{providerRevealOverlay=reveal;}
    async function moveWithStampRace(){pointer('pointerdown');shift(0);await end('no-dragstart');inspect();check(p.blockedReveals>=1,'고의 stamp mismatch 차단');}
    // draw 뒤 stamp API의 일시 예외도 RAF를 끊지 않고 숨김→health 재검사→최종 draw로 회복한다.
    currentPhase='stampApiFailure';const stamp=providerDrawStamp;let stampCalls=0;
    providerDrawStamp=(...args)=>{if(++stampCalls===2){const bounds=f.getBounds;f.getBounds=function(){f.getBounds=bounds;throw Error('mock private SDK failure');};}return stamp(...args);};
    try{pointer('pointerdown');shift(2);await end('no-dragstart');inspect();check(stampCalls>=4&&!p.failed,'stamp API 예외 뒤 자동 복구');}finally{providerDrawStamp=stamp;}
    const repaired=await (async()=>{const sync=f.syncFromAppViewport;f.syncFromAppViewport=()=>{};try{return await fitGround(jang.lat,jang.lon,2500);}finally{f.syncFromAppViewport=sync;}})();
    check(repaired.ok&&repaired.usedRepair,'fit no-op 보정 보호');await wait();currentPhase='afterRepair';await move('no-dragstart',1);
    const maxLatency=Object.fromEntries(Object.entries(latencies).map(([k,v])=>[k,Math.max(...v)]));check(Object.values(maxLatency).every(v=>v<500),'mock 복구 500ms 상한 '+JSON.stringify(latencyWorst));
    const latencyP95=Object.fromEntries(Object.entries(latencies).map(([k,v])=>[k,[...v].sort((a,b)=>a-b)[Math.floor(v.length*.95)]]));check(Object.values(latencyP95).every(v=>v<300),'정상 복구 p95 300ms 상한');
    check(!staleOverlayVisibleFrames&&!permanentHidden&&!movingHeavy&&!movingDepthPrepare,'안전/성능 0');
    return {counts,total,staleOverlayVisibleFrames,permanentHidden,fallbacks:p.fallbackCount,maxMarkerErrorPx:maxMarker,maxABDrawErrorPx:maxAB,movingHeavy,movingDepthPrepare,basePerFinal:[Math.min(...baseCounts),Math.max(...baseCounts)],uiPerFinal:[Math.min(...uiCounts),Math.max(...uiCounts)],maxLatencyMs:maxLatency,latencyP95Ms:latencyP95,latencyWorst,drift:{count:drift.length,max:Math.max(...drift),firstHalfMean:mean(drift.slice(0,half)),secondHalfMean:mean(drift.slice(half))},blockedReveals:p.blockedReveals||0,repair:repaired.navigationStatus,noZoomAfterPan:true,diagnostic:naksigwangMapDiagnostic.overlay(),performance:naksigwangPerfDiagnostic()};
  }finally{auditing=false;cancelAnimationFrame(auditRAF);uctx.arc=arc;drawUI=draw;depthPrepareAreas=prepare;abMarkers.forEach(m=>m.marker.setMap(null));}
};
