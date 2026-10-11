// 15b_map_provider.js — 공식 온라인 지도 어댑터와 좌표 정합 확인, 실패 시 기본 지형 유지
// 수심 계산·자료 요청·단면 상태는 이 파일에서 변경하지 않는다.
class NaverMapAdapter {
  constructor(maps) { this.sdk = maps; this.map = null; this.listeners = []; }
  init(container) {
    const n = this.sdk;
    this.container = container;
    this.imageError = e => { if (e.target?.tagName === 'IMG') this.onFailure?.(); };
    container.addEventListener('error', this.imageError, true);
    this.map = new n.Map(container, { center: new n.LatLng(latOf(V.cy), lonOf(V.cx)), zoom: 10,
      draggable: false, scrollWheel: false, pinchZoom: false, keyboardShortcuts: false,
      disableDoubleClickZoom: true, zoomControl: false, mapDataControl: true, logoControl: true });
  }
  setMode(mode) { this.map.setMapTypeId(this.sdk.MapTypeId[mode === 'satellite' ? 'HYBRID' : 'NORMAL']); }
  syncFromAppViewport() {
    const n = this.sdk;
    this.map.setCenter(new n.LatLng(latOf(V.cy), lonOf(V.cx)));
    // SDK 자체 투영으로 현재 배율을 측정한다. Mercator zoom 공식은 적용하지 않는다.
    const a = this.project(lonOf(V.cx), latOf(V.cy)), b = this.project(lonOf(V.cx + 1000), latOf(V.cy));
    const scale = Math.hypot(b[0] - a[0], b[1] - a[1]) / 1000;
    if (!(scale > 0)) throw Error('지도 좌표 변환 실패');
    const z = Math.max(6, Math.min(21, Math.round(this.map.getZoom() + Math.log2(V.s / scale))));
    this.map.setZoom(z, false); this.zoomTarget = z;
  }
  getBounds() { const b = this.map.getBounds(), sw = b.getSW(), ne = b.getNE(); return [[sw.lng(), sw.lat()], [ne.lng(), ne.lat()]]; }
  getCenter() { const c = this.map.getCenter(); return [c.lng(), c.lat()]; }
  getZoom() { return this.map.getZoom(); }
  // 정합 기준은 별도 세계 좌표 경로. 앱 toS/toM이나 project를 호출하지 않는다.
  referenceProject(lon, lat) { const p = this.map.getProjection(), w = p.fromCoordToPoint(new this.sdk.LatLng(lat, lon)), o = p.fromPointToOffset(w); return [o.x, o.y]; }
  setCenter(lon, lat) { this.map.setCenter(new this.sdk.LatLng(lat, lon)); }
  moveAnchor(ll, x, y) {
    for (let i = 0; i < 3; i++) { const p = this.project(...ll), c = this.unproject(cw / 2 + p[0] - x, ch / 2 + p[1] - y); this.setCenter(...c); }
  }
  zoomAt(x, y, factor) {
    const ll = this.unproject(x, y);
    this.zoomTarget = Math.max(6, Math.min(21, (this.zoomTarget ?? this.getZoom()) + Math.log2(factor)));
    this.map.setZoom(Math.round(this.zoomTarget), false); this.moveAnchor(ll, x, y);
  }
  project(lon, lat) { const p = this.map.getProjection().fromCoordToOffset(new this.sdk.LatLng(lat, lon)); return [p.x, p.y]; }
  unproject(x, y) { const p = this.map.getProjection().fromOffsetToCoord(new this.sdk.Point(x, y)); return [p.lng(), p.lat()]; }
  resize() { this.map.setSize(new this.sdk.Size(cw, ch)); }
  onViewportReady(fn) { this.listeners.push(this.sdk.Event.addListener(this.map, 'idle', fn)); }
  onTilesLoaded(fn) { this.listeners.push(this.sdk.Event.addListener(this.map, 'tilesloaded', fn)); }
  destroy() { for (const l of this.listeners) this.sdk.Event.removeListener(l); this.listeners = []; this.container?.removeEventListener('error', this.imageError, true); this.map?.destroy(); this.map = null; }
}

