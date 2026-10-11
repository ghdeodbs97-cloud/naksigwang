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
    this.map.setZoom(z, false);
  }
  getBounds() { return this.map.getBounds(); }
  project(lon, lat) { const p = this.map.getProjection().fromCoordToOffset(new this.sdk.LatLng(lat, lon)); return [p.x, p.y]; }
  unproject(x, y) { const p = this.map.getProjection().fromOffsetToCoord(new this.sdk.Point(x, y)); return [p.lng(), p.lat()]; }
  resize() { this.map.setSize(new this.sdk.Size(cw, ch)); }
  onTilesLoaded(fn) { this.listeners.push(this.sdk.Event.addListener(this.map, 'tilesloaded', fn)); }
  destroy() { for (const l of this.listeners) this.sdk.Event.removeListener(l); this.listeners = []; this.container?.removeEventListener('error', this.imageError, true); this.map?.destroy(); this.map = null; }
}

const PROVIDER_MAP = { adapter: null, active: false, failed: false, started: false, mode: 'normal',
  signature: '', loaded: false, timer: null, alignment: null };
try { if (localStorage.getItem('naksigwang-map-mode') === 'satellite') PROVIDER_MAP.mode = 'satellite'; } catch (_) { /* 저장 제한 시 기본값 */ }

function providerNotice(text) { $('providerNotice').textContent = text; }
function providerFallback() {
  PROVIDER_MAP.failed = true; PROVIDER_MAP.active = false; clearTimeout(PROVIDER_MAP.timer);
  $('providerMap').style.visibility = 'hidden'; dirty = true;
  stage.classList.remove('provider-active');
  providerNotice('온라인 지도를 불러오지 못해 기본 지형지도로 표시합니다.');
}
function providerAlignment(adapter) {
  // 화면 중앙·모서리·변 중점 9곳을 CSS pixel로 비교한다. 실영상 기준점 검사는 별도로 필요하다.
  let max = 0;
  for (const x of [0, cw / 2, cw]) for (const y of [0, ch / 2, ch]) {
    const [mx, my] = toM(x, y), p = adapter.project(lonOf(mx), latOf(my));
    const error = Math.hypot(p[0] - x, p[1] - y);
    if (!Number.isFinite(error)) throw Error('지도 좌표 변환 실패');
    max = Math.max(max, error);
  }
  return max;
}
function providerCheck() {
  const p = PROVIDER_MAP;
  if (!p.adapter || p.failed || !p.loaded) return;
  try {
    p.alignment = providerAlignment(p.adapter); p.active = p.alignment <= 2;
    $('providerMap').style.visibility = p.active ? 'visible' : 'hidden'; dirty = true;
    stage.classList.toggle('provider-active', p.active);
    providerNotice(p.active ? (p.mode === 'satellite' ? 'NAVER 위성지도 · 수심은 별도 공공자료와 추정값입니다.' : 'NAVER 일반지도 · 수심은 별도 공공자료와 추정값입니다.')
      : '온라인 지도와 분석 표시의 위치를 맞추지 못해 기본 지형지도로 표시합니다.');
  } catch (_) { providerFallback(); }
}
function providerSync() {
  const p = PROVIDER_MAP;
  if (!p.adapter || p.failed) return;
  const key = [V.cx, V.cy, V.s, cw, ch].join(',');
  if (key === p.signature) return;
  p.signature = key; p.active = false; p.loaded = false; $('providerMap').style.visibility = 'hidden';
  stage.classList.remove('provider-active'); dirty = true;
  clearTimeout(p.timer); p.timer = setTimeout(providerFallback, 12000);
  try { p.adapter.resize(); p.adapter.syncFromAppViewport(); } catch (_) { providerFallback(); }
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
    p.adapter.setMode(p.mode); providerSync();
  } catch (_) { providerFallback(); }
}
