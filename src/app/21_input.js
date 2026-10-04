// 21_input.js — 화면 크기, 마우스·터치·버튼 입력, 이름 검색
/* ── 크기 ──────────────────────────────────────────────── */
function resize() {
  if (!stage.clientWidth) return;                     // 지도 탭이 숨어 있으면 크기를 바꾸지 않음
  const r = DPR(), old = cw ? toM(cw / 2, ch / 2) : null, oldGW = cw ? cw / pxPerGround() : 0;
  cw = stage.clientWidth;                               // 휴대폰: 화면 높이에 맞춰 길게, 넓은 화면: 가로 비율 0.72 (화면 높이 안에서)
  ch = Math.round(S.lock ? cw * (cw < 560 ? .85 : .5) : cw < 560 ? clamp(innerHeight - 290, 320, cw * 1.3) : Math.min(cw * .72, Math.max(380, innerHeight - 240)));   // 오늘 탭에서는 낮게
  stage.style.height = ch + 'px';
  for (const c of [base, flow, ui]) { c.width = Math.round(cw * r); c.height = Math.round(ch * r); c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
  mask.width = Math.ceil(cw / 2); mask.height = Math.ceil(ch / 2);
  sw = $('secWrap').clientWidth; shh = sw < 560 ? 240 : 300;
  sec.width = Math.round(sw * r); sec.height = Math.round(shh * r); sec.style.height = shh + 'px';
  if (old) { V.cx = old[0]; V.cy = old[1]; V.s = cw / (oldGW * kAt(latOf(V.cy))); clampView(); }
  dirty = true;
}

/* ── 입력 ──────────────────────────────────────────────── */
const ptrs = new Map(); let pinch = null, panStart = null;
const local = e => { const b = ui.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
ui.addEventListener('pointerdown', e => {
  ui.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e));
  if (ptrs.size === 2 && S.lock) { S.drag = null; return; }   // 오늘 탭 지도: 두 손가락 확대 안 함
  if (ptrs.size === 2) { S.drag = null; panStart = null; const [p, q] = [...ptrs.values()]; pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]), c: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] }; return; }
  const [x, y] = local(e);
  if (S.mode === 'pan' || e.pointerType === 'touch' && S.mode === 'pan') { panStart = { x, y, cx: V.cx, cy: V.cy }; ui.style.cursor = 'grabbing'; return; }
  const m = toM(x, y); S.drag = { A: m, B: m };
});
ui.addEventListener('pointermove', e => {
  const [x, y] = local(e);
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [x, y]);
  if (pinch && ptrs.size === 2) {
    const [p, q] = [...ptrs.values()], d = Math.hypot(p[0] - q[0], p[1] - q[1]), c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    zoomAt(c[0], c[1], d / pinch.d); V.cx -= (c[0] - pinch.c[0]) / V.s; V.cy += (c[1] - pinch.c[1]) / V.s; clampView(); pinch = { d, c }; return;
  }
  if (panStart) { V.cx = panStart.cx - (x - panStart.x) / V.s; V.cy = panStart.cy + (y - panStart.y) / V.s; clampView(); return; }
  if (S.drag) { S.drag.B = toM(x, y); return; }
  hoverAt = [x, y];
});
function endPtr(e) {
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; return; }
  if (panStart) {
    const [x, y] = local(e), moved = Math.hypot(x - panStart.x, y - panStart.y); panStart = null; ui.style.cursor = '';
    if (moved < 6) { const i = stationAt(x, y); if (i != null) selectPoint(i, cw / pxPerGround() > 60000); }
    return;
  }
  if (S.drag) {
    const [ax, ay] = toS(...S.drag.A), [bx, by] = toS(...S.drag.B);
    if (Math.hypot(bx - ax, by - ay) > 12) { S.A = S.drag.A; S.B = S.drag.B; analyzeSection(); }
    else { const i = stationAt(ax, ay); if (i != null) selectPoint(i, cw / pxPerGround() > 60000); }
    S.drag = null;
  }
}
ui.addEventListener('pointerup', endPtr); ui.addEventListener('pointercancel', endPtr);
ui.addEventListener('pointerleave', () => { hoverAt = null; setText('cursorRead', '커서를 지도 위에 올리면 좌표와 해안까지 거리가 나옵니다'); });
ui.addEventListener('wheel', e => { if (S.lock) return; e.preventDefault(); const [x, y] = local(e); zoomAt(x, y, Math.exp(-e.deltaY * .0016)); }, { passive: false });
let hoverAt = null, hoverDone = null;
function updateHover() {
  if (!hoverAt || (hoverDone && hoverDone[0] === hoverAt[0] && hoverDone[1] === hoverAt[1] && !dirtyHover)) return;
  hoverDone = hoverAt; dirtyHover = false;
  const [mx, my] = toM(...hoverAt), lat = latOf(my), lon = lonOf(mx);
  const land = inLand(mx, my), d = groundToCoast(mx, my, 20000);
  const q = land ? null : (depthQuery(mx, my) || (GE ? modelDepth(mx, my, isFinite(d) ? d : 20000) : isFinite(d) && d < 8000 ? estimateAt(d) : null));
  const el = land && GE ? gebcoAt(lat, lon) : null;
  const of = osmAt(mx, my), ofs = of ? ' · ' + OSM_NAME[of.c] + (of.name ? ` 「${of.name}」` : '') : '';
  setText('cursorRead', lat.toFixed(5) + '°N, ' + lon.toFixed(5) + '°E' + ofs + ' · ' + (land ? '육지·구조물' + (el != null && el > 5 ? ` · 표고 약 ${Math.round(el / 10) * 10} m (GEBCO)` : '') : '바다') + ' · 해안까지 ' + (isFinite(d) ? fmtD(d) : '20 km+'));
  setText('depthRead', q ? describeDepth(q) : '');
}
let dirtyHover = false;

