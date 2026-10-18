// 15f_provider_health.js — 타일 오류와 SDK 실패 분리, 제한된 API 상태 확인·기존 인스턴스 복구
function providerHealthSnapshot(){
  const p=PROVIDER_MAP,a=p.adapter,el=$('providerMap'),css=getComputedStyle(el),rect=el.getBoundingClientRect();
  const h={mapObjectPresent:!!a?.map,mapProjectionHealthy:false,center:null,zoom:null,bounds:null,providerDOMVisible:css.display!=='none'&&css.visibility==='visible'&&Number(css.opacity)>0&&rect.width>0&&rect.height>0,sdkSurfaceCount:el.querySelectorAll('img,canvas').length};
  const pair=v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite);
  if(!h.mapObjectPresent)return h;
  try{
    const center=a.getCenter(),zoom=a.getZoom(),bounds=a.getBounds();
    h.center=pair(center)?[...center]:null;h.zoom=Number.isFinite(zoom)?zoom:null;h.bounds=Array.isArray(bounds)&&bounds.length===2&&bounds.every(pair)?bounds.map(v=>[...v]):null;
    if(!h.center||h.zoom===null||!h.bounds)return h;
    const projected=a.project(...h.center),renderCenter=a.unproject(cw/2,ch/2),ground=a.getGroundScale(),scale=a.getViewportScale();
    h.mapProjectionHealthy=pair(h.center)&&Math.abs(h.center[1])<=90&&Number.isFinite(h.zoom)&&Array.isArray(h.bounds)&&h.bounds.length===2&&h.bounds.every(pair)&&h.bounds[0][1]<=h.bounds[1][1]&&pair(projected)&&pair(renderCenter)&&Number.isFinite(ground)&&ground>0&&Number.isFinite(scale)&&scale>0;
  }catch(_){/* 예외 메시지·SDK 객체에는 URL이나 설정값이 있을 수 있어 저장하지 않는다. */}
  return h;
}
function providerRecordTileError(){
  const p=PROVIDER_MAP,time=performance.now();let zoom=null;try{const z=p.adapter?.getZoom();if(Number.isFinite(z))zoom=z;}catch(_){}
  p.tileErrorCount=(p.tileErrorCount||0)+1;p.lastTileErrorAt=time;
  const errors=p.tileErrors||=[];errors.push({time,zoom,mode:p.mode});if(errors.length>32)errors.shift();
  // 같은 밀리초는 합쳐 10초 창의 메모리 상한도 유지한다. 오류 수 자체로 실패 처리하지 않는다.
  const buckets=p.tileErrorBuckets||=[],stamp=Math.floor(time);while(buckets.length&&buckets[0].time<stamp-10000)buckets.shift();
  if(buckets.at(-1)?.time===stamp)buckets.at(-1).count++;else buckets.push({time:stamp,count:1});
}
function providerTileErrorsLast10s(){const now=performance.now();return (PROVIDER_MAP.tileErrorBuckets||[]).filter(b=>b.time>=now-10000).reduce((sum,b)=>sum+b.count,0);}
function providerCancelHealthCheck(reason){
  const p=PROVIDER_MAP;cancelAnimationFrame(p.healthRAF);p.healthRAF=0;
  const resolve=p.resolveHealth;p.healthPromise=null;p.resolveHealth=null;resolve?.({ok:false,reason});
}
function providerHandleProjectionFailure(){
  const p=PROVIDER_MAP;if(p.failed)return;
  p.projectionErrorCount=(p.projectionErrorCount||0)+1;p.healthState='degraded';providerBeginMove();providerScheduleHealthCheck();
}
function providerScheduleHealthCheck(){
  const p=PROVIDER_MAP;if(p.healthPromise)return p.healthPromise;
  if(p.offline||p.failed&&!p.recoverable)return Promise.resolve({ok:false,reason:p.lastFallbackReason||'map-unavailable'});
  if(!p.adapter?.map){providerFallback('map-init-failed');return Promise.resolve({ok:false,reason:'map-init-failed'});}
  let attempts=0,resolve;const promise=new Promise(r=>{resolve=r;});p.healthPromise=promise;p.resolveHealth=resolve;
  const finish=result=>{if(p.healthPromise===promise){p.healthPromise=null;p.resolveHealth=null;}resolve(result);};
  const probe=()=>{
    p.healthRAF=0;if(p.offline||p.failed&&!p.recoverable){finish({ok:false,reason:p.lastFallbackReason});return;}
    const h=providerHealthSnapshot();p.lastHealth=h;
    if(h.mapProjectionHealthy&&p.interactionFailures){
      try{p.adapter.setInteraction?.(providerUseNativePan());p.interactionFailures=0;}catch(_){
        if(++p.interactionFailures>=3){providerFallback('map-api-failure');finish({ok:false,reason:'map-api-failure'});return;}
        p.healthRAF=requestAnimationFrame(probe);return;
      }
    }
    if(h.mapProjectionHealthy){
      const recovering=p.failed;p.failed=false;p.recoverable=false;p.loaded=true;p.projectionFailures=0;p.healthState=h.sdkSurfaceCount?'healthy':'waiting-for-tiles';
      // 진행 중 gesture는 SDK 종료/포인터 해제까지 유지한다. 상태 확인만으로 Canvas를 먼저 공개하지 않는다.
      p.viewportDirty=true;
      if(recovering){p.recoveryCount=(p.recoveryCount||0)+1;p.recoveredAt=performance.now();}
      finish({ok:true,recoveryStarted:recovering});
      providerBeginMove();if(recovering){stage.classList.add('provider-moving');providerSetMode(p.mode);providerSync();}providerQueueSettle();return;
    }
    p.projectionFailures=(p.projectionFailures||0)+1;
    if(++attempts<3){p.healthRAF=requestAnimationFrame(probe);return;}
    if(!p.failed)providerFallback(h.mapObjectPresent?'projection-failure':'map-init-failed');
    finish({ok:false,reason:p.lastFallbackReason});
  };
  p.healthRAF=requestAnimationFrame(probe);return promise;
}
function providerTryRecover(trigger='manual'){
  const p=PROVIDER_MAP;p.lastRecoveryTrigger=trigger;
  if(!p.failed||!p.recoverable||p.offline)return Promise.resolve({ok:false,reason:p.offline?'browser-offline':p.lastFallbackReason||'not-failed'});
  return providerScheduleHealthCheck();
}
function providerSettleTimeout(){
  const p=PROVIDER_MAP,h=providerHealthSnapshot();p.lastHealth=h;
  p.settleTimeoutCount=(p.settleTimeoutCount||0)+1;p.settleTimedOut=true;
  p.settleFailure={reason:'settle-timeout',time:performance.now(),observation:{...p.lastSettleObservation},health:h};
  if(!h.mapObjectPresent){providerFallback('map-init-failed');return;}
  if(!h.mapProjectionHealthy){providerHandleProjectionFailure();return;}
  // 포인터/명령이 끝난 정상 SDK의 표시 좌표를 최종 기준으로 읽고 한 번 DRAW→REVEAL한다.
  p.healthState='settle-timeout';providerFinalizeViewport('timeout');
}
function providerModeTimeout(){
  const p=PROVIDER_MAP;if(p.failed)return;
  p.modeHealthChecks=(p.modeHealthChecks||0)+1;p.lastModeHealthAt=performance.now();
  const h=providerHealthSnapshot();p.lastHealth=h;
  if(h.mapProjectionHealthy){
    p.loaded=true;p.healthState=h.providerDOMVisible&&h.sdkSurfaceCount?'healthy':'waiting-for-tiles';
    if(!p.active&&!p.providerMoving&&!p.commandPending)providerCheck();
  }else if(!h.mapObjectPresent)providerFallback('map-init-failed');
  else providerHandleProjectionFailure();
}
addEventListener('offline',()=>{const p=PROVIDER_MAP;p.offline=true;if(p.adapter&&!p.failed)providerFallback('browser-offline');});
addEventListener('online',()=>{PROVIDER_MAP.offline=false;providerTryRecover('online');});
