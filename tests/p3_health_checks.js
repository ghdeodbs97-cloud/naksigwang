// p3_health_checks.js — 실제 IMG 캡처 리스너, 누락 타일 이벤트, SDK 실패·기존 지도 복구 검사
let p3HealthFixture=null;
window.p3HealthSetup=async()=>{
  const tick=()=>new Promise(requestAnimationFrame),check=(ok,msg)=>{if(!ok)throw Error(msg);};
  const settle=async()=>{for(let i=0;i<50;i++){await tick();if(!PROVIDER_MAP.providerMoving&&!PROVIDER_MAP.commandPending&&!PROVIDER_MAP.revealAfterBase&&!dirty)return;}throw Error('health 종료 Canvas 복구 누락');};
  showTab('map');await new Promise(r=>setTimeout(r,350));S.playing=false;S.layers.flow=false;
  providerCancelHealthCheck('fixture');clearTimeout(PROVIDER_MAP.timer);
  const f=new FakeMapAdapter();f.init($('providerMap'));f.map.destroy=()=>{};
  Object.assign(PROVIDER_MAP,{adapter:f,failed:false,offline:false,recoverable:false,active:false,loaded:true,signature:'',sizeKey:'',stableZoom:null,lastFallbackReason:null,fallbackCount:0,tileErrorCount:0,tileErrors:[],tileErrorBuckets:[],tilesLoadedCount:0,healthState:'unknown'});
  f.onViewportReady(providerViewportChanged);f.onTilesLoaded(providerTilesLoaded);
  const surface=document.createElement('canvas');surface.width=surface.height=8;$('providerMap').append(surface);
  // 실제 NaverMapAdapter.init의 캡처 리스너를 사용한다. fake Map 생성자는 같은 지도 객체를 반환한다.
  const probe=new NaverMapAdapter({...f.sdk,Map:class{constructor(){return f.map;}},MapTypeId:{SATELLITE:'SATELLITE',HYBRID:'HYBRID',NORMAL:'NORMAL'}});
  let legacyFailures=0;probe.onFailure=()=>{legacyFailures++;providerFallback('map-init-failed');};probe.init($('providerMap'));
  await fitGround(38.20854,128.5947,10000);await settle();
  const emitError=()=>{const img=document.createElement('img');img.style.cssText='position:absolute;left:0;top:0;width:1px;height:1px';$('providerMap').append(img);img.dispatchEvent(new Event('error'));return img;};
  const before=PROVIDER_MAP.fallbackCount;emitError();let d=naksigwangTileDiagnostic();
  check(d.active&&!d.failed&&d.tileErrorCount===1&&d.fallbackCount===before,'단일 IMG 오류는 전체 fallback 아님');
  for(let i=0;i<10;i++)emitError();
  const normal=document.createElement('img');Object.defineProperties(normal,{naturalWidth:{value:256},naturalHeight:{value:256},complete:{value:true}});$('providerMap').append(normal);normal.dispatchEvent(new Event('load'));f.loaded();await settle();d=naksigwangTileDiagnostic();
  check(legacyFailures===0&&d.active&&!d.failed&&d.tileErrorCount===11&&d.tileErrorsLast10s===11,'10개 transient 타일 오류 허용');
  check(d.tilesLoadedCount>=1&&d.decodedTileCount>=1&&d.canvases.every(c=>c.visibility==='visible'),'타일 복구 후 overlay 유지');
  check(d.tiles.every(t=>!('currentSrc' in t)&&!('src' in t)),'URL 정보 반환 금지');
  const ab=JSON.stringify([S.A,S.B]);p3HealthFixture={f,probe,surface,check,settle,ab,before,legacyFailures,tiles:d,modeChecks:PROVIDER_MAP.modeHealthChecks||0};
  return {singleErrorRetained:true,transientErrors:11,fallbackCount:d.fallbackCount,tileErrorsLast10s:d.tileErrorsLast10s};
};
window.p3HealthModeStart=()=>{const t=p3HealthFixture;t.originalMode=t.f.setMode;t.f.setMode=mode=>t.f.modes.push(mode);providerSetMode('hybrid');return {timerArmed:!!PROVIDER_MAP.timer,loaded:PROVIDER_MAP.loaded};};
window.p3HealthModeFinish=async()=>{
  const t=p3HealthFixture,d=naksigwangTileDiagnostic();t.check(d.active&&!d.failed&&d.mapProjectionHealthy,'12초 tilesloaded 누락은 fallback 아님');
  t.check(d.modeHealthChecks>t.modeChecks,'실제 12초 health timeout 실행');t.check(d.tileErrorsLast10s===0&&d.tileErrorCount===11,'10초 오류 창 만료와 전체 수 분리');
  t.f.setMode=t.originalMode;return {retained:true,modeHealthChecks:d.modeHealthChecks,tileErrorsLast10s:d.tileErrorsLast10s};
};
window.p3HealthFatal=async()=>{
  const t=p3HealthFixture,{f,check,settle}=t,sameMap=f.map,recoveries=[];
  const oldWidth=stage.style.width,layoutProject=f.project,layoutUnproject=f.unproject,layoutReference=f.referenceProject;
  const delta=()=>[(f.size[0]-cw)/2,(f.size[1]-ch)/2];f.project=function(...a){const p=layoutProject.apply(f,a),d=delta();return [p[0]+d[0],p[1]+d[1]];};f.referenceProject=function(...a){const p=layoutReference.apply(f,a),d=delta();return [p[0]+d[0],p[1]+d[1]];};f.unproject=function(x,y){const d=delta();return layoutUnproject.call(f,x-d[0],y-d[1]);};
  for(let i=0;i<2;i++){
    dispatchEvent(new Event('offline'));await settle();let d=naksigwangTileDiagnostic();check(d.failed&&!d.active&&d.lastFallbackReason==='browser-offline'&&d.recoverable,'offline 사유와 fallback');
    if(i===0){stage.style.width=(cw-23)+'px';resize();check(f.size[0]!==cw,'offline 중 SDK size 갱신 보류');providerSetMode('normal');}
    check(!(await naksigwangTileDiagnostic.retry()).ok,'offline 중 복구 차단');dispatchEvent(new Event('online'));await PROVIDER_MAP.healthPromise;await settle();d=naksigwangTileDiagnostic();
    check(!d.failed&&d.active&&f.map===sameMap&&f.instances===1,'online은 기존 SDK 지도 재사용');recoveries.push({reason:d.lastFallbackReason,count:d.recoveryCount});check(f.size[0]===cw&&f.size[1]===ch,'복구의 최종 settle 전에 SDK size 갱신');check(f.modes.at(-1)===PROVIDER_MAP.mode,'offline 중 선택한 지도 모드 복구');if(i===0){stage.style.width=oldWidth;resize();await settle();}
  }
  f.project=layoutProject;f.unproject=layoutUnproject;f.referenceProject=layoutReference;
  const project=f.project,falls=PROVIDER_MAP.fallbackCount;
  f.project=function(...a){f.project=project;throw Error('fixture-private-url');};PROVIDER_MAP.viewportDirty=true;providerSync();check(!PROVIDER_MAP.failed,'첫 API 예외로 즉시 fallback 금지');await PROVIDER_MAP.healthPromise;await settle();
  check(PROVIDER_MAP.fallbackCount===falls&&PROVIDER_MAP.active,'일시 API 예외 복구');
  nativePointers.add(-3);f.viewportListener('dragstart');const bases=PERF.counts.renderBase||0;f.project=function(...a){f.project=project;throw Error('fixture-private-url');};PROVIDER_MAP.viewportDirty=true;providerSync();await PROVIDER_MAP.healthPromise;
  for(let i=0;i<4;i++)await new Promise(requestAnimationFrame);check(PROVIDER_MAP.providerMoving&&getComputedStyle(base).visibility==='hidden'&&(PERF.counts.renderBase||0)===bases,'gesture 중 health 회복만으로 heavy Canvas 공개 금지');nativePointers.delete(-3);f.viewportListener('dragend');f.viewportListener('idle');await settle();
  const interaction=f.setInteraction;f.setInteraction=()=>{throw Error('fixture-private-url');};providerUpdateInput();
  for(let i=0;i<30&&!PROVIDER_MAP.failed;i++)await new Promise(requestAnimationFrame);await settle();check(PROVIDER_MAP.lastFallbackReason==='map-api-failure'&&PROVIDER_MAP.failed,'지속 입력 API 예외도 제한 횟수 뒤 종료');f.setInteraction=interaction;check((await naksigwangTileDiagnostic.retry()).ok,'입력 API 복구');await settle();
  f.project=()=>{throw Error('fixture-private-url');};PROVIDER_MAP.viewportDirty=true;providerSync();await PROVIDER_MAP.healthPromise;await settle();let d=naksigwangTileDiagnostic();
  check(d.failed&&!d.mapProjectionHealthy&&d.lastFallbackReason==='projection-failure'&&d.projectionFailures===3,'지속 projection 예외 사유');check(!JSON.stringify(d).includes('fixture-private-url'),'SDK 예외 메시지 저장·반환 금지');
  f.project=project;check((await naksigwangTileDiagnostic.retry()).ok,'projection 복구 제한 재확인');await settle();d=naksigwangTileDiagnostic();
  check(d.active&&!d.failed&&f.map===sameMap&&f.instances===1,'projection 복구도 같은 SDK');check(JSON.stringify([S.A,S.B])===t.ab,'health fallback/recovery A/B 보존');
  const marker=await naksigwangMapDiagnostic(38.20854,128.5947);check(marker.passes&&marker.errorPx<=2,'복구 후 native Marker/Canvas');
  probeCleanup();return {recoveries,transientProjectionRetained:true,persistentReason:'projection-failure',recovered:true,instances:f.instances,errorPx:marker.errorPx,permanentHidden:0};
  function probeCleanup(){t.probe.destroy();clearTimeout(PROVIDER_MAP.timer);}
};
