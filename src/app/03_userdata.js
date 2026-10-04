// 03_userdata.js — 내 자료: 항·포구 목록, CSV 읽기
/* ── 내 자료: 항·포구 목록, 수심 기록 (CSV) ────────────── */
const PORTS = [];
async function readText(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch (e) { return new TextDecoder('euc-kr').decode(buf); }   // 공공데이터포털 CSV는 대개 EUC-KR
}
function parseCSV(t) {
  const first = t.split(/\r?\n/, 1)[0] || '';
  const delim = (first.split('\t').length > first.split(',').length) ? '\t' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const findCol = (H, tests) => { for (const t of tests) { const i = H.findIndex(h => t.test(h)); if (i >= 0) return i; } return -1; };
const num = v => { const x = parseFloat(String(v).replace(/[^\d.\-]/g, '')); return isFinite(x) ? x : NaN; };
function locate(H, rows) {
  let la = findCol(H, [/위도/, /^lat(itude)?$/i, /lat/i]), lo = findCol(H, [/경도/, /^(lon|lng|long|longitude)$/i, /lon|lng/i]);
  let wkt = -1, xc = -1, yc = -1;
  if (la < 0 || lo < 0) {
    const r = rows[1] || []; wkt = r.findIndex(v => /POINT\s*\(/i.test(v));
    if (wkt < 0) { xc = findCol(H, [/^x$/i, /x좌표|좌표x|x_?coord/i, /^경도?x/i]); yc = findCol(H, [/^y$/i, /y좌표|좌표y|y_?coord/i]); }
  }
  return { la, lo, wkt, xc, yc };
}
function parseDeg(v) {
  v = String(v || '').trim(); if (!v) return NaN;
  if (/^-?\d+(\.\d+)?$/.test(v)) return +v;
  const ns = v.match(/\d+(?:\.\d+)?/g); if (!ns) return NaN;
  const sign = /^-|[SW]\s*$/i.test(v) ? -1 : 1;
  if (ns.length >= 3) return sign * (+ns[0] + ns[1] / 60 + ns[2] / 3600);
  if (ns.length === 2) return sign * (+ns[0] + ns[1] / 60);
  return sign * +ns[0];
}
function getLL(r, L) {
  let lat, lon;
  if (L.wkt >= 0) { const m = /POINT\s*\(\s*([-\d.]+)[\s,]+([-\d.]+)/i.exec(r[L.wkt] || ''); if (!m) return null; lon = +m[1]; lat = +m[2]; }
  else if (L.xc >= 0 && L.yc >= 0) { lon = num(r[L.xc]); lat = num(r[L.yc]); }
  else { lat = parseDeg(r[L.la]); lon = parseDeg(r[L.lo]); }
  if (lat > 1000 || lon > 1000) {   // 평면직각좌표: 경도열=X, 위도열=Y 로 먼저 시도
    const inKR = q => q[0] >= 32 && q[0] <= 39.5 && q[1] >= 123.5 && q[1] <= 132.5;
    let q = tmToLL(lon, lat); if (!inKR(q)) { const q2 = tmToLL(lat, lon); if (inKR(q2)) q = q2; }
    L.crs = q[2]; lat = q[0]; lon = q[1];
  }
  if (lat > 90 && lon < 90) [lat, lon] = [lon, lat];
  if (!(lat >= 32 && lat <= 39.5 && lon >= 123.5 && lon <= 132.5)) return null;
  return [lat, lon];
}
function importPorts(rows) {
  const H = rows[0].map(h => h.trim()), L = locate(H, rows);
  if (L.wkt < 0 && (L.la < 0 || L.lo < 0) && (L.xc < 0 || L.yc < 0)) return { ok: 0, msg: '위도·경도 열을 찾지 못했습니다. 머리글: ' + H.slice(0, 12).join(', ') };
  const nm = findCol(H, [/명칭/, /어항명|항명|항구명|포구명/, /^name$/i, /name/i, /명$/]);
  const ty = findCol(H, [/종류/, /구분/, /등급/, /type/i]);
  if (nm < 0) return { ok: 0, msg: '항 이름 열을 찾지 못했습니다. 머리글: ' + H.slice(0, 12).join(', ') };
  let ok = 0, bad = 0;
  for (const r of rows.slice(1)) {
    const ll = getLL(r, L); const name = (r[nm] || '').trim();
    if (!ll || !name) { bad++; continue; }
    PORTS.push({ name, type: ty >= 0 ? (r[ty] || '').trim() : '', lat: ll[0], lon: ll[1], mx: mxOf(ll[1]), my: myOf(ll[0]) });
    ok++;
  }
  const first = PORTS[PORTS.length - ok];
  const cols = `인식한 열: 이름=${H[nm]}` + (L.wkt >= 0 ? `, 좌표=${H[L.wkt]}` : L.xc >= 0 ? `, X=${H[L.xc]}, Y=${H[L.yc]}` : `, 위도=${H[L.la]}, 경도=${H[L.lo]}`) + (L.crs ? ` (${L.crs} 평면좌표를 변환)` : '');
  return { ok, bad, msg: ok ? `항·포구 ${ok.toLocaleString()}곳을 불러왔습니다` + (bad ? ` (좌표 없음·범위 밖 ${bad}건 제외)` : '') + `. ${cols}. 첫 항목: ${first.name} ${first.lat.toFixed(4)}, ${first.lon.toFixed(4)}. 지도 폭 약 100 km 이하로 확대하면 이름이 나타납니다.`
    : `불러온 항목이 없습니다. ${cols}. 첫 줄 값: ${(rows[1] || []).slice(0, 8).join(' | ')}` };
}
const portPri = t => /국가/.test(t) ? 0 : /지방|충남|^어항$/.test(t) ? 1 : /정주/.test(t) ? 2 : /소규모|포구/.test(t) ? 3 : 2;
function saveLocal() { try { localStorage.setItem('ps_ports', JSON.stringify(PORTS.map(p => [p.name, p.type, p.lat, p.lon]))); } catch (e) {} }
function loadLocal() {
  const seen = new Set();
  const add = (name, type, lat, lon) => { const k = name + '|' + lat.toFixed(4) + '|' + lon.toFixed(4); if (seen.has(k)) return; seen.add(k); PORTS.push({ name, type, lat, lon, mx: mxOf(lon), my: myOf(lat) }); };
  for (const [name, type, lat, lon] of BASE_PORTS) add(name, type, lat, lon);
  try { const a = JSON.parse(localStorage.getItem('ps_ports') || '[]'); for (const [name, type, lat, lon] of a) add(name, type, lat, lon); } catch (e) {}
}
async function handleFile(file, kind) {
  const msgEl = $('dataMsg');
  try {
    const text = await readText(file), isJSON = /\.(geo)?json$/i.test(file.name) || /^\s*[\[{]/.test(text);
    let res;
    if (kind === 'struct') {
      if (!isJSON) { msgEl.textContent = file.name + ': 구조물은 GeoJSON 파일만 받습니다.'; return; }
      res = importStructJSON(JSON.parse(text)); if (res.ok) saveDepth();
    } else if (isJSON) {
      res = importDepthJSON(JSON.parse(text), $('depthType').value); kind = 'depth'; if (res.ok) saveDepth();
    } else {
      const rows = parseCSV(text);
      if (rows.length < 2) { msgEl.textContent = file.name + ': 내용이 비어 있습니다.'; return; }
      if (!kind || kind === 'port') kind = findCol(rows[0], [/포인트명/]) >= 0 ? 'rock' : kind;
      if (!kind) kind = findCol(rows[0], DEPTH_KEYS) >= 0 ? 'depth' : 'port';
      res = kind === 'depth' ? importDepthRows(rows, $('depthType').value) : kind === 'rock' ? importRocks(rows) : importPorts(rows);
      if (res.ok) kind === 'depth' ? saveDepth() : kind === 'rock' ? saveRocks() : saveLocal();
    }
    msgEl.textContent = file.name + ': ' + res.msg;
    if (res.ok) { dirty = true; analyzeSection(); updateDataCount(); if (kind === 'port' || kind === 'rock') { const nm = POINTS[S.pt] && POINTS[S.pt].name; buildPoints(); selectPoint(Math.max(0, POINTS.findIndex(p => p.name === nm)), false); } }
  } catch (e) { msgEl.textContent = file.name + ': 읽지 못했습니다 (' + e.message + ')'; }
}
function updateDataCount() {
  const parts = DORDER.filter(t => LAYERS[t] && LAYERS[t].n).map(t => `${DTYPES[t].short} ${LAYERS[t].n.toLocaleString()}`);
  $('dataCount').textContent = `항·포구 ${PORTS.length.toLocaleString()}곳 · 수심 ${parts.length ? parts.join(' · ') + '점' : '없음'}` + (STRUCT.n - STRUCT.nb ? ` · 내 구조물 ${STRUCT.n - STRUCT.nb}` : '') + (ROCKS.length ? ` · 갯바위 ${ROCKS.length.toLocaleString()}곳` : '');
  $('clearData').hidden = !(totalPts() || STRUCT.n - STRUCT.nb || PORTS.length > BASE_PORTS.length || ROCKS.length > (typeof BASE_ROCKS !== 'undefined' ? BASE_ROCKS.length : 0));
}
function clearData() {
  PORTS.length = 0; ROCKS.length = 0; clearLayers(); BADA.tiles.clear();
  { const L = STRUCT.lines.filter(r => r.base), Pp = STRUCT.polys.filter(r => r.base); STRUCT.lines = []; STRUCT.polys = []; STRUCT.seg = []; STRUCT.idx = new Map(); STRUCT.n = 0; STRUCT.nb = 0;
    const pts = r => Array.from({ length: r.n }, (_, i) => [r.xs[i], r.ys[i]]); L.forEach(r => addStructLine(pts(r), false, true)); Pp.forEach(r => addStructLine(pts(r), true, true)); }
  try { localStorage.removeItem('ps_ports'); localStorage.removeItem('ps_rocks'); localStorage.removeItem('ps_depth2'); localStorage.removeItem('ps_struct'); localStorage.removeItem('ps_sound'); } catch (e) {}
  loadLocal(); loadRocks(); { const nm = POINTS[S.pt] && POINTS[S.pt].name; buildPoints(); selectPoint(Math.max(0, POINTS.findIndex(p => p.name === nm)), false); }
  $('dataMsg').textContent = '불러온 자료를 지웠습니다 (기본 항·포구는 남아 있습니다).'; dirty = true; analyzeSection(); updateDataCount();
}

function drawPortsAndSoundings(gpp) {
  // 수심 자료점 (확대했을 때만)
  if (totalPts() && gpp < 25) {
    const [x1, y2] = toM(0, 0), [x2, y1] = toM(cw, ch), used = new Set(); let drawn = 0;
    bctx.font = '600 9.5px JetBrains Mono, monospace'; bctx.textBaseline = 'middle';
    for (const t of DORDER.slice().reverse()) {
      const Lr = LAYERS[t]; if (!Lr || !Lr.n) continue;
      const gx1 = Math.floor(x1 / Lr.cell), gx2 = Math.floor(x2 / Lr.cell), gy1 = Math.floor(y1 / Lr.cell), gy2 = Math.floor(y2 / Lr.cell);
      if ((gx2 - gx1 + 1) * (gy2 - gy1 + 1) > 400000) continue;
      const sz = t === 'bada' ? 5 : 3.5;
      for (let gx = gx1; gx <= gx2 && drawn < 30000; gx++) for (let gy = gy1; gy <= gy2; gy++) {
        const a = Lr.idx.get(gx * 1000000 + gy); if (!a) continue;
        for (const i of a) {
          const [x, y] = toS(Lr.mx[i], Lr.my[i]); if (x < -5 || y < -5 || x > cw + 5 || y > ch + 5) continue;
          const tt = clamp(Lr.d[i] / 40, 0, 1);
          bctx.fillStyle = `hsl(${185 - tt * 25},${80 - tt * 30}%,${72 - tt * 42}%)`;
          if (t === 'bada') { bctx.strokeStyle = DTYPES.bada.color; bctx.lineWidth = 1; bctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz); } else bctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
          drawn++;
          if (gpp < 2.5) { const key = Math.floor(x / 34) + ',' + Math.floor(y / 15); if (!used.has(key)) { used.add(key); bctx.fillStyle = '#e8fbf8'; bctx.fillText(t === 'survey' ? Lr.d[i].toFixed(1) : String(Math.round(Lr.d[i])), x + 4, y); } }
        }
      }
    }
  }
  // 항 이름 (겹치지 않게, 큰 항부터)
  if (!PORTS.length || !S.layers.port) return;
  if (gpp > 120) {   // 넓게 볼 때는 위치 점만
    bctx.fillStyle = 'rgba(255,208,138,.8)';
    for (const p of PORTS) { const [x, y] = toS(p.mx, p.my); if (x > 0 && y > 0 && x < cw && y < ch) bctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    return;
  }
  const maxPri = gpp > 60 ? 1 : gpp > 25 ? 2 : 3;
  const vis = PORTS.filter(p => !p.isPt && portPri(p.type) <= maxPri).map(p => { const [x, y] = toS(p.mx, p.my); return { p, x, y, pr: portPri(p.type) }; })
    .filter(o => o.x > -40 && o.y > -20 && o.x < cw + 40 && o.y < ch + 20).sort((a, b) => a.pr - b.pr);
  const placed = []; bctx.textBaseline = 'middle';
  for (const o of vis.slice(0, 3000)) {
    const big = o.pr <= 1; bctx.font = (big ? '700 12px' : '500 11px') + ' IBM Plex Sans KR, sans-serif';
    const w = bctx.measureText(o.p.name).width, box = [o.x - 6, o.y - 8, o.x + 9 + w, o.y + 8];
    if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box);
    drawIcon(bctx, 'port', o.x, o.y, big ? 15 : 13);   // 포인트 목록에 없는 항·포구 (5 km 안에 다른 포인트가 있는 곳)
    bctx.lineWidth = 3; bctx.strokeStyle = 'rgba(6,15,19,.9)'; bctx.strokeText(o.p.name, o.x + 10, o.y);
    bctx.fillStyle = big ? '#ffe2b0' : '#e7eef0'; bctx.fillText(o.p.name, o.x + 10, o.y);
  }
}
