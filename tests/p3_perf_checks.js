// p3_perf_checks.js — 연속 입력 중 무거운 렌더 금지와 idle 실제 픽셀 회귀
window.p3PerfTest=async()=>{
  const check=(ok,msg)=>{if(!ok)throw Error(msg);},tick=()=>new Promise(requestAnimationFrame);
  const settle=async()=>{for(let i=0;i<40;i++){await tick();if(!PROVIDER_MAP.providerMoving&&!PROVIDER_MAP.commandPending&&!dirty)return;}throw Error('idle 복구 40프레임 초과 '+JSON.stringify({moving:PROVIDER_MAP.providerMoving,command:PROVIDER_MAP.commandPending,gesture:PROVIDER_MAP.gesture,waiting:PROVIDER_MAP.waitingIdle,pointers:nativePointers.size,failed:PROVIDER_MAP.failed,dirty,TAB,raf:PROVIDER_MAP.syncRAF,health:!!PROVIDER_MAP.healthPromise,beforeZoom:PROVIDER_MAP.pendingCommand?.beforeZoom,beforeScale:PROVIDER_MAP.pendingCommand?.beforeScale,trace:PROVIDER_MAP.pendingCommand?.trace.at(-1)}));};
  showTab('map');await new Promise(r=>setTimeout(r,350));
  const f=new DelayedMapAdapter();f.init($('providerMap'));const sdkSurface=document.createElement('canvas');sdkSurface.width=sdkSurface.height=1;f.container.append(sdkSurface);
  Object.assign(PROVIDER_MAP,{adapter:f,failed:false,loaded:true,active:false,signature:'',sizeKey:'',stableZoom:null});
  f.onViewportReady(providerViewportChanged);f.onTilesLoaded(providerTilesLoaded);
  await fitGround(38.20854,128.5947,10000);await settle();S.playing=false;S.layers.flow=true;
  S.pin=[mxOf(128.5947),myOf(38.20854)];S.A=[mxOf(128.5937),myOf(38.20954)];S.B=[mxOf(128.5957),myOf(38.20754)];analyzeSection();
  const original=JSON.stringify([S.pin,S.A,S.B]),abMarkers=[S.A,S.B].map(p=>f.createDebugMarker(latOf(p[1]),lonOf(p[0])));
  const abError=()=>Math.max(...abMarkers.map((m,i)=>{const rect=m.element.getBoundingClientRect(),origin=ui.getBoundingClientRect(),x=rect.left+rect.width/2-origin.left,y=rect.top+rect.height/2-origin.top,r=DPR(),rx=Math.round(x*r),ry=Math.round(y*r),radius=Math.ceil(10*r);
    if(rx-radius<0||ry-radius<0||rx+radius>=ui.width||ry+radius>=ui.height)return Infinity;
    const size=2*radius+1,data=uctx.getImageData(rx-radius,ry-radius,size,size).data;
    const orange=(x,y)=>{const o=(y*size+x)*4;return data[o]>245&&data[o+1]>175&&data[o+1]<195&&data[o+2]>65&&data[o+2]<90&&data[o+3]>240;};
    // 글자 안쪽을 제외하고 주황색 원 둘레를 실제 raster에서 찾는다. 연결선은 소수 각도에만 영향을 준다.
    let best=-Infinity,painted=null;
    for(let dy=-4;dy<=4;dy+=.25)for(let dx=-4;dx<=4;dx+=.25){let score=0;
      for(let i=0;i<64;i++){const a=i*Math.PI/32;for(const [rr,weight] of [[8.2,2],[9.8,-1]]){const px=Math.floor((x+dx+Math.cos(a)*rr)*r)-(rx-radius),py=Math.floor((y+dy+Math.sin(a)*rr)*r)-(ry-radius);const hit=px>=0&&py>=0&&px<size&&py<size&&orange(px,py);score+=weight>0?(hit?weight:0):(hit?weight:0);}}
      if(score>best){best=score;painted=[x+dx,y+dy];}
    }
    return Math.hypot(painted[0]-x,painted[1]-y);
  }));
  // 수심 로딩 완료 뒤 analyzeSection의 기존 예약도 SDK 네 면 범위로 다시 통일해야 한다.
  const prepare=depthPrepareAreas,captured=[];
  try{
    depthPrepareAreas=async areas=>{captured.push(JSON.stringify(areas));return captured.length===1;};
    scheduleDisplayDepthArea();for(let i=0;i<80&&captured.length<2;i++)await tick();
    check(captured.length>=2&&captured[0]===captured[1],'수심 갱신 후에도 SDK 전체 viewport 범위 유지');
  }finally{depthPrepareAreas=prepare;clearTimeout(OFFICIAL_DEPTH.timer);RENDER.depthQueued=false;RENDER.depthKey='';dirty=true;}
  await OFFICIAL_DEPTH.init;
  // 고정 sleep 대신 자료 로딩·예약·단면/base 변경이 실제로 멈춘 구간을 기다린다.
  let quiet=0,previous='',previousSection=null;
  for(let i=0;i<300&&quiet<24;i++){await tick();const key=JSON.stringify([OFFICIAL_DEPTH.generation,PERF.counts.renderBase||0]);const ready=!OFFICIAL_DEPTH.pending.size&&!RENDER.depthQueued&&!dirty&&!PROVIDER_MAP.providerMoving&&!PROVIDER_MAP.commandPending&&(CR.ready||CR.err);quiet=ready&&key===previous&&SEC===previousSection?quiet+1:0;previous=key;previousSection=SEC;}
  check(quiet>=24,'정지 계측 전 비동기 자료 로딩 완료');
  window.naksigwangPerfDiagnostic.reset();for(let i=0;i<60;i++)await tick();
  const stationary=window.naksigwangPerfDiagnostic();
  for(const name of ['providerSync','providerViewportKey','providerCheck','providerAlignment','renderBase','maskRebuild','stationRedraw','drawSection','updateHover'])check(!stationary.counts[name],'정지 중 불필요한 '+name);
  const phases=[];let maxAB=0,maxMarker=0,movingHeavy=0;
  for(const [kind,count] of [['horizontal',20],['vertical',20],['zoom',20],['mixed',30]]){
    window.naksigwangPerfDiagnostic.reset();
    for(let i=0;i<count;i++){
      const before=window.naksigwangPerfDiagnostic().counts;
      nativePointers.add(-1);f.viewportListener('dragstart');
      if(kind==='zoom'||kind==='mixed'&&i%3===0)f.map.zoomBy(i%2?-1:1,new P3ProbeLL(38.20854,128.5947));
      else f.map.panBy(new P3ProbeXY(kind==='vertical'?0:(i%2?7:-7),kind==='horizontal'?0:(i%2?5:-5)));
      for(let j=0;j<4;j++){await tick();check(getComputedStyle(base).visibility==='hidden'&&getComputedStyle(flow).visibility==='hidden'&&getComputedStyle(ui).visibility==='hidden','이동 중 Canvas 잔상 숨김');check(getComputedStyle(sdkSurface).visibility!=='hidden'&&getComputedStyle(sdkSurface).position==='static'&&getComputedStyle(sdkSurface).clipPath==='none','SDK 자체 Canvas의 가시성·배치·clip은 유지');}
      const during=window.naksigwangPerfDiagnostic().counts;
      for(const name of ['renderBase','maskRebuild','buildFlowField','providerCheck','providerAlignment','stepParticles','drawSection']){const delta=(during[name]||0)-(before[name]||0);movingHeavy+=delta;check(delta===0,'이동 중 금지된 '+name);}
      nativePointers.delete(-1);f.viewportListener('dragend');f.viewportListener('idle');await settle();
      for(const canvas of [base,flow,ui]){const css=getComputedStyle(canvas);check(css.visibility==='visible'&&css.display!=='none'&&Number(css.opacity)>0,kind+' idle Canvas 실제 공개');}check(!PROVIDER_MAP.revealAfterBase&&!stage.classList.contains('provider-moving'),'공개 완료 상태');
      const result=await providerMarkerDiagnostic(38.20854,128.5947);check(result.passes&&result.domMismatchPx===0,kind+' native/Canvas 정합');
      maxMarker=Math.max(maxMarker,result.errorPx);
      check(JSON.stringify([S.pin,S.A,S.B])===original,'반복 후 원좌표 drift');
    }
    const metrics=window.naksigwangPerfDiagnostic(),ab=abError();maxAB=Math.max(maxAB,ab);check(ab<=2,kind+' A/B 실제 Canvas 정합 '+ab);
    phases.push({kind,count,abErrorPx:ab,...metrics});
  }
  const pathValidation=await p3PathTest(f);
  const remote=[];
  for(const [name,lat,lon] of [['속초',38.20854,128.5947],['포항',36.05,129.38],['주문진',37.89192,128.8312883028771],['홍원',36.15983,126.50376]]){
    const result=await window.naksigwangMapDiagnostic.fit(10000,lat,lon);check(result.passes&&result.command.status==='settled',name+' 연속 이동');remote.push({name,errorPx:result.errorPx,status:result.command.status});
  }
  for(let i=0;i<3;i++)for(const mode of ['satellite','hybrid','normal']){providerSetMode(mode);await tick();}
  check(JSON.stringify([S.pin,S.A,S.B])===original,'모드 후 원좌표 drift');
  setMode('line');const writes=PROVIDER_MAP.commands,r=ui.getBoundingClientRect();for(let i=0;i<2;i++)stage.dispatchEvent(new WheelEvent('wheel',{clientX:r.left+cw/2,clientY:r.top+ch/2,deltaY:-500,bubbles:true,cancelable:true}));check(PROVIDER_MAP.commands===writes+2,'숨긴 Canvas 위 연속 wheel 입력');await settle();setMode('pan');
  for(let i=0;i<5;i++){showTab('today');await tick();showTab('map');await settle();check(sctx.getImageData(0,0,1,1).data[3]>0,'탭 복귀 뒤 단면 Canvas 복구');}
  check(!PROVIDER_MAP.commandPending&&!PROVIDER_MAP.providerMoving,'오늘/지도 복귀 후 안정화');
  const sync=f.syncFromAppViewport;f.syncFromAppViewport=()=>{};const cancelled=providerApplyView({...V});providerCancelViewCommand('interrupted');check((await cancelled).status==='cancelled','이동 없는 명령 취소');f.syncFromAppViewport=sync;await settle();check(!stage.classList.contains('provider-moving'),'명령 취소 후 Canvas 복구');
  const revealValidation=await p3RevealTest(f);
  showTab('tide');await tick();const frozenFlow=PERF.counts.stepParticles||0;for(let i=0;i<8;i++)await tick();check((PERF.counts.stepParticles||0)===frozenFlow,'비활성 탭 조류 정지');
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});dispatchEvent(new Event('visibilitychange'));const frozenFrames=PERF.counts.frame;await new Promise(r=>setTimeout(r,60));check(PERF.counts.frame===frozenFrames,'background RAF 정지');delete document.hidden;dispatchEvent(new Event('visibilitychange'));await tick();
  abMarkers.forEach(m=>m.marker.setMap(null));providerClearDiagnostic();
  return {scope:'headless mock; 실제 NAVER·사용자 장치 성능은 별도 확인',stationary,phases,pathValidation,revealValidation,remote,movingHeavy,maxABErrorPx:maxAB,maxMarkerErrorPx:maxMarker,coordinateDrift:false,particles:PARTICLE_BUDGET};
};
