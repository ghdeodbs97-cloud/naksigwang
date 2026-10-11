// p3_provider_checks.js — 실제 API 없이 지도 어댑터·상태 보존 검사
window.p3Ready = () => !!GE;
window.p3SizeCheck = () => ch===Math.round(cw<560?clamp(innerHeight-290,320,cw*1.3):Math.min(cw*.72,Math.max(380,innerHeight-240)));
// 앱 변환을 호출하지 않는 비선형 세계 좌표. 정수 줌과 회전·곡률을 함께 재현한다.
const fakeWorld = (lon,lat) => { const y=myOf(lat), d=y-myOf(36); return [mxOf(lon)+.03*d+1e-7*d*d,y]; };
const fakeCoord = (x,y) => { const d=y-myOf(36); return [lonOf(x-.03*d-1e-7*d*d),latOf(y)]; };
class FakeMapAdapter {
  init(container) { this.container=container; this.instances=1; this.modes=[]; this.error=0; this.center=[128,36]; this.z=10; this.map={setZoom:z=>{this.z=z;}}; }
  setMode(mode) { this.modes.push(mode); this.loaded?.(); }
  scale() { return 2**this.z/200000; }
  syncFromAppViewport() { this.center=[lonOf(V.cx),latOf(V.cy)]; this.z=Math.max(6,Math.min(21,Math.round(Math.log2(V.s*200000)))); this.zoomTarget=this.z; this.viewport={...V,s:this.scale()}; this.loaded?.(); }
  resize() { this.size=[cw,ch]; }
  project(lon,lat) { const w=fakeWorld(lon,lat), c=fakeWorld(...this.center), s=this.scale(); return [(w[0]-c[0])*s+cw/2+this.error,(c[1]-w[1])*s+ch/2]; }
  referenceProject(lon,lat) { const w=fakeWorld(lon,lat), c=fakeWorld(...this.center); return [(w[0]-c[0])*2**this.z/200000+cw/2,(c[1]-w[1])*2**this.z/200000+ch/2]; }
  unproject(x,y) { const c=fakeWorld(...this.center), s=this.scale(); return fakeCoord(c[0]+(x-cw/2)/s,c[1]-(y-ch/2)/s); }
  getBounds() { const pts=[this.unproject(0,0),this.unproject(cw,0),this.unproject(0,ch),this.unproject(cw,ch)]; return [[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]]; }
  getCenter() { return this.center; }
  getZoom() { return this.z; }
  setCenter(lon,lat) { this.center=[lon,lat]; }
  moveAnchor(ll,x,y) { NaverMapAdapter.prototype.moveAnchor.call(this,ll,x,y); }
  zoomAt(x,y,f) { NaverMapAdapter.prototype.zoomAt.call(this,x,y,f); }
  onTilesLoaded(fn) { this.loaded=fn; }
  destroy() { this.destroyed=true; }
}
window.p3Test = async () => {
  const check = (ok, msg) => { if (!ok) throw Error(msg); };
  const pause = () => new Promise(r => setTimeout(r, 500));
  showTab('map'); await pause();
  exampleSection(128.93, 37.8); await pause();
  const fake = new FakeMapAdapter(); fake.init($('providerMap'));
  Object.assign(PROVIDER_MAP, {adapter:fake,failed:false,signature:'',active:false});
  fake.onTilesLoaded(() => { PROVIDER_MAP.loaded=true; clearTimeout(PROVIDER_MAP.timer); providerCheck(); });
  providerSync(); await pause();
  check(PROVIDER_MAP.active && PROVIDER_MAP.alignment < 1e-6, 'mock 정합 통과');
  renderBase();
  const pixels=bctx.getImageData(0,0,base.width,base.height).data;let painted=0;
  for(let i=3;i<pixels.length;i+=4)if(pixels[i])painted++;
  check(painted<base.width*base.height*.8 && !!maskData,'배경 투명·분석 마스크 보존');
  S.pin=[mxOf(128.8312883028771),myOf(37.89192)];
  hoverAt=toS(...S.pin);dirtyHover=true;updateHover();
  check($('depthRead').textContent.length>0,'전환 전 실제 수심 readout');
  const state = () => JSON.stringify({V,Spt:S.pt,pin:S.pin,A:S.A,B:S.B,SEC,depths:window.p3DepthSnapshot(),read:$('depthRead').textContent});
  const before = state();
  const originalFetch=window.fetch;let depthFetches=0;
  window.fetch=(url,...args)=>{if(String(url).includes('static/depth/'))depthFetches++;return originalFetch(url,...args);};
  providerSetMode('satellite');providerSetMode('normal');await pause();
  window.fetch=originalFetch;check(depthFetches===0,'활성 배경 전환 시 수심 요청 없음');
  check(fake.instances===1 && fake.modes.join(',')==='satellite,normal','인스턴스와 모드 전환');
  check(before===state(),'선택·단면·수심·화면 상태 보존');
  const point=fake.project(128.8,37.9), ll=fake.unproject(...point);
  check(Math.abs(ll[0]-128.8)<1e-8 && Math.abs(ll[1]-37.9)<1e-8,'좌표 왕복');
  check(fake.getBounds().length===2,'범위');
  V.cx+=100/V.s;clampView();providerSync();check(Math.abs(fake.viewport.cx-V.cx)<.001,'화면 이동 동기화');
  zoomAt(cw/2,ch/2,1.8);providerSync();check(Math.abs(fake.scale()-V.s)<1e-10,'확대 동기화');
  const loaded=fake.loaded, clear=window.clearTimeout;let cleared=null;fake.loaded=null;window.clearTimeout=id=>{cleared=id;clear(id);};
  V.cx+=10/V.s;providerSync();check(PROVIDER_MAP.active && cleared===PROVIDER_MAP.timer,'캐시된 타일 이동 시 timeout 해제');
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
    setMode('pan');const target=fake.unproject(cw*.4,ch*.5);
    pointer('pointerdown',41,cw*.4,ch*.5);pointer('pointermove',41,cw*.5,ch*.55);pointer('pointerup',41,cw*.5,ch*.55);
    screen=toS(mxOf(target[0]),myOf(target[1]));check(Math.hypot(screen[0]-cw*.5,screen[1]-ch*.55)<1e-5,'pan 이벤트');
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
  const sdk={LatLng:LL,Point:XY,Size:XY,MapTypeId:{NORMAL:'N',HYBRID:'H'},Event:{addListener:()=>1,removeListener:l=>calls.push(['remove',l])},Map:class {
    constructor(c,o){instances++;this.z=o.zoom;this.c=o.center;}
    setMapTypeId(m){calls.push(m);}setCenter(c){this.c=c;calls.push('center');}getCenter(){return this.c;}
    setZoom(z){this.z=z;}getZoom(){return this.z;}setSize(s){calls.push('size');}
    getBounds(){return {getSW:()=>new LL(33,124),getNE:()=>new LL(39,132)};}destroy(){calls.push('destroy');}
    getProjection(){const scale=2**this.z/200000, center=fakeWorld(this.c.lng(),this.c.lat()); return {
      fromCoordToPoint:c=>{const w=fakeWorld(c.lng(),c.lat());return new XY(...w);},
      fromPointToOffset:p=>new XY((p.x-center[0])*scale+cw/2,(center[1]-p.y)*scale+ch/2),
      fromCoordToOffset:c=>{const w=fakeWorld(c.lng(),c.lat());return new XY((w[0]-center[0])*scale+cw/2,(center[1]-w[1])*scale+ch/2);},
      fromOffsetToCoord:p=>{const ll=fakeCoord(center[0]+(p.x-cw/2)/scale,center[1]-(p.y-ch/2)/scale);return new LL(ll[1],ll[0]);}
    };}
  }};
  const a=new NaverMapAdapter(sdk);a.init($('providerMap'));a.setMode('normal');a.setMode('satellite');
  a.resize();a.syncFromAppViewport();a.onTilesLoaded(()=>{});
  const p=a.project(129,37),ll=a.unproject(...p);
  if(instances!==1 || calls[0]!=='N' || calls[1]!=='H' || Math.abs(ll[0]-129)>1e-8 || Math.abs(ll[1]-37)>1e-8 || a.getBounds()[0][0]!==124)throw Error('NAVER 어댑터 계약');
  const ref=a.referenceProject(129,37);if(Math.hypot(ref[0]-p[0],ref[1]-p[1])>1e-6)throw Error('독립 세계 좌표 경로');
  a.destroy();if(a.map!==null || !calls.includes('destroy'))throw Error('NAVER 해제');
  return true;
};
window.p3SwitchOnly = () => {providerSetMode('satellite');providerSetMode('normal');};
