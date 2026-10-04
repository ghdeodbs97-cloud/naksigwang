// 13_forecast.js — 포인트 목록, 바람·파고·수온, 날짜 선택, 조석 곡선
/* ── 계기판 (관측소·날짜·조석 곡선) ─────────────────── */
const tc = $('tideChart'), tcx = tc.getContext('2d');
/* ── 선택 포인트: 항·포구를 5 km 간격으로 골라 가장 가까운 관측소 조석과 연결 ─ */
let POINTS = [];
const gdist = (a, b) => Math.hypot((a.lat - b.lat) * 111.0, (a.lon - b.lon) * 111.0 * Math.cos(a.lat * D2R));   // km
/* ── 풍향·풍속·파고: 기상청 단기예보 5 km 격자 (항·포구·갯바위가 있는 격자만 수집) ──
   포인트의 격자에 자료가 없으면 2칸(약 10 km) 안의 가장 가까운 격자를 쓰고 그 사실을 표시한다. */
function kmaGrid(lat, lon) {   // 기상청 람베르트 정각원추도법 격자 (활용가이드의 변환식)
  const RE = 6371.00877 / 5, s1 = 30 * D2R, s2 = 60 * D2R, ol = 126 * D2R, oa = 38 * D2R;
  const sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(Math.tan(Math.PI / 4 + s2 / 2) / Math.tan(Math.PI / 4 + s1 / 2));
  const sf = Math.tan(Math.PI / 4 + s1 / 2) ** sn * Math.cos(s1) / sn, ro = RE * sf / Math.tan(Math.PI / 4 + oa / 2) ** sn;
  const ra = RE * sf / Math.tan(Math.PI / 4 + lat * D2R / 2) ** sn; let th = lon * D2R - ol;
  if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
  return [Math.floor(ra * Math.sin(th) + 43 + .5), Math.floor(ro - ra * Math.cos(th) + 136 + .5)];
}
const WX_CELL = new Map();
function wxCell(lat, lon) {
  const [x, y] = kmaGrid(lat, lon), key = x + ',' + y; if (WX_CELL.has(key)) return WX_CELL.get(key);
  let r = WXG.cells[key] ? { c: WXG.cells[key], near: 0 } : null;
  if (!r) { let bd = 4.5; for (const k in WXG.cells) { const [a, b] = k.split(',').map(Number), d = (a - x) ** 2 + (b - y) ** 2; if (d <= bd) { bd = d; r = { c: WXG.cells[k], near: Math.round(Math.sqrt(d) * 5) }; } } }
  WX_CELL.set(key, r); return r;
}
function wxAt(st, day, h, pt) {
  const p = pt || st, r = wxCell(p.lat, p.lon); if (!r) return null;
  const date = dateAdd(DAY0, day).replace(/-/g, '');
  for (let hh = Math.floor(h); hh >= Math.max(0, Math.floor(h) - 2); hh--) {   // 4일째부터는 3시간 간격
    const v = r.c[date + String(hh).padStart(2, '0')];
    if (v) return { dir: v[0] == null ? '—' : dirName(v[0]), deg: v[0], sp: v[1], wave: v[2], slot: hh, from: `기상청 ${+WXG.base.slice(6, 8)}일 ${WXG.base.slice(8, 10)}시 발표`, near: r.near > 0, km: r.near };
  }
  return null;
}
/* ── 바다 수온: 국립해양조사원 조위관측소 실측 (50 km 안, 수집 시각 기준 24시간 안의 값만) ── */
const SST_C = new Map();
function sstFor(st) {
  if (SST_C.has(st.id)) return SST_C.get(st.id);
  const t0 = new Date(META.generated); let r = null, bd = 50;
  for (const o of Object.values(OBS)) {
    if (!o.sst || !(o.sst[0] > 1 && o.sst[0] < 33)) continue; const age = (t0 - new Date(o.sst[1].replace(' ', 'T') + ':00+09:00')) / 36e5; if (age > 24) continue;
    const d = gdist(st, o); if (d < bd) { bd = d; r = [o.sst[0], o.sst[1].slice(5).replace('-', '/'), o.name, Math.round(d)]; }
  }
  SST_C.set(st.id, r); return r;
}
function buildPoints() {
  setTimeout(fillNameList, 0);
  const cand = PORTS.slice().sort((a, b) => portPri(a.type) - portPri(b.type) || a.name.localeCompare(b.name, 'ko'));
  const kept = [];
  for (const p of cand) if (!inBan(p.lat, p.lon) && !kept.some(q => gdist(p, q) < 5)) kept.push(p);
  POINTS = kept.map(p => {
    let bi = 0, bd = Infinity; STATIONS.forEach((st, i) => { const d = gdist(p, st); if (d < bd) { bd = d; bi = i; } });
    p.isPt = true;
    return { name: p.name, type: p.type, lat: p.lat, lon: p.lon, mx: p.mx, my: p.my, st: bi, dkm: bd, region: STATIONS[bi].region };
  });
  for (const p of PORTS) if (!kept.includes(p)) p.isPt = false;
  for (const r of ROCKS) {
    if ((r.access === 'boat' && !S.showBoat) || r.banned) continue;
    let bi = 0, bd = Infinity; STATIONS.forEach((st, i) => { const d = gdist(r, st); if (d < bd) { bd = d; bi = i; } });
    POINTS.push({ ...r, st: bi, dkm: bd, region: STATIONS[bi].region });
  }
  const order = ['동해', '남해', '서해', '제주'];
  const grp = (r, rock) => POINTS.map((p, i) => ({ p, i })).filter(o => o.p.region === r && (o.p.kind === 'rock') === rock).sort((a, b) => b.p.lat - a.p.lat);
  $('stSel').innerHTML = order.map(r => `<optgroup label="항·포구 · ${r}">` + grp(r, false).map(o => `<option value="${o.i}">${o.p.name}</option>`).join('') + '</optgroup>').join('')
    + order.map(r => { const g = grp(r, true); return g.length ? `<optgroup label="갯바위 · ${r}">` + g.map(o => `<option value="${o.i}">${o.p.name}${o.p.access === 'unk' ? ' (접근 확인 필요)' : o.p.access === 'boat' ? ' (배로만)' : ''}</option>`).join('') + '</optgroup>' : ''; }).join('');
}
function selectPoint(j, zoom) {
  S.pt = j; const p = POINTS[j];
  S.st = p.st; const st = STATIONS[p.st];
  S.range = (st.maxCm - st.minCm) / 100;
  $('stSel').value = String(j);
  $('stName').textContent = p.name;
  $('stReg').textContent = (p.kind === 'rock' ? '갯바위 · ' + ACC_NAME[p.access] + ' · ' : '') + `조석: ${st.name} 예보지점 기준 · ${p.dkm < 1 ? '1 km 이내' : p.dkm.toFixed(0) + ' km'}`;
  $('ptInfo').innerHTML = p.kind === 'rock' ? rockInfoHTML(p) : '';
  if (zoom) fitGround(p.lat, p.lon, 9000);
  if (S.lock) { fitGround(p.lat, p.lon, TD_MAP_W); exampleSection(p.lon, p.lat); }   // 오늘 탭 지도: 새 포인트로 옮기고 앞바다 단면
  $('kakaoLink').href = `https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  dirty = true; renderDays(); renderBite();
}
function renderDays() {
  const st = STATIONS[S.st];
  const html = st.days.slice(0, NDAYS).map((d, i) => {
    const [, m, dd] = d.date.split('-'), wd = '일월화수목금토'[new Date(d.date + 'T12:00:00+09:00').getDay()];
    return `<button type="button" role="tab" aria-selected="${i === S.day}" data-day="${i}"><span class="dd">${+m}/${+dd} ${wd}</span><span class="mm">${d.mul}</span>${i === TODAY_IDX ? '<i>오늘</i>' : ''}</button>`;
  }).join('');
  for (const id of ['dayStrip', 'biteDays']) $(id).innerHTML = html;
  const d = st.days[S.day];
  $('dayEvents').innerHTML = d.ev.map(([h, cm, k]) => `<span class="ev ${k}">${k === 'H' ? '만조' : '간조'} <b>${fmtH(h)}</b> ${cm}cm</span>`).join('') + `<span class="ev">음력 ${d.lunar}</span>`;
}
function setDay(i) { S.day = i; renderDays(); renderBite(); }
function drawTideChart(tide) {
  const r = DPR(), w = tc.clientWidth, h = 130; if (tc.width !== Math.round(w * r)) { tc.width = Math.round(w * r); tc.height = Math.round(h * r); }
  tcx.setTransform(r, 0, 0, r, 0, 0); tcx.clearRect(0, 0, w, h);
  const st = STATIONS[S.st], ml = 34, mr = 8, mt = 14, mb = 18, lo = st.minCm - 10, hi = st.maxCm + 10;
  const X = t => ml + t / 24 * (w - ml - mr), Y = cm => mt + (hi - cm) / (hi - lo) * (h - mt - mb);
  const [sr, ss] = sunTimes(st.lat, st.lon, S.day);
  tcx.fillStyle = 'rgba(4,9,12,.6)'; tcx.fillRect(X(0), mt, X(sr) - X(0), h - mt - mb); tcx.fillRect(X(ss), mt, X(24) - X(ss), h - mt - mb);
  tcx.font = '400 9.5px JetBrains Mono, monospace'; tcx.fillStyle = '#7a9ea6'; tcx.textBaseline = 'top';
  for (let t = 0; t <= 24; t += 6) { tcx.fillText(String(t).padStart(2, '0'), X(t) - 6, h - mb + 4); tcx.fillStyle = 'rgba(120,220,230,.08)'; tcx.fillRect(X(t), mt, 1, h - mt - mb); tcx.fillStyle = '#7a9ea6'; }
  tcx.textBaseline = 'middle'; tcx.fillText(Math.round(hi - 10) + '', 2, Y(hi - 10)); tcx.fillText(Math.round(lo + 10) + '', 2, Y(lo + 10));
  tcx.beginPath(); for (let i = 0; i <= 240; i++) { const t = i / 10, c = tideAt(st, S.day * 24 + t).cm; i ? tcx.lineTo(X(t), Y(c)) : tcx.moveTo(X(t), Y(c)); }
  tcx.lineTo(X(24), h - mb); tcx.lineTo(X(0), h - mb); tcx.closePath();
  const g = tcx.createLinearGradient(0, mt, 0, h - mb); g.addColorStop(0, 'rgba(79,227,211,.45)'); g.addColorStop(1, 'rgba(79,227,211,.03)'); tcx.fillStyle = g; tcx.fill();
  tcx.beginPath(); for (let i = 0; i <= 240; i++) { const t = i / 10, c = tideAt(st, S.day * 24 + t).cm; i ? tcx.lineTo(X(t), Y(c)) : tcx.moveTo(X(t), Y(c)); } tcx.strokeStyle = '#4fe3d3'; tcx.lineWidth = 1.6; tcx.stroke();
  tcx.font = '600 9.5px JetBrains Mono, monospace';
  for (const [hh, cm, k] of st.days[S.day].ev) { const x = X(hh), y = Y(cm); tcx.fillStyle = k === 'H' ? '#ffb84d' : '#9ec9cf'; tcx.beginPath(); tcx.arc(x, y, 3, 0, 7); tcx.fill(); tcx.textBaseline = k === 'H' ? 'bottom' : 'top'; tcx.fillText(fmtH(hh), clamp(x - 14, ml, w - mr - 30), k === 'H' ? y - 4 : y + 4); }
  const x = X(S.t); tcx.strokeStyle = '#fff'; tcx.lineWidth = 1; tcx.beginPath(); tcx.moveTo(x, mt); tcx.lineTo(x, h - mb); tcx.stroke();
  tcx.fillStyle = '#fff'; tcx.beginPath(); tcx.arc(x, Y(tide.cm), 4, 0, 7); tcx.fill();
}
tc.addEventListener('pointerdown', e => { const set = ev => { const b = tc.getBoundingClientRect(); S.t = clamp((ev.clientX - b.left - 34) / (b.width - 42) * 24, 0, 23.99); $('tIn').value = S.t; }; tc.setPointerCapture(e.pointerId); set(e); tc.onpointermove = ev => { if (tc.hasPointerCapture(ev.pointerId)) set(ev); }; });
