// p3_provider_checks.js — 실제 API 없이 지도 어댑터·상태 보존 검사
window.p3Ready = () => !!GE;
window.p3SizeCheck = () => ch===Math.round(cw<560?clamp(innerHeight-290,320,cw*1.3):Math.min(cw*.72,Math.max(380,innerHeight-240)));
// 앱 변환을 호출하지 않는 비선형 세계 좌표. 정수 줌과 회전·곡률을 함께 재현한다.
const fakeWorld = (lon,lat) => { const y=myOf(lat), d=y-myOf(36); return [mxOf(lon)+.03*d+1e-7*d*d,y]; };
const fakeDestination=(lon,lat,meter)=>{const a=meter/R,phi=lat*D2R,phi2=Math.asin(Math.sin(phi)*Math.cos(a));return [lon+Math.atan2(Math.sin(a)*Math.cos(phi),Math.cos(a)-Math.sin(phi)*Math.sin(phi2))/D2R,phi2/D2R];};
const fakeCoord = (x,y) => { const d=y-myOf(36); return [lonOf(x-.03*d-1e-7*d*d),latOf(y)]; };
class P3ProbeLL { constructor(lat,lon) {this.latitude=lat;this.longitude=lon;} lat(){return this.latitude;} lng(){return this.longitude;} }
class P3ProbeXY { constructor(x,y) {this.x=x;this.y=y;} }
// native DOM 기준은 adapter.project/referenceProject/toS를 호출하지 않고 SDK 렌더러를 모사한다.
class P3NativeMarker {
  constructor(options) {this.options=options;this.setMap(options.map);}
  setMap(map) {this.map?.owner.markers.delete(this);this.element?.remove();this.map=map;if(!map)return;this.element=this.options.icon.content;map.owner.markers.add(this);map.owner.container.append(this.element);this.render();}
  render() {if(!this.map)return;const f=this.map.owner,p=this.options.position,c=fakeWorld(...f.center),w=fakeWorld(p.lng(),p.lat()),anchor=this.options.icon.anchor;
    this.element.style.position='absolute';this.element.style.left=((w[0]-c[0])*2**f.z/200000+cw/2-anchor.x+(f.nativeOffset||0))+'px';this.element.style.top=((c[1]-w[1])*2**f.z/200000+ch/2-anchor.y)+'px';}
}
class FakeMapAdapter {
  init(container) { this.container=container; this.instances=1; this.modes=[]; this.error=0; this.center=[128,36]; this.z=10; this.markers=new Set();this.sdk={LatLng:P3ProbeLL,Size:P3ProbeXY,Point:P3ProbeXY,Marker:P3NativeMarker};this.map={owner:this,setZoom:z=>{this.z=z;this.renderMarkers();},
      panBy:p=>{const c=fakeWorld(...this.center),ll=fakeCoord(c[0]+p.x/this.scale(),c[1]-p.y/this.scale());this.setCenter(...ll);},
      zoomBy:(delta,ll)=>{const p=this.referenceProject(ll.lng(),ll.lat()),w=fakeWorld(ll.lng(),ll.lat());this.z=Math.max(6,Math.min(21,this.z+delta));this.center=fakeCoord(w[0]-(p[0]-cw/2)/this.scale(),w[1]+(p[1]-ch/2)/this.scale());this.renderMarkers();this.viewportListener?.('zoom_changed');this.viewportListener?.('idle');}}; }
  setMode(mode) { this.modes.push(mode); this.loaded?.(); }
  createDebugMarker(lat,lon) {return NaverMapAdapter.prototype.createDebugMarker.call(this,lat,lon);}
  renderMarkers() {for(const m of this.markers)m.render();}
  getGroundScale(){const c=this.unproject(cw/2,ch/2),e=fakeDestination(...c,100),a=this.project(...c),b=this.project(...e);return Math.hypot(b[0]-a[0],b[1]-a[1])/100;}
  setInteraction(enabled){this.interactive=enabled;}
  onViewportReady(fn){this.viewportListener=fn;}
  panPixels(dx,dy){NaverMapAdapter.prototype.panPixels.call(this,dx,dy);}
  scale() { return 2**this.z/200000; }
  syncFromAppViewport(view=V) { this.syncCalls=(this.syncCalls||0)+1;this.center=[lonOf(view.cx),latOf(view.cy)]; this.z=Math.max(6,Math.min(21,Math.round(Math.log2(view.s*200000)))); this.zoomTarget=this.z; this.viewport={...view,s:this.scale()}; this.renderMarkers();this.loaded?.(); }
  resize() { this.size=[cw,ch];this.renderMarkers(); }
  project(lon,lat) { const w=fakeWorld(lon,lat), c=fakeWorld(...this.center), s=this.scale(); return [(w[0]-c[0])*s+cw/2+this.error,(c[1]-w[1])*s+ch/2]; }
  referenceProject(lon,lat) { const w=fakeWorld(lon,lat), c=fakeWorld(...this.center); return [(w[0]-c[0])*2**this.z/200000+cw/2,(c[1]-w[1])*2**this.z/200000+ch/2]; }
  unproject(x,y) { const c=fakeWorld(...this.center), s=this.scale(); return fakeCoord(c[0]+(x-cw/2)/s,c[1]-(y-ch/2)/s); }
  getBounds() { const pts=[this.unproject(0,0),this.unproject(cw,0),this.unproject(0,ch),this.unproject(cw,ch)]; return [[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]]; }
  getCenter() { return this.center; }
  getZoom() { return this.z; }
  setCenter(lon,lat) { this.center=[lon,lat];this.renderMarkers();this.viewportListener?.('center_changed');this.viewportListener?.('idle'); }
  moveAnchor(ll,x,y) { NaverMapAdapter.prototype.moveAnchor.call(this,ll,x,y); }
  zoomAt(x,y,f) { NaverMapAdapter.prototype.zoomAt.call(this,x,y,f); }
  onTilesLoaded(fn) { this.loaded=fn; }
  destroy() { for(const m of [...this.markers])m.setMap(null);this.destroyed=true; }
}
window.p3Test = async () => {
  const check = (ok, msg) => { if (!ok) throw Error(msg); };
  const pause = () => new Promise(r => setTimeout(r, 500));
  showTab('map'); await pause();
  exampleSection(128.93, 37.8); await pause();
  const fake = new FakeMapAdapter(); fake.init($('providerMap'));
  Object.assign(PROVIDER_MAP, {adapter:fake,failed:false,signature:'',active:false});
  fake.onTilesLoaded(() => { PROVIDER_MAP.loaded=true; clearTimeout(PROVIDER_MAP.timer); providerCheck(); });
  providerApplyView({...V});providerSync(); await pause();
  check(PROVIDER_MAP.active && PROVIDER_MAP.alignment < 1e-6, 'mock 정합 통과');
  renderBase();
  const pixels=bctx.getImageData(0,0,base.width,base.height).data;let painted=0;
  for(let i=3;i<pixels.length;i+=4)if(pixels[i])painted++;
  check(painted<base.width*base.height*.8 && !!maskData,'배경 투명·분석 마스크 보존');
  S.pin=[mxOf(128.8312883028771),myOf(37.89192)];
  hoverAt=toS(...S.pin);dirtyHover=true;updateHover();
  check($('depthRead').textContent.length>0,'전환 전 실제 수심 readout');
  const state = () => JSON.stringify({V,Spt:S.pt,pin:S.pin,A:S.A,B:S.B,SEC,depths:window.p3DepthSnapshot(),read:$('depthRead').textContent});
  await pause();await OFFICIAL_DEPTH.init;await Promise.all([...OFFICIAL_DEPTH.pending.values()]);await pause();
  const before = state();
  const originalFetch=window.fetch;let depthFetches=0;
  window.fetch=(url,...args)=>{if(String(url).includes('static/depth/'))depthFetches++;return originalFetch(url,...args);};
  providerSetMode('satellite');providerSetMode('hybrid');providerSetMode('normal');await pause();
  window.fetch=originalFetch;check(depthFetches===0,'활성 배경 전환 시 수심 요청 없음');
  check(fake.instances===1 && fake.modes.join(',')==='satellite,hybrid,normal','인스턴스와 모드 전환');
  check(before===state(),'선택·단면·수심·화면 상태 보존');
  const point=fake.project(128.8,37.9), ll=fake.unproject(...point);
  check(Math.abs(ll[0]-128.8)<1e-8 && Math.abs(ll[1]-37.9)<1e-8,'좌표 왕복');
  check(fake.getBounds().length===2,'범위');
  fake.setCenter(lonOf(V.cx+100/V.s),latOf(V.cy));providerSync();check(Math.abs(mxOf(fake.getCenter()[0])-V.cx)<.001,'SDK 화면 이동 동기화');
  zoomAt(cw/2,ch/2,1.8);providerSync();check(Math.abs(fake.getGroundScale()-pxPerGround())<1e-10,'확대 동기화');
  const loaded=fake.loaded, clear=window.clearTimeout;let cleared=null;fake.loaded=null;window.clearTimeout=id=>{cleared=id;clear(id);};
  fake.setCenter(lonOf(V.cx+10/V.s),latOf(V.cy));providerSync();check(PROVIDER_MAP.active && cleared===PROVIDER_MAP.timer,'캐시된 타일 이동 시 timeout 해제');
  fake.loaded=loaded;window.clearTimeout=clear;
  resize();check(fake.size[0]===cw && fake.size[1]===ch,'크기 일치');
  check(base.width===Math.round(cw*DPR()) && base.height===Math.round(ch*DPR()),'DPR 크기');
  const errors=[];
  for(const [name,lon,lat] of [['속초',128.6,38.2],['주문진',128.83,37.89],['묵호',129.12,37.55],['포항',129.38,36.05]]) {
    for(const width of [1500,9000,60000,600000]) {fitGround(lat,lon,width);providerSync();errors.push({name,width,error:providerAlignment(fake),rawError:PROVIDER_MAP.diagnostic.rawMaxError});}
  }
  for(const [name,bb] of [['전국',[124.4,32.9,131.95,38.7]],['동해안',[128.4,35.8,129.6,38.5]]]) { fitLonLat(bb);providerSync();errors.push({name,error:providerAlignment(fake),rawError:PROVIDER_MAP.diagnostic.rawMaxError}); }
  check(errors.every(e=>e.error<1e-5),'전국·광역·항만·근접 비선형 정합');
  check(errors.some(e=>e.rawError>2),'기존 affine 변환의 비선형 실패 재현');
  const anchor=fake.unproject(cw*.3,ch*.6);
  providerPanAnchor(anchor,cw*.4,ch*.7);
  let screen=toS(mxOf(anchor[0]),myOf(anchor[1]));check(Math.hypot(screen[0]-cw*.4,screen[1]-ch*.7)<1e-5,'pan 고정점');
  const z=fake.getZoom();for(let i=0;i<12;i++)zoomAt(cw*.4,ch*.7,1.05);
  check(fake.getZoom()>z,'작은 wheel/pinch 배율 누적');
  screen=toS(mxOf(anchor[0]),myOf(anchor[1]));check(Math.hypot(screen[0]-cw*.4,screen[1]-ch*.7)<1e-5,'줌 고정점');
  const bounds=viewBounds();for(const [x,y] of [[0,0],[cw,0],[0,ch],[cw,ch],[cw/2,0]]) { const m=toM(x,y);check(m[0]>=bounds[0]-.01&&m[0]<=bounds[2]+.01&&m[1]>=bounds[1]-.01&&m[1]<=bounds[3]+.01,'수심 화면 경계'); }
  const rect=ui.getBoundingClientRect(), capture=ui.setPointerCapture;
  ui.setPointerCapture=()=>{};
  const pointer=(type,id,x,y,kind='mouse')=>ui.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:kind,clientX:rect.left+x,clientY:rect.top+y,bubbles:true}));
  try {
    setMode('line');const a=toM(cw*.35,ch*.4),b=toM(cw*.65,ch*.6);
    pointer('pointerdown',31,cw*.35,ch*.4);pointer('pointermove',31,cw*.65,ch*.6);pointer('pointerup',31,cw*.65,ch*.6);
    check(Math.hypot(S.A[0]-a[0],S.A[1]-a[1])<.001&&Math.hypot(S.B[0]-b[0],S.B[1]-b[1])<.001,'A-B 입력 좌표');
    pointer('pointermove',32,cw*.5,ch*.5);dirtyHover=true;updateHover();check($('cursorRead').textContent.length>0,'hover 입력');
    setMode('pan');check(fake.interactive&&getComputedStyle(ui).pointerEvents==='none','이동 모드는 SDK 입력');
    const target=fake.unproject(cw*.4,ch*.5);fake.map.panBy(new P3ProbeXY(-cw*.1,-ch*.05));providerSync();
    screen=toS(mxOf(target[0]),myOf(target[1]));check(Math.hypot(screen[0]-cw*.5,screen[1]-ch*.55)<1e-5,'native pan');
    setMode('line');check(!fake.interactive,'단면 모드는 Canvas 입력');
    const oldZoom=fake.getZoom();
    ui.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+cw/2,clientY:rect.top+ch/2,deltaY:-500,cancelable:true}));
    check(fake.getZoom()>oldZoom,'wheel 이벤트');
    const pinchAnchor=fake.unproject(cw*.5,ch*.5);
    pointer('pointerdown',51,cw*.4,ch*.5,'touch');pointer('pointerdown',52,cw*.6,ch*.5,'touch');
    pointer('pointermove',51,cw*.2,ch*.5,'touch');pointer('pointermove',52,cw*.8,ch*.5,'touch');
    pointer('pointerup',51,cw*.2,ch*.5,'touch');pointer('pointerup',52,cw*.8,ch*.5,'touch');
    screen=toS(mxOf(pinchAnchor[0]),myOf(pinchAnchor[1]));check(Math.hypot(screen[0]-cw*.5,screen[1]-ch*.5)<1e-5,'pinch 중심점');
    fitGround(POINTS[S.pt].lat,POINTS[S.pt].lon,9000);providerSync();drawUI();renderBase();check(stHits.length>0,'항구·갯바위 표시 유지');
  } finally { ui.setPointerCapture=capture;ptrs.clear();pinch=null;panStart=null;S.drag=null; }
  fake.error=3;providerCheck();check(!PROVIDER_MAP.active,'2px 초과 차단');
  fake.error=0;providerCheck();check(PROVIDER_MAP.active,'정합 복구');
  const saved=state();providerFallback();check(!PROVIDER_MAP.active && PROVIDER_MAP.failed,'실패 fallback');
  check(JSON.stringify(toM(10,20))===JSON.stringify(rawToM(10,20)),'실패 시 raw 변환');
  check(state()===saved && $('providerNotice').textContent.includes('기본 지형'),'실패 후 분석 보존');
  fake.destroy();check(fake.destroyed,'해제');
  PROVIDER_MAP.adapter=null;
  return {alignmentErrors:errors,dpr:DPR(),checks:29};
};

