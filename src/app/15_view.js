// 15_view.js — 지도 표시 보조, 좌표 변환, 화면 보기 상태
/* ── 지도 위 관측소 표시 ─────────────────────────────── */
let stHits = [];
function drawStations() {
  stHits = []; const placed = [];
  bctx.textBaseline = 'middle';
  const gpp = 1 / pxPerGround();
  const order = POINTS.map((p, i) => i).sort((a, b) => (a === S.pt ? -1 : b === S.pt ? 1 : portPri(POINTS[a].type) - portPri(POINTS[b].type)));
  for (const i of order) {
    const st = POINTS[i], [x, y] = toS(st.mx, st.my); if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
    if (i !== S.pt && !S.layers[st.kind === 'rock' ? 'rock' : 'port']) continue;
    const sel = i === S.pt, r = sel ? 7 : gpp > 400 ? 3.5 : 5;
    bctx.fillStyle = sel ? '#4fe3d3' : '#06131d'; bctx.strokeStyle = '#4fe3d3'; bctx.lineWidth = 2;
    if (st.kind === 'rock') {
      const rc = st.access === 'car' ? '#f0a35e' : st.access === 'unk' ? '#a9b7b9' : '#6c7d80';
      bctx.fillStyle = sel ? rc : '#06131d'; bctx.strokeStyle = rc;
      bctx.beginPath(); bctx.moveTo(x, y - r - 1); bctx.lineTo(x + r, y + r * .8); bctx.lineTo(x - r, y + r * .8); bctx.closePath(); bctx.fill(); bctx.stroke();
    } else { bctx.beginPath(); bctx.moveTo(x, y - r); bctx.lineTo(x + r, y); bctx.lineTo(x, y + r); bctx.lineTo(x - r, y); bctx.closePath(); bctx.fill(); bctx.stroke(); }
    stHits.push([x, y, i]);
    bctx.font = (sel ? '700 12.5px' : '600 11.5px') + ' IBM Plex Sans KR, sans-serif';
    const w = bctx.measureText(st.name).width, box = [x + 9, y - 9, x + 13 + w, y + 9];
    if (!sel && (gpp > 700 || placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3])))) continue;
    placed.push(box);
    bctx.lineWidth = 3; bctx.strokeStyle = 'rgba(6,15,19,.9)'; bctx.strokeText(st.name, x + 11, y);
    bctx.fillStyle = st.kind === 'rock' ? (sel ? '#f0a35e' : '#f6d2b0') : sel ? '#4fe3d3' : '#c9f6f0'; bctx.fillText(st.name, x + 11, y);
  }
}
function stationAt(x, y) { let best = null, bd = 14; for (const [sx, sy, i] of stHits) { const d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = i; } } return best; }

/* ── 평면직각좌표(TM) → 경위도 (EPSG:5179, 5186 지원) ─── */
function tmToLL(x, y) {
  const P = y > 1000000 ? { lon0: 127.5, lat0: 38, k0: .9996, fe: 1000000, fn: 2000000, name: 'EPSG:5179' } : { lon0: 127, lat0: 38, k0: 1, fe: 200000, fn: 600000, name: 'EPSG:5186' };
  const a = 6378137, f = 1 / 298.257222101, e2 = 2 * f - f * f, ep2 = e2 / (1 - e2);
  const Mf = ph => a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * ph - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * ph) + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * ph) - (35 * e2 ** 3 / 3072) * Math.sin(6 * ph));
  const M = Mf(P.lat0 * D2R) + (y - P.fn) / P.k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = (x - P.fe) / (N1 * P.k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = P.lon0 * D2R + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lat / D2R, lon / D2R, P.name];
}

/* ── 보기 ──────────────────────────────────────────────── */
const stage = $('stage'), base = $('base'), flow = $('flow'), ui = $('ui');
const bctx = base.getContext('2d'), fctx = flow.getContext('2d'), uctx = ui.getContext('2d');
const mask = document.createElement('canvas'), mctx = mask.getContext('2d', { willReadFrequently: true });
let maskData = null, cw = 0, ch = 0, dirty = true;
const V = { cx: mxOf(128), cy: myOf(36), s: 1e-3 };
const toS = (mx, my) => [(mx - V.cx) * V.s + cw / 2, (V.cy - my) * V.s + ch / 2];
const toM = (px, py) => [V.cx + (px - cw / 2) / V.s, V.cy - (py - ch / 2) / V.s];
const pxPerGround = () => V.s * kAt(latOf(V.cy));
const KB = { x1: mxOf(123.8), x2: mxOf(132.4), y1: myOf(32.6), y2: myOf(39) };
function clampView() {
  const gw = cw / pxPerGround();
  if (gw > 1.1e6) V.s *= gw / 1.1e6;
  if (gw < 150) V.s *= gw / 150;
  V.cx = clamp(V.cx, KB.x1, KB.x2); V.cy = clamp(V.cy, KB.y1, KB.y2);
  dirty = true;
}
function fitBox(x1, y1, x2, y2, pad = .9) { V.cx = (x1 + x2) / 2; V.cy = (y1 + y2) / 2; V.s = Math.min(cw / Math.max(1, x2 - x1), ch / Math.max(1, y2 - y1)) * pad; clampView(); }
function fitLonLat(bb) { fitBox(mxOf(bb[0]), myOf(bb[1]), mxOf(bb[2]), myOf(bb[3])); }
function fitGround(lat, lon, widthG) { V.cx = mxOf(lon); V.cy = myOf(lat); V.s = cw / (widthG * kAt(lat)); clampView(); }
function zoomAt(px, py, f) { const [mx, my] = toM(px, py); V.s *= f; clampView(); const [nx, ny] = toM(px, py); V.cx += mx - nx; V.cy += my - ny; clampView(); }

/* ── 바탕 그리기 ───────────────────────────────────────── */
const BANDS = [[10, '#64e6d4'], [30, '#43ccc3'], [50, '#2fb0b4'], [100, '#2194a5'], [150, '#1b8097'], [200, '#176e88'], [300, '#135d77'], [500, '#104e68'], [1000, '#0d405a'], [2000, '#0b344b'], [5000, '#0a2a3e'], [10000, '#082233'], [20000, '#071b2a']];
const FAR = '#06141f';
