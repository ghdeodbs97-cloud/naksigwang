// p3_provider_checks.js — 실제 API 없이 지도 어댑터·상태 보존 검사
window.p3Ready = () => !!GE;
window.p3SizeCheck = () => ch===Math.round(cw<560?clamp(innerHeight-290,320,cw*1.3):Math.min(cw*.72,Math.max(380,innerHeight-240)));
class FakeMapAdapter {
  init(container) { this.container = container; this.instances = 1; this.modes = []; this.error = 0; }
  setMode(mode) { this.modes.push(mode); this.loaded?.(); }
  syncFromAppViewport() { this.viewport = {...V}; this.loaded?.(); }
  resize() { this.size = [cw, ch]; }
  project(lon, lat) { const p = toS(mxOf(lon), myOf(lat)); return [p[0] + this.error, p[1]]; }
  unproject(x, y) { const p = toM(x, y); return [lonOf(p[0]), latOf(p[1])]; }
  getBounds() { return [this.unproject(0, ch), this.unproject(cw, 0)]; }
  onTilesLoaded(fn) { this.loaded = fn; }
  destroy() { this.destroyed = true; }
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
  V.cx+=100/V.s;clampView();providerSync();check(fake.viewport.cx===V.cx,'화면 이동 동기화');
  zoomAt(cw/2,ch/2,1.8);providerSync();check(fake.viewport.s===V.s,'확대 동기화');
  resize();check(fake.size[0]===cw && fake.size[1]===ch,'크기 일치');
  check(base.width===Math.round(cw*DPR()) && base.height===Math.round(ch*DPR()),'DPR 크기');
  const errors=[];
  for(const [name,lon,lat] of [['속초',128.6,38.2],['주문진',128.83,37.89],['묵호',129.12,37.55],['포항',129.38,36.05]]) {
    for(const width of [1500,9000,60000]) {fitGround(lat,lon,width);providerSync();errors.push({name,width,error:providerAlignment(fake)});}
  }
  fake.error=3;providerCheck();check(!PROVIDER_MAP.active,'2px 초과 차단');
  fake.error=0;providerCheck();check(PROVIDER_MAP.active,'정합 복구');
  const saved=state();providerFallback();check(!PROVIDER_MAP.active && PROVIDER_MAP.failed,'실패 fallback');
  check(state()===saved && $('providerNotice').textContent.includes('기본 지형'),'실패 후 분석 보존');
  fake.destroy();check(fake.destroyed,'해제');
  PROVIDER_MAP.adapter=null;
  return {errors,dpr:DPR(),checks:15};
};

window.p3AdapterUnit = () => {
  const calls=[];let instances=0;
  class LL {constructor(lat,lon){this.latitude=lat;this.longitude=lon;}lat(){return this.latitude;}lng(){return this.longitude;}}
  class XY {constructor(x,y){this.x=x;this.y=y;}}
  const sdk={LatLng:LL,Point:XY,Size:XY,MapTypeId:{NORMAL:'N',HYBRID:'H'},Event:{addListener:()=>1,removeListener:l=>calls.push(['remove',l])},Map:class {
    constructor(c,o){instances++;this.z=o.zoom;}
    setMapTypeId(m){calls.push(m);}setCenter(c){calls.push('center');}
    setZoom(z){this.z=z;}getZoom(){return this.z;}setSize(s){calls.push('size');}
    getBounds(){return 'bounds';}destroy(){calls.push('destroy');}
    getProjection(){return {fromCoordToOffset:c=>new XY(c.lng()*100,c.lat()*100),fromOffsetToCoord:p=>new LL(p.y/100,p.x/100)};}
  }};
  const a=new NaverMapAdapter(sdk);a.init($('providerMap'));a.setMode('normal');a.setMode('satellite');
  a.resize();a.syncFromAppViewport();a.onTilesLoaded(()=>{});
  const p=a.project(129,37),ll=a.unproject(...p);
  if(instances!==1 || calls[0]!=='N' || calls[1]!=='H' || ll[0]!==129 || ll[1]!==37 || a.getBounds()!=='bounds')throw Error('NAVER 어댑터 계약');
  a.destroy();if(a.map!==null || !calls.includes('destroy'))throw Error('NAVER 해제');
  return true;
};
window.p3SwitchOnly = () => {providerSetMode('satellite');providerSetMode('normal');};
