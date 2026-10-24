// 15b_map_provider.js — 공식 온라인 지도 어댑터와 좌표 정합 확인, 실패 시 기본 지형 유지
// 수심 계산·자료 요청·단면 상태는 이 파일에서 변경하지 않는다.
function providerRequestedBounds(view) {
  const hx=cw/(2*view.s),hy=ch/(2*view.s);
  return {west:lonOf(view.cx-hx),south:latOf(view.cy-hy),east:lonOf(view.cx+hx),north:latOf(view.cy+hy)};
}
class NaverMapAdapter {
  constructor(maps) { this.sdk = maps; this.map = null; this.listeners = []; }
  init(container) {
    const n = this.sdk;
    this.container = container;
    this.imageError = e => this.handleImageError(e);
    container.addEventListener('error', this.imageError, true);
    this.map = new n.Map(container, { center: new n.LatLng(latOf(V.cy), lonOf(V.cx)), zoom: 10, minZoom:6, maxZoom:21,
      mapTypeId: n.MapTypeId[{satellite:'SATELLITE',hybrid:'HYBRID',normal:'NORMAL'}[PROVIDER_MAP.mode]],
      draggable: false, scrollWheel: false, pinchZoom: false, keyboardShortcuts: false,
      disableDoubleClickZoom: true, zoomControl: false, mapDataControl: true, logoControl: true });
  }
  handleImageError(e) { if(e.target?.tagName==='IMG')providerRecordTileError(); }
  setMode(mode) { this.map.setMapTypeId(this.sdk.MapTypeId[{satellite:'SATELLITE',hybrid:'HYBRID',normal:'NORMAL'}[mode] || 'SATELLITE']); }
  syncFromAppViewport(view = V) {
    // 이동 명령만 SDK에 보낸다. 미반영 projection으로 정수 zoom을 역산하지 않는다.
    const n=this.sdk,b=providerRequestedBounds(view);
    const bounds=new n.LatLngBounds(new n.LatLng(b.south,b.west),new n.LatLng(b.north,b.east));
    this.map.fitBounds(bounds,{top:0,right:0,bottom:0,left:0,maxZoom:21});
    this.zoomRemainder=0;
  }
  repairViewport(c) {
    // 현재 표시 projection에서 목표 위도의 지상 배율을 예측한다. 정수 zoom 오차는 검증에서 허용한다.
    const lat=this.unproject(cw/2,ch/2)[1],scale=this.getGroundScale()*kAt(c.target[1])/kAt(lat);
    const reportedZoom=this.getZoom(),unchangedScale=Math.abs(Math.log2(this.getViewportScale()/c.beforeScale))<.001;
    const displayedZoom=reportedZoom!==c.beforeZoom&&unchangedScale?c.beforeZoom:reportedZoom;
    const zoom=clamp(displayedZoom+Math.round(Math.log2(c.desiredGroundScale/scale)),6,21);
    this.map.stop?.();
    this.map.setCenter(new this.sdk.LatLng(c.target[1],c.target[0]));
    this.map.setZoom(zoom,false);this.zoomRemainder=0;
    return zoom;
  }
  getGroundScale() {
    const n=this.sdk, c=this.unproject(cw/2,ch/2), projection=this.map.getProjection();
    const end=projection.getDestinationCoord(new n.LatLng(c[1],c[0]),90,100), a=this.project(...c), b=this.project(end.lng(),end.lat());
    return Math.hypot(b[0]-a[0],b[1]-a[1])/100;
  }
  getViewportScale() {
    const n=this.sdk,p=this.map.getProjection(),c=this.map.getCenter(),w=p.fromCoordToPoint(c),a=p.fromPointToOffset(w),b=p.fromPointToOffset(new n.Point(w.x+1,w.y));
    return Math.hypot(b.x-a.x,b.y-a.y);
  }
  setInteraction(enabled) {
    if (this.interactive===enabled) return;
    this.map.setOptions({draggable:enabled,scrollWheel:enabled,pinchZoom:enabled,keyboardShortcuts:enabled});this.interactive=enabled;
  }
  getBounds() { const b = this.map.getBounds(), sw = b.getSW(), ne = b.getNE(); return [[sw.lng(), sw.lat()], [ne.lng(), ne.lat()]]; }
  getCenter() { const c = this.map.getCenter(); return [c.lng(), c.lat()]; }
  getZoom() { return this.map.getZoom(); }
  // 정합 기준은 별도 세계 좌표 경로. 앱 toS/toM이나 project를 호출하지 않는다.
  referenceProject(lon, lat) { const p = this.map.getProjection(), w = p.fromCoordToPoint(new this.sdk.LatLng(lat, lon)), o = p.fromPointToOffset(w); return [o.x, o.y]; }
  setCenter(lon, lat) { this.map.setCenter(new this.sdk.LatLng(lat, lon)); }
  moveAnchor(ll,x,y) { const p=this.project(...ll); this.map.panBy(new this.sdk.Point(p[0]-x,p[1]-y)); }
  panPixels(dx,dy) { this.map.panBy(new this.sdk.Point(-dx,-dy)); }
  zoomAt(x,y,factor) {
    const ll=this.unproject(x,y); this.zoomRemainder=(this.zoomRemainder||0)+Math.log2(factor);
    const delta=Math.round(this.zoomRemainder); this.zoomRemainder-=delta;
    if (delta) this.map.zoomBy(delta,new this.sdk.LatLng(ll[1],ll[0]),false);
  }
  project(lon, lat) { const p = this.map.getProjection().fromCoordToOffset(new this.sdk.LatLng(lat, lon)); return [p.x, p.y]; }
  unproject(x, y) { const p = this.map.getProjection().fromOffsetToCoord(new this.sdk.Point(x, y)); return [p.lng(), p.lat()]; }
  resize() { this.map.setSize(new this.sdk.Size(cw, ch)); }
  createDebugMarker(lat, lon) {
    const n = this.sdk, element = document.createElement('div');
    element.dataset.naksigwangNativeProbe = '';
    element.style.cssText = 'width:20px;height:20px;box-sizing:border-box;border:2px solid #00ffff;border-radius:50%;pointer-events:none';
    const marker = new n.Marker({position:new n.LatLng(lat,lon),map:this.map,clickable:false,zIndex:10000,
      icon:{content:element,size:new n.Size(20,20),anchor:new n.Point(10,10)}});
    return {marker,element};
  }
  onViewportReady(fn) { for (const name of ['bounds_changed','center_changed','zoom_changed','projection_changed','idle','dragstart','dragend','pinchstart','pinchend','zoomstart','zoomend']) this.listeners.push(this.sdk.Event.addListener(this.map,name,()=>fn(name))); }
  onTilesLoaded(fn) { this.listeners.push(this.sdk.Event.addListener(this.map, 'tilesloaded', fn)); }
  destroy() { for (const l of this.listeners) this.sdk.Event.removeListener(l); this.listeners = []; this.container?.removeEventListener('error', this.imageError, true); this.map?.destroy(); this.map = null; }
}