$('zIn').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 1.8));
$('zOut').addEventListener('click', () => zoomAt(cw / 2, ch / 2, 1 / 1.8));
document.querySelectorAll('[data-bb]').forEach(b => b.addEventListener('click', () => fitLonLat(b.dataset.bb.split(',').map(Number))));
function setMode(m) {
  S.mode = m; $('mLine').setAttribute('aria-pressed', m === 'line'); $('mPan').setAttribute('aria-pressed', m === 'pan');
  ui.classList.toggle('pan', m === 'pan');
  $('modeHint').textContent = m === 'pan' ? '드래그해서 지도 이동 · 휠/두 손가락으로 확대' : '드래그해서 단면선 긋기 · 휠/두 손가락으로 확대';
}
$('mLine').addEventListener('click', () => setMode('line'));
$('mPan').addEventListener('click', () => setMode('pan'));
const normName = v => v.replace(/\s+/g, '').replace(/\(.*?\)/g, '').toLowerCase();
function fillNameList() {
  const seen = new Set(), opts = [];
  const add = (n, tag) => { if (!n || seen.has(n)) return; seen.add(n); opts.push(`<option value="${n.replace(/"/g, '&quot;')}">${tag}</option>`); };
  for (const p of POINTS) add(p.name, p.kind === 'rock' ? '갯바위' : p.type || '항');
  for (const p of PORTS) add(p.name, p.type || '항');
  for (const r of ROCKS) if (!r.banned) add(r.name, '갯바위 · ' + (r.area || ''));
  for (const o of OSM.list) if (o.c === 'hn' || o.c === 'dk') add(o.name, o.c === 'dk' ? '방조제' : '항·선착장 (오픈스트리트맵)');
  $('nameList').innerHTML = opts.join('');
}
function findPlace(q) {
  const k = normName(q); if (!k) return null;
  const osmP = OSM.list.filter(o => o.c === 'hn' || o.c === 'dk').map(o => { const mx = o.R[0].xs[0], my = o.R[0].ys[0]; return { p: { name: o.name, mx, my, lat: latOf(my), lon: lonOf(mx) }, pt: false }; });
  const cands = [...POINTS.map((p, i) => ({ p, i, pt: true })), ...ROCKS.filter(r => !r.banned && !POINTS.some(q => q.kind === 'rock' && q.name === r.name && q.lat === r.lat)).map(p => ({ p, pt: false, rock: true })), ...PORTS.map(p => ({ p, pt: false })), ...osmP];
  const score = o => { const n = normName(o.p.name); return n === k ? 0 : n === k + '항' || n === k + '포구' ? 1 : n.startsWith(k) ? 2 : n.includes(k) ? 3 : 9; };
  let best = null, bs = 9;
  for (const o of cands) { const sc = score(o) + (o.pt ? 0 : .5); if (sc < bs) { bs = sc; best = o; } }
  return bs < 9 ? best : null;
}
$('coordForm').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('coordIn').value.trim();
  const n = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (n) {   // 숫자 두 개를 넣으면 예전처럼 좌표로 이동
    let lat = +n[1], lon = +n[2]; if (lat > 90) [lat, lon] = [lon, lat];
    if (lat < 32.5 || lat > 39 || lon < 123.8 || lon > 132.2) { $('coordMsg').textContent = '한국 연안 범위(북위 32.5~39°, 동경 124~132°)를 벗어났습니다.'; return; }
    $('coordMsg').textContent = ''; S.pin = [mxOf(lon), myOf(lat)]; fitGround(lat, lon, 1500); return;
  }
  const f = findPlace(q);
  if (!f) {
    const k = normName(q).replace(/항$/, ''), st = k && STATIONS.find(o => normName(o.name).startsWith(k));
    if (st) {   // 항구 자료에는 없지만 조석 관측소 이름과 같을 때: 관측소 근처(좌표 정밀도 약 0.1°)로 이동
      let j = 0, bd = Infinity; POINTS.forEach((p, i) => { const d = gdist(p, st); if (d < bd) { bd = d; j = i; } });
      selectPoint(j, false); S.pin = null; fitGround(st.lat, st.lon, 12000);
      $('coordMsg').textContent = `'${q}'은(는) 불러온 항구 자료에 없어 ${st.name} 조석 관측소 부근(대략 위치)으로 이동했습니다.`;
      return;
    }
    $('coordMsg').textContent = `'${q}'을(를) 찾지 못했습니다. 불러온 항구·갯바위 자료에 없는 이름입니다.`; return;
  }
  if (f.rock) {   // 배로만 가는 갯바위: '배로만 가는 곳도 보기'를 켜고 그 포인트를 선택
    S.showBoat = true; $('showBoat').checked = true; buildPoints();
    const k = POINTS.findIndex(q => q.kind === 'rock' && q.name === f.p.name && q.lat === f.p.lat); if (k >= 0) { selectPoint(k, false); S.pin = null; fitGround(f.p.lat, f.p.lon, 2500); $('coordMsg').textContent = '배로만 갈 수 있는 갯바위라 "배로만 가는 곳도 보기"를 켰습니다.'; dirty = true; return; }
  }
  let j = f.i;
  if (!f.pt) { let bd = Infinity; POINTS.forEach((p, i) => { const d = gdist(p, f.p); if (d < bd) { bd = d; j = i; } }); }
  selectPoint(j, false);
  S.pin = f.pt ? null : [f.p.mx, f.p.my];
  fitGround(f.p.lat, f.p.lon, 2500);
  $('coordMsg').textContent = f.pt ? '' : `${f.p.name}: 5 km 간격 포인트에 없어 가까운 '${POINTS[j].name}' 기준으로 조석·조과를 보여줍니다.`;
  $('kakaoLink').href = `https://map.kakao.com/link/map/${encodeURIComponent(f.p.name)},${f.p.lat.toFixed(6)},${f.p.lon.toFixed(6)}`;
});
$('toSec').addEventListener('click', () => {
  if (!S.A) return;
  const x1 = Math.min(S.A[0], S.B[0]), x2 = Math.max(S.A[0], S.B[0]), y1 = Math.min(S.A[1], S.B[1]), y2 = Math.max(S.A[1], S.B[1]);
  const k = kAt(latOf((y1 + y2) / 2)), pad = Math.max(150 * k, (x2 - x1) * .25, (y2 - y1) * .25);
  fitBox(x1 - pad, y1 - pad, x2 + pad, y2 + pad, 1);
});
sec.addEventListener('pointermove', e => { const b = sec.getBoundingClientRect(); S.secHover = clamp((e.clientX - b.left - 50) / (b.width - 64), 0, 1); });
sec.addEventListener('pointerleave', () => { S.secHover = null; });

