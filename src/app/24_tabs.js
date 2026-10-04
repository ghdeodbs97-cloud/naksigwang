// 24_tabs.js — 아래(휴대폰)·위(넓은 화면) 탭 전환. 주소 끝 #today · #map · #tide · #bite · #log 로 바로 열 수 있다
const TABS = ['today', 'map', 'tide', 'bite', 'log'];
let TAB = 'today';
// 오늘 탭의 작은 지도: 지도 탭의 같은 지도(캔버스)를 오늘 탭으로 옮겨 와 쓴다. 선택 포인트로 고정(이동·확대 안 됨), 조류와 단면선 긋기는 됨
const TD_MAP_W = 1500;   // 오늘 탭 지도의 보이는 폭 (m)
const secPanel = $('secWrap').closest('section'), STAGE_HOME = [stage.parentNode, stage.nextSibling], SEC_HOME = [secPanel.parentNode, secPanel.nextSibling];
let mapView = null;      // 지도 탭에서 보던 위치 (오늘 탭에 다녀와도 그대로)
function placeMap(today) {
  const inToday = stage.parentNode === $('tdMapSlot'); if (today === inToday) return;
  if (today) { mapView = { cx: V.cx, cy: V.cy, s: V.s }; $('tdMapSlot').append(stage, secPanel); S.lock = true; setMode('line'); }
  else { STAGE_HOME[0].insertBefore(stage, STAGE_HOME[1]); SEC_HOME[0].insertBefore(secPanel, SEC_HOME[1]); S.lock = false; if (matchMedia('(pointer: coarse)').matches) setMode('pan'); }
  resize();
  if (today) { const p = POINTS[S.pt]; if (p) { fitGround(p.lat, p.lon, TD_MAP_W); exampleSection(p.lon, p.lat); } }
  else if (mapView) { V.cx = mapView.cx; V.cy = mapView.cy; V.s = mapView.s; clampView(); }
  dirty = true;
}
function showTab(k, keepHash, focusPt) {
  if (!TABS.includes(k)) k = 'today';
  TAB = k;
  if (k === 'today' || k === 'map') placeMap(k === 'today');
  for (const t of TABS) $('v-' + t).hidden = t !== k;
  for (const b of $('tabbar').children) b.setAttribute('aria-current', b.dataset.tab === k ? 'page' : 'false');
  if (!keepHash && location.hash !== '#' + k) history.replaceState(null, '', '#' + k);
  if (k === 'map') requestAnimationFrame(() => { if (stage.clientWidth !== cw) resize(); const p = POINTS[S.pt]; if (focusPt && p) fitGround(p.lat, p.lon, 9000); dirty = true; });
  if (k === 'today') requestAnimationFrame(drawToday);
  scrollTo(0, 0);
}
$('tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) showTab(b.dataset.go, false, b.dataset.go === 'map'); });
if (matchMedia('(pointer: coarse)').matches) setMode('pan');   // 손가락으로 쓰는 기기는 처음에 「지도 이동」
addEventListener('hashchange', () => showTab(location.hash.slice(1), true));
addEventListener('resize', () => { if (TAB === 'today') drawToday(); });
new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', document.querySelector('.top').offsetHeight + 'px')).observe(document.querySelector('.top'));
showTab(location.hash.slice(1) || 'today', true);