const PROVIDER_MAP = { adapter: null, offline:navigator.onLine===false, active: false, failed: false, started: false, mode: 'satellite',
  signature: '', loaded: false, timer: null, alignment: null, checking: false, syncing: false, diagnostic: null, viewportDirty:true, sizeKey:'', events:[], reads:0, commands:0, lastBaseFrame:null,
  commandPending:false,commandId:0,pendingCommand:null,requestedView:null,lastSettledView:null,lastCommand:null,commandTimeoutMs:8000,providerMoving:false,gesture:false,waitingIdle:false,syncRAF:0,revealAfterBase:false,idleAt:0,groundScale:0,stableZoom:null,stableScale:0 };
// P3 개발 중 저장된 normal/HYBRID 값은 새 위성 기본값으로 한 번 전환한다.
try { const saved = localStorage.getItem('naksigwang-map-mode-v2'); if (['satellite','hybrid','normal'].includes(saved)) PROVIDER_MAP.mode = saved; localStorage.removeItem('naksigwang-map-mode'); } catch (_) { /* 저장 제한 시 위성 기본값 */ }

function providerNotice(text) { $('providerNotice').textContent = text; }
function providerFallback(reason='manual-fallback') {
  const p=PROVIDER_MAP;const allowed=['sdk-script-load-failed','sdk-script-timeout','auth-failed','browser-offline','map-init-failed','map-api-failure','projection-failure','manual-fallback'];
  p.fallbackCount=(p.fallbackCount||0)+1;p.lastFallbackReason=allowed.includes(reason)?reason:'unknown-provider-failure';p.lastFallbackAt=performance.now();p.recoverable=['browser-offline','map-api-failure','projection-failure'].includes(p.lastFallbackReason);p.healthState='failed';providerCancelHealthCheck(p.lastFallbackReason);
  providerCancelViewCommand('provider unavailable');
  PROVIDER_MAP.failed = true; PROVIDER_MAP.active = false; PROVIDER_MAP.navigationFailed=false;clearTimeout(PROVIDER_MAP.timer);
  $('providerMap').style.visibility = 'hidden'; dirty = true;
  providerCancelGestureDeadline();nativePointers.clear();nativeTap=null;PROVIDER_MAP.pendingTap=null;
  cancelAnimationFrame(PROVIDER_MAP.syncRAF);PROVIDER_MAP.syncRAF=0;PROVIDER_MAP.providerMoving=false;PROVIDER_MAP.gesture=false;PROVIDER_MAP.waitingIdle=false;PROVIDER_MAP.revealAfterBase=true;
  stage.classList.remove('provider-active'); providerUpdateInput();
  providerNotice('온라인 지도를 불러오지 못해 기본 지형지도로 표시합니다.');
}
function providerTransform() { return !!PROVIDER_MAP.adapter && !PROVIDER_MAP.failed && (PROVIDER_MAP.active || PROVIDER_MAP.checking); }
function providerReadView() {
  if(PROVIDER_MAP.commandPending||PROVIDER_MAP.navigationFailed)return;
  const p=PROVIDER_MAP,a=p.adapter,c=a.unproject(cw/2,ch/2),scale=a.getGroundScale();
  if (!(scale>0) || !Number.isFinite(scale)) throw Error('지도 배율 변환 실패');
  const key=providerViewportKey(),zoom=a.getZoom(),viewportScale=a.getViewportScale();
  // SDK의 현재 표시 projection 중심·100m 축척을 호환 상태에 복사한다. SDK에 다시 보내지 않는다.
  V.cx=mxOf(c[0]); V.cy=myOf(c[1]); V.s=scale/kAt(c[1]); p.reads++;
  p.compatibility={...V};p.groundScale=scale;p.readViewportKey=key;p.readView={...V};
  // 이른 zoom 보고값과 이전 표시 scale을 확정된 한 쌍으로 저장하지 않는다.
  if(p.stableZoom===null||zoom===p.stableZoom||Math.abs(Math.log2(viewportScale/p.stableScale))>=.001){p.stableZoom=zoom;p.stableScale=viewportScale;}
  dirty=true;dirtyHover=true;VIEW_T=performance.now();
}
function providerViewportKey() {
  const a=PROVIDER_MAP.adapter;
  return JSON.stringify([a.getZoom(),a.getCenter(),a.getBounds(),a.unproject(0,0),a.unproject(cw/2,ch/2),a.unproject(cw,ch),cw,ch]);
}
// 이동 중에는 이전 Canvas를 숨기고 SDK의 마지막 표시 좌표가 안정된 뒤 한 번 갱신한다.
function providerBeginMove(){
  const p=PROVIDER_MAP;if(!p.providerMoving)p.moveGeneration=(p.moveGeneration||0)+1;p.providerMoving=true;p.revealAfterBase=true;
  if(p.active)stage.classList.add('provider-moving');
  if(RENDER.depthQueued){RENDER.depthQueued=false;RENDER.depthKey='';p.depthDeferred=true;}clearTimeout(OFFICIAL_DEPTH.timer);if(!flowHidden){fctx.setTransform(1,0,0,1,0,0);fctx.clearRect(0,0,flow.width,flow.height);flowHidden=true;}flowStale=true;
}
function providerTilesLoaded(){const p=PROVIDER_MAP;p.tilesLoadedCount=(p.tilesLoadedCount||0)+1;p.lastTilesLoadedAt=performance.now();providerRecordEvent('tilesloaded');if(p.failed){if(p.recoverable)providerTryRecover('tilesloaded');return;}p.loaded=true;clearTimeout(p.timer);if(!p.active&&!p.providerMoving&&!p.commandPending)providerCheck();}
function providerRecordEvent(name){const p=PROVIDER_MAP;p.events.push({name,time:performance.now(),providerMoving:p.providerMoving,revealAfterBase:p.revealAfterBase,commandPending:p.commandPending,heavyHidden:stage.classList.contains('provider-moving')});if(p.events.length>48)p.events.shift();}
function providerRevealOverlay(){
  const p=PROVIDER_MAP;if(p.providerMoving||p.commandPending||p.gesture||nativePointers.size)return;
  if(p.active&&!p.failed){
    let key;try{key=providerViewportKey();}catch(_){providerHandleProjectionFailure();return;}
    if(!providerRenderedViewportMatches(key)){
      p.blockedReveals=(p.blockedReveals||0)+1;stage.classList.add('provider-moving');
      // 같은 이동 세대에서 한 번만 새 읽기·그리기를 예약한다. 반복 불일치는 다음 SDK 이벤트로 넘긴다.
      p.revealAfterBase=false;
      if(p.redrawGeneration!==p.moveGeneration){p.redrawGeneration=p.moveGeneration;providerQueueFinalViewport();}
      return;
    }
  }
  if(p.revealAfterBase){p.revealAfterBase=false;if(p.idleAt&&PERF.enabled){PERF.idleRecoveryMs.push(performance.now()-p.idleAt);if(PERF.idleRecoveryMs.length>100)PERF.idleRecoveryMs.shift();}}
  stage.classList.remove('provider-moving');
  p.overlayStamp=RENDER.renderedProviderViewportKey;
  const tap=p.pendingTap;p.pendingTap=null;if(tap){const i=stationAt(...tap);if(i!=null)selectPoint(i,cw/pxPerGround()>60000);}
}
function providerRenderedViewportMatches(key){
  const p=PROVIDER_MAP,s=RENDER.providerDrawStamp;
  return !!s&&RENDER.renderedProviderViewportKey===key&&s.key===key&&s.size===JSON.stringify([cw,ch,DPR(),base.width,base.height,flow.width,flow.height,ui.width,ui.height])&&s.view===JSON.stringify(V)&&s.generation===(p.moveGeneration||0)&&(p.navigationFailed||p.readViewportKey===key&&JSON.stringify(p.readView)===s.view);
}
function providerBeginNativeInput(){
  const p=PROVIDER_MAP;providerCancelViewCommand('interrupted');p.navigationFailed=false;
  p.moveGeneration=(p.moveGeneration||0)+1;p.pendingTap=null;
  cancelAnimationFrame(p.syncRAF);p.syncRAF=0;providerCancelGestureDeadline();providerBeginMove();
}
function providerCancelGestureDeadline(){clearTimeout(PROVIDER_MAP.gestureTimer);PROVIDER_MAP.gestureTimer=0;}
function providerArmGestureDeadline(){
  const p=PROVIDER_MAP;providerCancelGestureDeadline();
  if(!p.gesture||nativePointers.size||p.commandPending||p.failed)return;
  p.idleAt=performance.now();
  p.gestureTimer=setTimeout(()=>{p.gestureTimer=0;if(p.failed||p.commandPending||nativePointers.size||!p.gesture)return;p.gesture=false;p.waitingIdle=false;providerSettleTimeout();},250);
}
function providerFinalizeViewport(source){
  const p=PROVIDER_MAP;if(p.failed||p.healthPromise||p.commandPending||p.gesture||nativePointers.size)return false;
  const h=providerHealthSnapshot();p.lastHealth=h;
  if(!h.mapObjectPresent){providerFallback('map-init-failed');return false;}
  if(!h.mapProjectionHealthy){providerHandleProjectionFailure();return false;}
  try{
    providerReadView();p.signature=providerViewportKey();p.viewportDirty=false;
    p.providerMoving=false;p.gesture=false;p.waitingIdle=false;
    dirty=true;dirtyHover=true;RENDER.uiKey='';p.revealAfterBase=true;
    p.healthState='healthy';if(source!=='timeout')p.settleTimedOut=false;
    if(source!=='idle'||p.pendingZoomScale!==p.adapter.getViewportScale())p.pendingZoomScale=null;
    p.finalViewportCount=(p.finalViewportCount||0)+1;p.lastFinalViewport={source,time:performance.now(),center:p.adapter.unproject(cw/2,ch/2),zoom:h.zoom,bounds:h.bounds};
    if(!p.active&&p.loaded)providerCheck();providerUpdateInput();return !p.failed;
  }catch(_){providerHandleProjectionFailure();return false;}
}
function providerQueueFinalViewport(){
  const p=PROVIDER_MAP;
  if(p.syncRAF){p.settleIdleAuthority=true;return;}
  providerQueueSettle(true);
}
function providerQueueSettle(idleAuthority=false){
  const p=PROVIDER_MAP;if(p.syncRAF||p.healthPromise||p.commandPending||p.gesture||p.waitingIdle||p.failed)return;
  p.settleIdleAuthority=idleAuthority;
  let previous='',stable=0,frames=0,keyChanges=0;const started=performance.now(),generation=p.moveGeneration||0;
  const probe=()=>{
    p.syncRAF=0;if(generation!==(p.moveGeneration||0)||p.failed||p.healthPromise||p.commandPending||p.gesture||p.waitingIdle||nativePointers.size)return;
    try{
      const a=p.adapter,key=providerViewportKey(),reported=a.project(...a.getCenter()),scale=a.getViewportScale();
      const centerErrorPx=Math.hypot(reported[0]-cw/2,reported[1]-ch/2),zoom=a.getZoom();
      const zoomScalePending=p.stableZoom!==null&&zoom!==p.stableZoom&&Math.abs(Math.log2(scale/p.stableScale))<.001;
      const idle=p.settleIdleAuthority;
      // reported 중심만 먼저 바뀐 초기 프레임은 기다린다. 지속적인 반올림 차이는 idle authority로 허용한다.
      const ready=(centerErrorPx<=2||idle&&frames>=3)&&!zoomScalePending;
      stable=ready&&key===previous?stable+1:ready?1:0;if(previous&&key!==previous)keyChanges++;previous=key;
      p.lastSettleObservation={frames:++frames,elapsedMs:performance.now()-started,stableFrames:stable,keyChanges,centerErrorPx,zoom,scale,stableZoom:p.stableZoom,stableScale:p.stableScale,zoomScalePending,ready};
      if(stable>=2&&(!idle||frames>=3)){
        p.settleTimedOut=false;p.healthState='healthy';p.settleRecoveredAt=performance.now();
        providerFinalizeViewport(idle?'idle':'settled');
        return;
      }
      // 이벤트 뒤 상한이 있는 감시만 실행한다. 정지 상태에서는 SDK를 읽지 않는다.
      if(frames<120&&performance.now()-started<250)p.syncRAF=requestAnimationFrame(probe);else providerSettleTimeout();
    }catch(_){providerHandleProjectionFailure();}
  };
  p.syncRAF=requestAnimationFrame(probe);
}
function providerViewportChanged(name){
  const p=PROVIDER_MAP;if(!p.commandPending&&['dragstart','pinchstart','zoomstart','app_pan','app_zoom','app_anchor'].includes(name))p.navigationFailed=false;if(p.failed){providerRecordEvent(name);if(p.recoverable&&name==='idle')providerTryRecover('idle');return;}
  if(name==='zoom_changed'&&p.stableZoom!==null)try{const a=p.adapter,scale=a.getViewportScale();if(a.getZoom()!==p.stableZoom&&Math.abs(Math.log2(scale/p.stableScale))<.001)p.pendingZoomScale=scale;}catch(_){providerHandleProjectionFailure();return;}
  p.viewportDirty=true;
  if(['dragstart','pinchstart','zoomstart'].includes(name)){p.gesture=true;p.waitingIdle=true;providerBeginMove();providerRecordEvent(name);providerArmGestureDeadline();return;}
  if(['dragend','pinchend','zoomend'].includes(name)){p.gesture=false;p.waitingIdle=false;}
  if(name==='idle'){p.idleAt=performance.now();if(!nativePointers.size){p.gesture=false;p.waitingIdle=false;}}
  if(['dragend','pinchend','zoomend'].includes(name))p.idleAt=performance.now();
  if(!p.gesture)providerCancelGestureDeadline();else providerArmGestureDeadline();
  // 이미 공개된 동일 viewport의 늦은 idle/end/tile 관련 이벤트는 Canvas를 다시 숨기지 않는다.
  if(p.active&&!p.providerMoving&&!p.revealAfterBase&&!p.commandPending&&!p.healthPromise&&!nativePointers.size&&!p.gesture)try{
    const key=providerViewportKey();if(providerRenderedViewportMatches(key)&&key===p.signature){p.viewportDirty=false;p.duplicateEvents=(p.duplicateEvents||0)+1;providerRecordEvent(name);return;}
  }catch(_){providerHandleProjectionFailure();return;}
  providerBeginMove();providerRecordEvent(name);
  if(name==='idle'&&!nativePointers.size&&!p.commandPending&&!p.healthPromise)providerQueueFinalViewport();else providerQueueSettle();
}
function providerUseNativePan() { return PROVIDER_MAP.active && !S.lock && S.mode==='pan'; }
function providerUpdateInput() {
  const native=providerUseNativePan();stage.classList.toggle('provider-native',native);
  try{PROVIDER_MAP.adapter?.setInteraction?.(native);PROVIDER_MAP.interactionFailures=0;}catch(_){const p=PROVIDER_MAP;if(!p.failed){p.interactionFailures=(p.interactionFailures||0)+1;if(p.interactionFailures>=3)providerFallback('map-api-failure');else providerHandleProjectionFailure();}}
}
function providerCancelViewCommand(reason='superseded') {
  const p=PROVIDER_MAP,c=p.pendingCommand;if(!c)return;
  clearTimeout(c.timer);cancelAnimationFrame(c.raf);p.pendingCommand=null;p.commandPending=false;
  const result={ok:false,id:c.id,status:'cancelled',navigationStatus:'cancelled',reason,targetName:c.targetName,target:c.target,navigationType:c.type,usedRepair:!!c.usedRepair,requestedView:c.view,requestedBounds:c.requestedBounds,fitBoundsType:'LatLngBounds',before:c.before,trace:c.trace};
  p.lastCommand=result;c.resolve(result);
  providerQueueSettle();
}
function providerCommandObservation(c) {
  const a=PROVIDER_MAP.adapter,center=a.getCenter(),renderCenter=a.unproject(cw/2,ch/2),point=a.project(...c.target),reported=a.project(...center);
  const hx=cw/(2*c.view.s),hy=ch/(2*c.view.s),corners=[];
  for(const x of [c.view.cx-hx,c.view.cx+hx])for(const y of [c.view.cy-hy,c.view.cy+hy])corners.push(a.project(lonOf(x),latOf(y)));
  const occupancy=Math.max((Math.max(...corners.map(p=>p[0]))-Math.min(...corners.map(p=>p[0])))/cw,(Math.max(...corners.map(p=>p[1]))-Math.min(...corners.map(p=>p[1])))/ch);
  const bounds=a.getBounds(),inside=point[0]>=0&&point[0]<=cw&&point[1]>=0&&point[1]<=ch&&c.target[0]>=bounds[0][0]&&c.target[0]<=bounds[1][0]&&c.target[1]>=bounds[0][1]&&c.target[1]<=bounds[1][1];
  // 중심·zoom 보고값만 먼저 바뀌어도 실제 표시 projection이 도착하기 전에는 확정하지 않는다.
  const centerErrorPx=Math.hypot(point[0]-cw/2,point[1]-ch/2),reportedErrorPx=Math.hypot(reported[0]-cw/2,reported[1]-ch/2);
  const viewportScale=a.getViewportScale(),zoomPending=a.getZoom()!==c.beforeZoom&&Math.abs(Math.log2(viewportScale/c.beforeScale))<.001;
  const key=providerViewportKey(),groundScale=a.getGroundScale(),visibleWidthM=cw/groundScale,widthRatio=visibleWidthM/c.requestedGroundWidth,centerErrorM=centerErrorPx/groundScale;
  return {visibleWidthM,widthRatio,centerErrorM,time:performance.now(),center,renderCenter,zoom:a.getZoom(),viewportScale,zoomPending,bounds,key,inside,centerErrorPx,reportedErrorPx,occupancy,sdkViewportUnchanged:key===c.before?.key,
    reached:!PROVIDER_MAP.failed&&!zoomPending&&inside&&centerErrorPx<=Math.max(2,Math.min(cw,ch)*.1)&&widthRatio>=.5&&widthRatio<=2&&occupancy>=.35&&occupancy<=1.6};
}
function providerRepairViewCommand(c,o) {
  const p=PROVIDER_MAP;if(p.pendingCommand!==c||c.id!==p.commandId||c.usedRepair)return;
  c.primaryLatencyMs=performance.now()-c.started;c.usedRepair=true;c.phase='repair';c.repairAt=performance.now();c.noopDetectionMs=c.repairAt-c.started;
  c.repairReason=o.sdkViewportUnchanged?'navigation no-op':'target or scale not reached';
  c.stable=0;c.lastKey=null;c.targetZoom=NaverMapAdapter.prototype.repairViewport.call(p.adapter,c);
}
function providerFinishViewCommand(c,ok,reason=null) {
  const p=PROVIDER_MAP;if(p.pendingCommand!==c||c.id!==p.commandId)return;
  clearTimeout(c.timer);cancelAnimationFrame(c.raf);
  try {
    const o=providerCommandObservation(c),after={center:o.center,zoom:o.zoom,bounds:o.bounds,key:o.key};
    p.commandPending=false;p.navigationFailed=!ok;
    // 실패한 SDK 화면은 성공한 요청 V/settledView로 기록하지 않는다. 선택도 성공 때만 확정한다.
    if(ok){providerReadView();p.lastSettledView={...V};p.healthState='healthy';p.settleTimedOut=false;}
    else p.groundScale=p.adapter.getGroundScale();
    p.signature=after.key;p.viewportDirty=false;
    const result={ok,id:c.id,status:ok?'settled':'failed',navigationStatus:ok?(c.usedRepair?'repaired':'success'):'failed',reason,
      targetName:c.targetName,target:c.target,navigationType:c.type,requestedView:c.view,requestedBounds:c.requestedBounds,fitBoundsType:'LatLngBounds',
      requestedGroundWidth:c.requestedGroundWidth,visibleWidthM:o.visibleWidthM,centerErrorM:o.centerErrorM,usedRepair:!!c.usedRepair,repairReason:c.repairReason??null,
      primaryLatencyMs:c.primaryLatencyMs??performance.now()-c.started,fitCallMs:c.fitCallMs,noopDetectionMs:c.noopDetectionMs??null,repairLatencyMs:c.usedRepair?performance.now()-c.repairAt:null,totalLatencyMs:performance.now()-c.started,
      before:c.before,after,sdkViewportUnchanged:after.key===c.before.key,settledView:ok?{...V}:null,center:after.center,renderCenter:o.renderCenter,bounds:after.bounds,trace:c.trace};
    p.pendingCommand=null;p.lastCommand=result;p.providerMoving=false;p.gesture=false;p.waitingIdle=false;p.revealAfterBase=true;p.idleAt=performance.now();dirty=true;dirtyHover=true;RENDER.uiKey='';
    if(ok)c.onSuccess?.();
    providerCheck();c.resolve(result);
  } catch(_){providerCancelViewCommand('provider unavailable');providerHandleProjectionFailure();}
}
function providerApplyView(view = {...V},options={}) {
  const p=PROVIDER_MAP;if(!p.adapter||p.failed){options.onSuccess?.();return Promise.resolve({ok:true,status:'fallback',settledView:{...V}});}
  providerCancelViewCommand();providerCancelGestureDeadline();p.moveGeneration=(p.moveGeneration||0)+1;p.pendingTap=null;p.waitingIdle=false;p.gesture=false;p.navigationFailed=false;cancelAnimationFrame(p.syncRAF);p.syncRAF=0;providerBeginMove();
  const target=[lonOf(view.cx),latOf(view.cy)],point=POINTS.find(q=>Math.abs(q.lon-target[0])<1e-6&&Math.abs(q.lat-target[1])<1e-6);
  const c={id:++p.commandId,view:{...view},target,targetName:options.targetName||point?.name||'좌표/범위',type:options.type||'bounds',onSuccess:options.onSuccess,
    desiredGroundScale:view.s*kAt(target[1]),requestedGroundWidth:cw/(view.s*kAt(target[1])),requestedBounds:providerRequestedBounds(view),trace:[],frame:0,stable:0,lastKey:null,started:performance.now(),phase:'primary'};
  c.promise=new Promise(resolve=>{c.resolve=resolve;});p.pendingCommand=c;p.commandPending=true;p.requestedView={...view};
  const step=()=>{
    if(p.pendingCommand!==c||c.id!==p.commandId)return;
    try {
      providerSync();const o=providerCommandObservation(c);c.trace.push({frame:++c.frame,phase:c.phase,...o,view:{...V}});if(c.trace.length>64)c.trace.shift();
      c.stable=o.reached?(o.key===c.lastKey?c.stable+1:1):0;c.lastKey=o.key;
      if(c.stable>=2){providerFinishViewCommand(c,true);return;}
      // 한 번의 유한한 보정. idle 이벤트 자체는 도착의 증거가 아니며 이전 이벤트도 V를 쓰지 못한다.
      if(!c.usedRepair&&performance.now()-c.started>=500)providerRepairViewCommand(c,o);
      c.raf=requestAnimationFrame(step);
    } catch(_){providerCancelViewCommand('provider unavailable');providerHandleProjectionFailure();}
  };
  c.timer=setTimeout(()=>{try{providerFinishViewCommand(c,false,'requested viewport not reached');}catch(_){providerCancelViewCommand('provider unavailable');providerHandleProjectionFailure();}},p.commandTimeoutMs);
  try {c.before={center:p.adapter.getCenter(),zoom:p.adapter.getZoom(),bounds:p.adapter.getBounds(),key:providerViewportKey()};c.beforeScale=p.adapter.getViewportScale();c.beforeZoom=p.stableZoom!==null&&p.stableScale>0&&Math.abs(Math.log2(c.beforeScale/p.stableScale))<.001?p.stableZoom:c.before.zoom;p.commands++;const start=performance.now();p.adapter.map.stop?.();p.adapter.syncFromAppViewport(c.view);c.fitCallMs=performance.now()-start;p.viewportDirty=true;c.raf=requestAnimationFrame(step);}
  catch(_){providerCancelViewCommand('viewport command failed');providerHandleProjectionFailure();}
  return c.promise;
}
function providerAlignment(adapter) {
  // 9곳의 독립 SDK 화면 역변환을 확인하고, 고정 경위도는 별도 세계 좌표 경로와 비교한다.
  // raw 오차는 기존 실패 원인을 계측하는 값이며, 허용 오차를 판정하는 값과 구분한다.
  const samples = [], rawSamples = []; let max = 0;
  for (const [name, x, y] of [['center',cw/2,ch/2],['NW',0,0],['NE',cw,0],['SW',0,ch],['SE',cw,ch],['N',cw/2,0],['S',cw/2,ch],['W',0,ch/2],['E',cw,ch/2]]) {
    const ll = adapter.unproject(x, y), screen = toS(mxOf(ll[0]), myOf(ll[1])), ref = adapter.referenceProject(...ll);
    const error = Math.max(Math.hypot(screen[0]-ref[0],screen[1]-ref[1]),Math.hypot(ref[0]-x,ref[1]-y));
    const raw = rawToM(x,y), projected = adapter.project(lonOf(raw[0]),latOf(raw[1]));
    rawSamples.push({name,error:Math.hypot(projected[0]-x,projected[1]-y)}); samples.push({name,lon:ll[0],lat:ll[1],error}); max = Math.max(max,error);
  }
  const references = [];
  for (const [name,lon,lat] of [['속초',128.5947,38.20854],['주문진',128.8312883028771,37.89192],['묵호',129.12,37.55],['포항',129.38,36.05]]) {
    const actual = toS(mxOf(lon),myOf(lat)), expected = adapter.referenceProject(lon,lat), error = Math.hypot(actual[0]-expected[0],actual[1]-expected[1]);
    references.push({name,lon,lat,screen:actual,expected,error}); max = Math.max(max,error);
  }
  if (!Number.isFinite(max)) throw Error('지도 좌표 변환 실패');
  const c=adapter.getCenter(), o=adapter.project(...c), ex=adapter.project(lonOf(V.cx+100),c[1]), ey=adapter.project(c[0],latOf(V.cy+100));
  PROVIDER_MAP.diagnostic = {view:{...V},zoom:adapter.getZoom(),viewport:{width:cw,height:ch},samples,references,maxError:max,rawSamples,rawMaxError:Math.max(...rawSamples.map(s=>s.error)),xScaleRatio:Math.hypot(ex[0]-o[0],ex[1]-o[1])/(100*V.s),yScaleRatio:Math.hypot(ey[0]-o[0],ey[1]-o[1])/(100*V.s),providerCenter:c,visibleBounds:adapter.getBounds()};
  return max;
}
// 같은 SDK 내부 경로의 비교값은 실 Marker DOM 검증을 대신하지 않는다.
function providerRect(el) { const r = el.getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height}; }
function providerRectError() {
  const origin = providerRect(ui); let error = 0;
  for (const el of [$('providerMap'),base,flow,stage]) { const rect = providerRect(el); for (const key of ['left','top','width','height']) error = Math.max(error,Math.abs(rect[key]-origin[key])); }
  return error;
}
function providerCheck() {
  const p = PROVIDER_MAP;
  if (!p.adapter || p.failed || !p.loaded || p.syncing || p.healthPromise) return;
  try {
    clearTimeout(p.timer);
    p.checking = true; p.alignment = Math.max(providerAlignment(p.adapter),providerRectError()); p.checking = false; p.active = p.alignment <= 2;
    $('providerMap').style.visibility = p.active ? 'visible' : 'hidden'; dirty = true;
    stage.classList.toggle('provider-active', p.active); providerUpdateInput();
    providerNotice(p.active ? (p.lastCommand?.id===p.commandId&&p.lastCommand?.reason==='requested viewport not reached'?`요청한 ${p.lastCommand.targetName} 위치로 이동하지 못했습니다. 선택은 바꾸지 않았습니다. 현재 지도 폭 약 ${Math.round(p.lastCommand.visibleWidthM/1000)} km · 다시 찾아주세요.`:'NAVER ' + {satellite:'위성지도',hybrid:'위성+지명',normal:'일반지도'}[p.mode] + ' · 수심은 별도 공공자료와 추정값입니다.')
      : '온라인 지도와 분석 표시의 위치를 맞추지 못해 기본 지형지도로 표시합니다.');
  } catch (_) { p.checking = false; providerHandleProjectionFailure(); }
}
function providerSync() {
  const p=PROVIDER_MAP;if(!p.adapter||p.failed||p.healthPromise||p.syncing||!cw||!ch)return;
  p.syncing=true;if(p.loaded)clearTimeout(p.timer);
  try {
    const sizeKey=[cw,ch].join(',');if(p.sizeKey!==sizeKey){p.sizeKey=sizeKey;p.adapter.resize();p.lastResize={time:performance.now(),width:cw,height:ch};p.resizeCount=(p.resizeCount||0)+1;p.viewportDirty=true;}
    // 활성화·크기 변경·명시적 명령·최종 idle에서만 읽는다.
    const key=providerViewportKey();
    const v=p.compatibility;
    const repair=!p.commandPending&&(!v||v.cx!==V.cx||v.cy!==V.cy||v.s!==V.s);
    if(key!==p.signature||p.viewportDirty||repair){p.signature=key;p.viewportDirty=false;if(!p.commandPending)providerReadView();else{dirty=true;dirtyHover=true;}}
  } catch (_) {providerHandleProjectionFailure();}
  finally {p.syncing=false;}
  if(!p.active&&p.loaded&&!p.commandPending)providerCheck();
  providerUpdateInput();
}
function providerZoomAt(x,y,factor) {
  providerCancelViewCommand('interrupted');
  try {PROVIDER_MAP.commands++;PROVIDER_MAP.adapter.zoomAt(x,y,factor);providerViewportChanged('app_zoom');providerSync();}
  catch (_) {providerHandleProjectionFailure();}
}
function providerPanAnchor(ll,x,y) {
  providerCancelViewCommand('interrupted');
  try {PROVIDER_MAP.commands++;PROVIDER_MAP.adapter.moveAnchor(ll,x,y);providerViewportChanged('app_anchor');providerSync();}
  catch (_) {providerHandleProjectionFailure();}
}
function providerPanBy(dx,dy) {
  providerCancelViewCommand('interrupted');
  try {PROVIDER_MAP.commands++;PROVIDER_MAP.adapter.panPixels(dx,dy);providerViewportChanged('app_pan');providerSync();}
  catch (_) {providerHandleProjectionFailure();}
}
function scheduleDisplayDepthArea() {
  if(PROVIDER_MAP.commandPending||PROVIDER_MAP.providerMoving){clearTimeout(OFFICIAL_DEPTH.timer);return;}
  if (!PROVIDER_MAP.active) { scheduleDepthArea(); return; }
  clearTimeout(OFFICIAL_DEPTH.timer);RENDER.depthQueued=true;PROVIDER_MAP.depthDeferred=false;
  OFFICIAL_DEPTH.timer = setTimeout(async () => {
    RENDER.depthQueued=false;if(PROVIDER_MAP.providerMoving||PROVIDER_MAP.commandPending){RENDER.depthKey='';PROVIDER_MAP.depthDeferred=true;return;}
    // SDK bounds와 화면 네 변을 함께 포함한다. 두 대각점만으로 비선형 투영을 자르지 않는다.
    const b = viewBounds(), areas = [[lonOf(b[0]),latOf(b[1]),lonOf(b[2]),latOf(b[3])]];
    if (S.A && S.B) areas.push([Math.min(lonOf(S.A[0]),lonOf(S.B[0])),Math.min(latOf(S.A[1]),latOf(S.B[1])),Math.max(lonOf(S.A[0]),lonOf(S.B[0])),Math.max(latOf(S.A[1]),latOf(S.B[1]))]);
    if (await depthPrepareAreas(areas)) { dirty = true; dirtyHover = true; analyzeSection(); }
  },250);
}
function providerSetMode(mode) {
  const p = PROVIDER_MAP; p.mode = ['satellite','hybrid','normal'].includes(mode) ? mode : 'satellite';
  try { localStorage.setItem('naksigwang-map-mode-v2', p.mode); } catch (_) { /* 저장 제한 */ }
  for (const b of $('providerModes').children) b.setAttribute('aria-pressed', b.dataset.providerMode === p.mode);
  if (p.adapter && !p.failed) {
    // 같은 지도 인스턴스의 배경만 바꾼다. dirty/단면/수심 로더를 건드리지 않는다.
    clearTimeout(p.timer); p.timer = setTimeout(providerModeTimeout, 12000);
    try { p.adapter.setMode(p.mode);if(p.active)providerNotice('NAVER '+{satellite:'위성지도',hybrid:'위성+지명',normal:'일반지도'}[p.mode]+' · 수심은 별도 공공자료와 추정값입니다.'); } catch (_) { providerHandleProjectionFailure(); }
  }
}
async function providerStart() {
  const p = PROVIDER_MAP; if (p.started) return; p.started = true;
  providerSetMode(p.mode);
  // 배포 또는 로컬에서 별도로 제공하는 공개 브라우저 설정. 저장소에는 credential을 넣지 않는다.
  let key = document.querySelector('meta[name="naver-map-key-id"]')?.content.trim();
  try { key ||= localStorage.getItem('naksigwang-naver-key-id')?.trim(); } catch (_) { /* 로컬 설정 제한 */ }
  if (!key) { providerNotice('온라인 지도 설정 전 · 기본 지형지도로 표시합니다.'); return; }
  if(p.offline){providerFallback('browser-offline');return;}
  let startupReason='sdk-script-load-failed';
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); const timer = setTimeout(() => { script.remove();startupReason='sdk-script-timeout';reject(Error('SDK timeout')); }, 12000);
      const finish = fn => { clearTimeout(timer); script.onload = script.onerror = null; fn(); };
      window.navermap_authFailure = () => {startupReason='auth-failed';finish(() => reject(Error('SDK 인증 실패')));providerFallback('auth-failed');};
      window.naksigwangProviderReady = () => finish(resolve);
      script.onerror = () => finish(() => reject(Error('SDK 로드 실패')));
      script.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + encodeURIComponent(key) + '&callback=naksigwangProviderReady';
      document.head.append(script);
    });
    if (p.failed) return;
    startupReason='map-init-failed';
    p.adapter = new NaverMapAdapter(window.naver.maps); p.adapter.init($('providerMap'));
    p.adapter.onTilesLoaded(providerTilesLoaded);
    p.adapter.onViewportReady(providerViewportChanged);
    providerSetMode(p.mode);providerApplyView({...V});providerSync();

  } catch (_) {if(!p.failed)providerFallback(startupReason);}
}