$('tIn').addEventListener('input', e => { S.t = +e.target.value; });
$('tIn2').addEventListener('input', e => { S.t = +e.target.value; });
$('stSel').addEventListener('change', e => selectPoint(+e.target.value, true));
for (const id of ['dayStrip', 'biteDays']) $(id).addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) setDay(+b.dataset.day); });
function renderBasis() {
  const st = STATIONS[S.st];
  $('basisTable').innerHTML = '<tr><th>대상어</th><th>10월 시즌</th><th>동해</th><th>남해</th><th>서해</th><th>제주</th><th>물때 영향</th><th>서식 수온</th><th>지금 수온 보정</th><th>내 기록 보정</th></tr>' + FISH.map(f => { const r = TEMP_PREF[f.n], m = myF(f, st); return `<tr><td>${f.n}</td><td>${f.season}</td>${f.reg.map(v => `<td>${v}</td>`).join('')}<td>${f.cur}</td><td>${r[0]}~${r[1]} ℃${r[2] ? '' : ' (안 씀)'}</td><td>×${tempF(f, st).toFixed(2)}</td><td>${m.n ? `×${m.f.toFixed(2)} (${m.n}회 중 ${m.hit})` : '—'}</td></tr>`; }).join('');
}
renderBasis();
$('play').addEventListener('click', () => { S.playing = !S.playing; $('play').textContent = S.playing ? '정지' : '재생'; });
const bind = (id, key, out, fmt) => $(id).addEventListener('input', e => { S[key] = +e.target.value; $(out).textContent = fmt(S[key]); });
bind('dmaxIn', 'dmax', 'dmaxOut', v => v + ' m');
$('dmaxIn').addEventListener('input', () => { S.autoShore = false; $('autoShore').checked = false; });   // 손으로 바꾸면 자동 끔
$('dmaxIn').addEventListener('change', () => { dirty = true; analyzeSection(); });
$('slopeIn').addEventListener('change', e => { S.autoShore = false; $('autoShore').checked = false; setShore(e.target.value); dirty = true; analyzeSection(); });
$('autoShore').addEventListener('change', e => { S.autoShore = e.target.checked; analyzeSection(); });
$('styleSeg').addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (!b) return; S.mapStyle = b.dataset.style; for (const x of $('styleSeg').children) x.setAttribute('aria-pressed', x === b); dirty = true; });
$('layerSeg').addEventListener('click', e => { const b = e.target.closest('[data-layer]'); if (!b) return; const k = b.dataset.layer; S.layers[k] = !S.layers[k]; b.setAttribute('aria-pressed', S.layers[k]); if (k === 'flow') { fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, flow.width, flow.height); } dirty = true; });
