// 24_tabs.js — 아래(휴대폰)·위(넓은 화면) 탭 전환. 주소 끝 #today · #map · #tide · #bite · #log 로 바로 열 수 있다
const TABS = ['today', 'map', 'tide', 'bite', 'log'];
let TAB = 'today';
function showTab(k, keepHash, focusPt) {
  if (!TABS.includes(k)) k = 'today';
  TAB = k;
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
