// p3_stress_checks.js — 유한 이벤트 폭주·누락·원거리 명령을 실제 RAF로 반복 검사
window.p3StressTest=async()=>{
  const {f,check,settle}=p3HealthFixture,p=PROVIDER_MAP,tick=()=>new Promise(requestAnimationFrame),map=f.map;
  setMode('pan');S.playing=false;S.layers.flow=false;await p3WaitDepthQuiet();naksigwangPerfDiagnostic.reset();
  const counts={},recovery=[],fits=[],prepare=depthPrepareAreas;let movingHeavy=0,maxMarker=0,duplicates=0,movingDepthPrepare=0;
  depthPrepareAreas=(...args)=>{if(p.providerMoving)movingDepthPrepare++;return prepare(...args);};
  const visible=()=>{check(p.active&&!p.failed&&!p.fallbackCount,'정상 provider 유지');check(!p.providerMoving&&!p.gesture&&!p.waitingIdle&&!p.commandPending&&!p.revealAfterBase,'종료 상태 해제');check(!stage.classList.contains('provider-moving')&&[base,flow,ui].every(c=>getComputedStyle(c).visibility==='visible'),'영구 숨김 없음');check(f.map===map&&f.instances===1,'같은 SDK 인스턴스');};
  const work=()=>Object.fromEntries(['renderBase','maskRebuild','getImageData','buildFlowField','stepParticles','drawSection'].map(k=>[k,PERF.counts[k]||0]));
  const phase=async(name,n,action)=>{for(let i=0;i<n;i++)try{await action(i);visible();}catch(error){throw Error(name+' '+i+': '+error.message);}counts[name]=n;};
  const move=async(kind,i,timeout=false)=>{
    const before=work();nativePointers.add(-51);f.viewportListener(kind==='drag'?'dragstart':'zoomstart');
    if(kind==='drag')f.map.panBy({x:i%2?5:-5,y:i%2?3:-3});
    else {setMode('line');const r=stage.getBoundingClientRect();stage.dispatchEvent(new WheelEvent('wheel',{clientX:r.left+cw/2,clientY:r.top+ch/2,deltaY:i%2?100:-100,bubbles:true,cancelable:true}));setMode('pan');}
    await tick();const during=work();for(const k in before){movingHeavy+=during[k]-before[k];check(during[k]===before[k],'이동 중 heavy '+k);}
    nativePointers.delete(-51);f.viewportListener(kind==='drag'?'dragend':'zoomend');
    const start=performance.now();if(timeout){cancelAnimationFrame(p.syncRAF);p.syncRAF=0;providerSettleTimeout();}else f.viewportListener('idle');
    await settle();recovery.push(performance.now()-start);
    check((PERF.counts.renderBase||0)===before.renderBase+1,'최종 base 1회');
    const drawn=PERF.counts.renderBase||0;
    for(const event of ['idle','center_changed','dragend','idle'])f.viewportListener(event);f.loaded();await settle();
    check((PERF.counts.renderBase||0)===drawn,'늦은 이벤트 중복 base 0');duplicates+=4;
  };
  await phase('drag',100,i=>move('drag',i));
  await phase('wheel',100,i=>move('wheel',i));
  await phase('mixed',100,i=>move(i%2?'drag':'wheel',i));
  const selected=JSON.stringify([S.pin,S.A,S.B]),originalFetch=fetch;let modeDepthFetches=0;
  window.fetch=(url,...a)=>{if(String(url).includes('static/depth/'))modeDepthFetches++;return originalFetch(url,...a);};
  await phase('mode',30,async i=>{providerSetMode(['satellite','hybrid','normal'][i%3]);await tick();});window.fetch=originalFetch;
  check(modeDepthFetches===0&&selected===JSON.stringify([S.pin,S.A,S.B]),'모드 수심 요청 0·선택 유지');
  await phase('tabs',30,async()=>{showTab('today');await tick();showTab('map');await settle();});
  const width=stage.style.width;
  await phase('resize',30,async i=>{stage.style.width=i%2?width:(Math.max(300,cw-9)+'px');resize();f.viewportListener('idle');await settle();});stage.style.width=width;resize();await settle();await p3WaitDepthQuiet();
  const destinations=[['홍원',36.15983,126.50376],['속초',38.20854,128.5947],['포항',36.05,129.38],['주문진',37.89192,128.8312883028771],['묵호',37.55,129.12],['홍원',36.15983,126.50376],['포항',36.05,129.38],['속초',38.20854,128.5947]];
  await phase('fit',30,async i=>{const [name,lat,lon]=destinations[i%8],before=providerViewportKey(),bounds=JSON.stringify(f.getBounds()),center=JSON.stringify(f.getCenter());
    const r=await naksigwangMapDiagnostic.fit(10000,lat,lon);await settle();
    check(r.command.status==='settled'&&r.passes&&r.errorPx<=2,'연속 원거리 '+name);check(before!==providerViewportKey()&&bounds!==JSON.stringify(f.getBounds())&&center!==JSON.stringify(f.getCenter()),'실제 center/key/bounds 변경');
    const last=r.command.trace.at(-1);check(last.inside&&last.reached,'목적지 도착');maxMarker=Math.max(maxMarker,r.errorPx);fits.push({name,status:r.command.status,errorPx:r.errorPx,centerErrorPx:last.centerErrorPx});});
  await p3WaitDepthQuiet();
  await phase('providerOnly',30,async()=>{naksigwangPerfDiagnostic.providerOnly(true);check(getComputedStyle(base).visibility==='hidden'&&getComputedStyle(p3HealthFixture.surface).visibility==='visible','SDK surface는 숨기지 않음');naksigwangPerfDiagnostic.providerOnly(false);await tick();});
  await phase('forcedTimeout',100,i=>move('drag',i,true));
  const errors=p.tileErrorCount;
  await phase('imgError',100,async()=>{const img=document.createElement('img');$('providerMap').append(img);img.dispatchEvent(new Event('error'));img.remove();await tick();});check(p.tileErrorCount===errors+100,'실제 IMG 캡처 100');
  const mode=f.setMode;f.setMode=m=>f.modes.push(m);
  await phase('missingTilesloaded',100,async i=>{providerSetMode(i%2?'satellite':'hybrid');clearTimeout(p.timer);providerModeTimeout();await tick();});f.setMode=mode;providerSetMode('satellite');
  // 포인터 없는 zoom 종료/idle 모두 누락: 실제 시계로 다음 이벤트 없이 복원한다.
  const start=performance.now();f.viewportListener('zoomstart');await settle();const missingEndRecoveryMs=performance.now()-start,missingEndRecordedMs=PERF.idleRecoveryMs.at(-1);visible();check(missingEndRecoveryMs<750,'종료 누락 유한 복원');check(Math.abs(missingEndRecordedMs-missingEndRecoveryMs)<75,'이전 idle 시각으로 복원 시간을 과장하지 않음');
  // 누른 포인터는 deadline으로 종료하지 않는다.
  nativePointers.add(-51);f.viewportListener('dragstart');await new Promise(r=>setTimeout(r,280));check(p.gesture&&p.providerMoving,'포인터 유지 중 숨김 유지');nativePointers.delete(-51);f.viewportListener('idle');await settle();
  await p3WaitDepthQuiet();const activity=naksigwangPerfDiagnostic();naksigwangPerfDiagnostic.reset();for(let i=0;i<60;i++)await tick();const stationary=naksigwangPerfDiagnostic();
  for(const k of ['renderBase','maskRebuild','getImageData','drawSection','providerSync','providerViewportKey','providerAlignment'])check(!stationary.counts[k],'정지 중 '+k+' 0');
  visible();check(movingDepthPrepare===0,'이동 중 depth prepare 0');depthPrepareAreas=prepare;return {scope:'실 RAF·headless SDK mock; 실 NAVER와 사용자 PC 성능은 미검증',counts,lateEvents:duplicates,movingHeavy,movingDepthPrepare,permanentHidden:0,fallbacks:p.fallbackCount,instances:f.instances,modeDepthFetches,missingEndRecoveryMs,missingEndRecordedMs,maxRecoveryMs:Math.max(...recovery),maxMarkerErrorPx:maxMarker,fits,activity,stationary};
};