const PROVIDER_MAP = { adapter: null, active: false, failed: false, started: false, mode: 'normal',
  signature: '', loaded: false, timer: null, alignment: null, checking: false, syncing: false, diagnostic: null };
try { if (localStorage.getItem('naksigwang-map-mode') === 'satellite') PROVIDER_MAP.mode = 'satellite'; } catch (_) { /* 저장 제한 시 기본값 */ }

function providerNotice(text) { $('providerNotice').textContent = text; }
function providerFallback() {
  PROVIDER_MAP.failed = true; PROVIDER_MAP.active = false; clearTimeout(PROVIDER_MAP.timer);
  $('providerMap').style.visibility = 'hidden'; dirty = true;
  stage.classList.remove('provider-active');
  providerNotice('온라인 지도를 불러오지 못해 기본 지형지도로 표시합니다.');
}
function providerTransform() { return !!PROVIDER_MAP.adapter && !PROVIDER_MAP.failed && (PROVIDER_MAP.active || PROVIDER_MAP.checking); }
function providerReadView() {
  const a = PROVIDER_MAP.adapter, c = a.getCenter(), p = a.project(...c), q = a.project(lonOf(mxOf(c[0]) + 100), c[1]);
  const scale = Math.hypot(q[0] - p[0], q[1] - p[1]) / 100;
  if (!(scale > 0) || !Number.isFinite(scale)) throw Error('지도 배율 변환 실패');
  V.cx = mxOf(c[0]); V.cy = myOf(c[1]); V.s = scale;
  PROVIDER_MAP.signature = [V.cx, V.cy, V.s, cw, ch].join(',');
  dirty = true; dirtyHover = true; VIEW_T = performance.now();
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
// 로컬 개발에서만 공개. credential이나 SDK 객체는 반환하지 않는다.
if (['localhost','127.0.0.1','[::1]'].includes(location.hostname)) window.naksigwangMapDiagnostic = () => structuredClone(PROVIDER_MAP.diagnostic);
function providerCheck() {
  const p = PROVIDER_MAP;
  if (!p.adapter || p.failed || !p.loaded || p.syncing) return;
  try {
    clearTimeout(p.timer);
    p.checking = true; p.alignment = providerAlignment(p.adapter); p.checking = false; p.active = p.alignment <= 2;
    $('providerMap').style.visibility = p.active ? 'visible' : 'hidden'; dirty = true;
    stage.classList.toggle('provider-active', p.active);
    providerNotice(p.active ? (p.mode === 'satellite' ? 'NAVER 위성지도 · 수심은 별도 공공자료와 추정값입니다.' : 'NAVER 일반지도 · 수심은 별도 공공자료와 추정값입니다.')
      : '온라인 지도와 분석 표시의 위치를 맞추지 못해 기본 지형지도로 표시합니다.');
  } catch (_) { p.checking = false; providerFallback(); }
}
function providerSync() {
  const p = PROVIDER_MAP;
  if (!p.adapter || p.failed || p.syncing) return;
  const key = [V.cx, V.cy, V.s, cw, ch].join(',');
  if (key === p.signature) return;
  p.active = false; p.syncing = true; $('providerMap').style.visibility = 'hidden'; stage.classList.remove('provider-active'); dirty = true;
  clearTimeout(p.timer); p.timer = setTimeout(providerFallback, 12000);
  try { p.adapter.resize(); p.adapter.syncFromAppViewport(); providerReadView(); }
  catch (_) { providerFallback(); }
  finally { p.syncing = false; }
  // 캐시된 타일은 tilesloaded가 다시 오지 않을 수 있다. 이미 준비된 지도는 즉시 재검사한다.
  providerCheck();
}
function providerZoomAt(x, y, factor) {
  try { PROVIDER_MAP.adapter.zoomAt(x,y,factor); providerReadView(); providerCheck(); }
  catch (_) { providerFallback(); }
}
function providerPanAnchor(ll, x, y) {
  try { PROVIDER_MAP.adapter.moveAnchor(ll,x,y); providerReadView(); providerCheck(); }
  catch (_) { providerFallback(); }
}
function scheduleDisplayDepthArea() {
  if (!PROVIDER_MAP.active) { scheduleDepthArea(); return; }
  clearTimeout(OFFICIAL_DEPTH.timer);
  OFFICIAL_DEPTH.timer = setTimeout(async () => {
    // SDK bounds와 화면 네 변을 함께 포함한다. 두 대각점만으로 비선형 투영을 자르지 않는다.
    const b = viewBounds(), areas = [[lonOf(b[0]),latOf(b[1]),lonOf(b[2]),latOf(b[3])]];
    if (S.A && S.B) areas.push([Math.min(lonOf(S.A[0]),lonOf(S.B[0])),Math.min(latOf(S.A[1]),latOf(S.B[1])),Math.max(lonOf(S.A[0]),lonOf(S.B[0])),Math.max(latOf(S.A[1]),latOf(S.B[1]))]);
    if (await depthPrepareAreas(areas)) { dirty = true; dirtyHover = true; analyzeSection(); }
  },250);
}
function providerSetMode(mode) {
  const p = PROVIDER_MAP; p.mode = mode === 'satellite' ? 'satellite' : 'normal';
  try { localStorage.setItem('naksigwang-map-mode', p.mode); } catch (_) { /* 저장 제한 */ }
  for (const b of $('providerModes').children) b.setAttribute('aria-pressed', b.dataset.providerMode === p.mode);
  if (p.adapter && !p.failed) {
    // 같은 지도 인스턴스의 배경만 바꾼다. dirty/단면/수심 로더를 건드리지 않는다.
    p.loaded = false; clearTimeout(p.timer); p.timer = setTimeout(providerFallback, 12000);
    try { p.adapter.setMode(p.mode); } catch (_) { providerFallback(); }
  }
}
async function providerStart() {
  const p = PROVIDER_MAP; if (p.started) return; p.started = true;
  providerSetMode(p.mode);
  // 배포 또는 로컬에서 별도로 제공하는 공개 브라우저 설정. 저장소에는 credential을 넣지 않는다.
  let key = document.querySelector('meta[name="naver-map-key-id"]')?.content.trim();
  try { key ||= localStorage.getItem('naksigwang-naver-key-id')?.trim(); } catch (_) { /* 로컬 설정 제한 */ }
  if (!key) { providerNotice('온라인 지도 설정 전 · 기본 지형지도로 표시합니다.'); return; }
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script'); const timer = setTimeout(() => { script.remove(); reject(Error('SDK timeout')); }, 12000);
      const finish = fn => { clearTimeout(timer); script.onload = script.onerror = null; fn(); };
      window.navermap_authFailure = () => { finish(() => reject(Error('SDK 인증 실패'))); providerFallback(); };
      window.naksigwangProviderReady = () => finish(resolve);
      script.onerror = () => finish(() => reject(Error('SDK 로드 실패')));
      script.src = 'https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=' + encodeURIComponent(key) + '&callback=naksigwangProviderReady';
      document.head.append(script);
    });
    if (p.failed) return;
    p.adapter = new NaverMapAdapter(window.naver.maps); p.adapter.init($('providerMap'));
    p.adapter.onFailure = providerFallback;
    addEventListener('offline', providerFallback, { once: true });
    p.adapter.onTilesLoaded(() => { if (p.failed) return; p.loaded = true; clearTimeout(p.timer); providerCheck(); });
    p.adapter.onViewportReady(() => {
      if (p.failed || p.syncing) return;
      if ([V.cx,V.cy,V.s,cw,ch].join(',') !== p.signature) { providerSync(); return; }
      try { providerReadView(); providerCheck(); } catch (_) { providerFallback(); }
    });
    p.adapter.setMode(p.mode); providerSync();
  } catch (_) { providerFallback(); }
}