window.p3AdapterUnit = () => {
  const calls=[];let instances=0;
  class LL {constructor(lat,lon){this.latitude=lat;this.longitude=lon;}lat(){return this.latitude;}lng(){return this.longitude;}}
  class XY {constructor(x,y){this.x=x;this.y=y;}}
  const sdk={LatLng:LL,Point:XY,Size:XY,MapTypeId:{SATELLITE:'S',NORMAL:'N',HYBRID:'H'},Event:{addListener:()=>1,removeListener:l=>calls.push(['remove',l])},Map:class {
    constructor(c,o){instances++;this.z=o.zoom;this.c=o.center;}
    setMapTypeId(m){calls.push(m);}setCenter(c){this.c=c;calls.push('center');}getCenter(){return this.c;}
    setZoom(z){this.z=z;}getZoom(){return this.z;}setSize(s){calls.push('size');}setOptions(o){calls.push('options');}
    fitBounds(b){this.c=new LL((b[0].lat()+b[1].lat())/2,(b[0].lng()+b[1].lng())/2);calls.push('fitBounds');}
    getBounds(){return {getSW:()=>new LL(33,124),getNE:()=>new LL(39,132)};}destroy(){calls.push('destroy');}
    getProjection(){const scale=2**this.z/200000, center=fakeWorld(this.c.lng(),this.c.lat()); return {
      getDestinationCoord:(c,a,m)=>{const ll=fakeDestination(c.lng(),c.lat(),m);return new LL(ll[1],ll[0]);},
      fromCoordToPoint:c=>{const w=fakeWorld(c.lng(),c.lat());return new XY(...w);},
      fromPointToOffset:p=>new XY((p.x-center[0])*scale+cw/2,(center[1]-p.y)*scale+ch/2),
      fromCoordToOffset:c=>{const w=fakeWorld(c.lng(),c.lat());return new XY((w[0]-center[0])*scale+cw/2,(center[1]-w[1])*scale+ch/2);},
      fromOffsetToCoord:p=>{const ll=fakeCoord(center[0]+(p.x-cw/2)/scale,center[1]-(p.y-ch/2)/scale);return new LL(ll[1],ll[0]);}
    };}
  }};
  const a=new NaverMapAdapter(sdk);a.init($('providerMap'));a.setMode('satellite');a.setMode('hybrid');a.setMode('normal');
  a.resize();a.syncFromAppViewport();a.onTilesLoaded(()=>{});
  const p=a.project(129,37),ll=a.unproject(...p);
  if(instances!==1 || calls[0]!=='S' || calls[1]!=='H' || calls[2]!=='N' || Math.abs(ll[0]-129)>1e-8 || Math.abs(ll[1]-37)>1e-8 || a.getBounds()[0][0]!==124)throw Error('NAVER 어댑터 계약');
  const ref=a.referenceProject(129,37);if(Math.hypot(ref[0]-p[0],ref[1]-p[1])>1e-6)throw Error('독립 세계 좌표 경로');
  a.destroy();if(a.map!==null || !calls.includes('destroy'))throw Error('NAVER 해제');
  return true;
};
window.p3SwitchOnly = () => {providerSetMode('satellite');providerSetMode('hybrid');providerSetMode('normal');};
window.p3Preference = () => ({mode:PROVIDER_MAP.mode,legacy:localStorage.getItem('naksigwang-map-mode'),saved:localStorage.getItem('naksigwang-map-mode-v2'),pressed:$('providerModes').querySelector('[aria-pressed="true"]').dataset.providerMode});
window.p3NativeTest = async () => {
  const check=(ok,msg)=>{if(!ok)throw Error(msg);};
  showTab('map');await new Promise(r=>setTimeout(r,350));
  const fake=new FakeMapAdapter();fake.init($('providerMap'));Object.assign(PROVIDER_MAP,{adapter:fake,failed:false,loaded:true,signature:'',active:false});
  fake.onTilesLoaded(()=>{PROVIDER_MAP.loaded=true;providerCheck();});
  providerSetMode('satellite');providerSync();
  const samples=[], required=['providerMode','providerZoom','providerRect','canvasRect','baseRect','flowRect','stageRect','rectDeltas','dpr','canvasDpr','lat','lon','nativeMarkerPixel','canvasPixel','dx','dy','errorPx','center','bounds'];
  for(const width of [600000,60000,10000,5000,2000,1000]) {
    const result=await window.naksigwangMapDiagnostic.fit(width,width===600000?36:38.20854,width===600000?128:128.5947);
    check(required.every(k=>k in result),'진단 반환 필드 계약');
    check(result.valid && result.passes && result.errorPx<=2,'native DOM vs 실제 Canvas 정합 '+width);
    check(result.domMismatchPx<.01 && result.attribution.fullViewportUnchanged,'DOM 크기/원점·출처 영역');
    check(result.canvasPixel && result.nativeMarkerPixel && result.timeline.length>=3,'독립 렌더링과 프레임 기록');
    samples.push({width,errorPx:result.errorPx,dx:result.dx,dy:result.dy,rectMismatch:result.domMismatchPx,zoom:result.providerZoom,dpr:result.dpr,drawingDpr:result.drawingDpr});
  }
  clearTimeout(OFFICIAL_DEPTH.timer);await Promise.all([...OFFICIAL_DEPTH.pending.values()]);clearTimeout(OFFICIAL_DEPTH.timer);
  const saved=JSON.stringify({pin:S.pin,A:S.A,B:S.B,SEC});
  fake.nativeOffset=6;fake.renderMarkers();const shifted=await window.naksigwangMapDiagnostic(38.20854,128.5947);
  check(!shifted.passes && shifted.errorPx>5,'독립 native DOM 오차 검출');
  check(PROVIDER_MAP.diagnostic.maxError<1e-5,'내부 project 비교가 통과해도 native DOM 검사는 실패');
  fake.nativeOffset=0;fake.renderMarkers();
  $('providerMap').style.transform='translateX(5px)';const domShift=await window.naksigwangMapDiagnostic(38.20854,128.5947);
  check(domShift.domMismatchPx>=5 && !domShift.passes,'DOM 원점 오차 검출');
  providerCheck();check(!PROVIDER_MAP.active,'DOM 오차 guard');
  $('providerMap').style.transform='';providerCheck();
  const ok=await window.naksigwangMapDiagnostic(38.20854,128.5947);check(ok.passes,'DOM 원점 복구');
  check(saved===JSON.stringify({pin:S.pin,A:S.A,B:S.B,SEC}),'debug 생성 시 분석·핀 상태 유지');
  window.naksigwangMapDiagnostic.clear();drawUI();check(!$('providerMap').querySelector('[data-naksigwang-native-probe]')&&!PROVIDER_DEBUG,'debug 해제');
  fake.destroy();PROVIDER_MAP.adapter=null;PROVIDER_MAP.active=false;$('providerMap').style.visibility='hidden';stage.classList.remove('provider-active');dirty=true;
  const unavailable=await window.naksigwangMapDiagnostic(38.20854,128.5947);check(required.every(k=>k in unavailable)&&!unavailable.valid&&unavailable.errorPx===null,'미준비 진단 필드와 null 오차');
  return {samples,nativeFaultPx:shifted.errorPx,domFaultPx:domShift.errorPx};
};
