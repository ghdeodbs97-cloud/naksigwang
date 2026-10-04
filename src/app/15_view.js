// 15_view.js — 지도 표시 보조, 좌표 변환, 화면 보기 상태
/* ── 항·갯바위 아이콘: 기기의 그림 문자(⚓, 🪨)로 그린다 ──
   그림 문자가 없는 기기(오래된 Windows 등)는 직접 그린 모양으로 대신한다. 크기별로 한 번 그려 두고 복사해 쓴다. */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const ICON_CH = { port: '⚓', rock: '🪨' }, ICON_OK = {}, ICON_C = new Map();
function hasEmoji(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d', { willReadFrequently: true });
  g.font = `24px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 16, 17);
  const d = g.getImageData(0, 0, 32, 32).data; let n = 0, colored = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { n++; if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 25) colored++; }
  return n > 30 && colored > 8;                              // 빈 네모(글꼴 없음)는 색이 없다
}
function iconSprite(kind, size) {
  const r = DPR(), key = kind + size + '@' + r; if (ICON_C.has(key)) return ICON_C.get(key);
  if (!(kind in ICON_OK)) ICON_OK[kind] = hasEmoji(ICON_CH[kind]);
  const px = Math.ceil(size * 1.3 * r), c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d'), m = px / 2;
  if (kind === 'port') { g.fillStyle = 'rgba(236,247,249,.95)'; g.strokeStyle = 'rgba(6,19,29,.9)'; g.lineWidth = r; g.beginPath(); g.arc(m, m, size * r * .56, 0, 7); g.fill(); g.stroke(); }   // 밝은 원판: 파란 바다 위에서도 닻이 보이게
  if (ICON_OK[kind]) { const fs = kind === 'port' ? size * .78 : size; g.font = `${fs * r}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ICON_CH[kind], m, m + fs * r * .06); }
  else if (kind === 'port') {                               // 닻 모양
    const s = size * r / 2 * .8; g.strokeStyle = '#1d5c74'; g.lineWidth = Math.max(1.5, s / 4); g.lineCap = 'round';
    g.beginPath(); g.arc(m, m - s * .65, s * .22, 0, 7); g.moveTo(m, m - s * .43); g.lineTo(m, m + s * .8); g.moveTo(m - s * .45, m - s * .2); g.lineTo(m + s * .45, m - s * .2);
    g.moveTo(m - s * .75, m + s * .2); g.quadraticCurveTo(m - s * .6, m + s * .85, m, m + s * .8); g.quadraticCurveTo(m + s * .6, m + s * .85, m + s * .75, m + s * .2); g.stroke();
  } else {                                                   // 바위 모양
    const s = size * r / 2; g.fillStyle = '#9aa3a6'; g.strokeStyle = '#4c5558'; g.lineWidth = Math.max(1, s / 6);
    g.beginPath(); g.moveTo(m - s * .9, m + s * .6); g.lineTo(m - s * .6, m - s * .2); g.lineTo(m - s * .1, m - s * .7); g.lineTo(m + s * .5, m - s * .45); g.lineTo(m + s * .9, m + s * .6); g.closePath(); g.fill(); g.stroke();
  }
  const o = { c, w: px / r }; ICON_C.set(key, o); return o;
}
function drawIcon(g, kind, x, y, size, alpha = 1) {
  const o = iconSprite(kind, size); g.globalAlpha = alpha; g.drawImage(o.c, x - o.w / 2, y - o.w / 2, o.w, o.w); g.globalAlpha = 1;
}

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
    const sel = i === S.pt, rock = st.kind === 'rock';
    // 축척에 따라 보여 줄 것을 줄인다: 넓게 볼수록 큰 항만, 확대할수록 작은 항·갯바위까지
    //   전국(1 px > 600 m): 국가어항만 · 지방(250~600 m): 지방어항까지 + 차로 가는 갯바위 · 해역(80~250 m): 정주어항까지 + 갯바위 전부 · 가까이: 전부
    if (!sel) {
      const pr = rock ? 9 : portPri(st.type);
      if (gpp > 600 ? rock || pr > 0 : gpp > 250 ? (rock ? st.access !== 'car' : pr > 1) : gpp > 80 ? (!rock && pr > 2) : false) continue;
    }
    const size = sel ? 24 : gpp > 600 ? 11 : gpp > 250 ? 13 : gpp > 80 ? 15 : 18;
    if (sel) { bctx.fillStyle = 'rgba(79,227,211,.25)'; bctx.strokeStyle = '#4fe3d3'; bctx.lineWidth = 2; bctx.beginPath(); bctx.arc(x, y, size * .72, 0, 7); bctx.fill(); bctx.stroke(); }
    // 갯바위 접근: 차량·도보는 진하게, 확인 필요는 조금 흐리게, 배로만은 흐리게
    drawIcon(bctx, rock ? 'rock' : 'port', x, y, size, rock ? (st.access === 'car' ? 1 : st.access === 'unk' ? .8 : .5) : 1);
    const r = size / 2;
    stHits.push([x, y, i]);
    bctx.font = (sel ? '700 12.5px' : '600 11.5px') + ' IBM Plex Sans KR, sans-serif';
    const w = bctx.measureText(st.name).width, box = [x + r + 2, y - 9, x + r + 6 + w, y + 9];
    if (!sel && (gpp > 700 || placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3])))) continue;
    placed.push(box);
    bctx.lineWidth = 3; bctx.strokeStyle = 'rgba(6,15,19,.9)'; bctx.strokeText(st.name, x + r + 4, y);
    bctx.fillStyle = st.kind === 'rock' ? (sel ? '#f0a35e' : '#f6d2b0') : sel ? '#4fe3d3' : '#c9f6f0'; bctx.fillText(st.name, x + r + 4, y);
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
// 지도 범위 = 지형 자료(GEBCO) 범위. 이보다 넓게 축소하거나 밖으로 밀면 자료 없는 검은 곳이 보이므로 막는다
const KB = { x1: mxOf(124.4), x2: mxOf(131.95), y1: myOf(32.9), y2: myOf(38.7) };
let VIEW_T = 0;      // 마지막으로 지도를 옮기거나 확대·축소한 시각 (조류 입자를 잠깐 숨기는 데 씀)
function clampView() {
  if (!cw || !ch) return;
  VIEW_T = performance.now();
  const sMin = Math.max(cw / (KB.x2 - KB.x1), ch / (KB.y2 - KB.y1));   // 화면이 자료 범위 안에 들어가는 가장 작은 배율
  if (V.s < sMin) V.s = sMin;
  const gw = cw / pxPerGround();
  if (gw < 150) V.s *= gw / 150;
  const hx = cw / 2 / V.s, hy = ch / 2 / V.s;                          // 화면 가장자리가 범위 밖으로 나가지 않게
  V.cx = clamp(V.cx, KB.x1 + hx, KB.x2 - hx); V.cy = clamp(V.cy, KB.y1 + hy, KB.y2 - hy);
  dirty = true;
}
function fitBox(x1, y1, x2, y2, pad = .9) { V.cx = (x1 + x2) / 2; V.cy = (y1 + y2) / 2; V.s = Math.min(cw / Math.max(1, x2 - x1), ch / Math.max(1, y2 - y1)) * pad; clampView(); }
function fitLonLat(bb) { fitBox(mxOf(bb[0]), myOf(bb[1]), mxOf(bb[2]), myOf(bb[3])); }
function fitGround(lat, lon, widthG) { if (S.lock) widthG = TD_MAP_W; /* 오늘 탭 지도는 늘 같은 폭 */ V.cx = mxOf(lon); V.cy = myOf(lat); V.s = cw / (widthG * kAt(lat)); clampView(); }
function zoomAt(px, py, f) { const [mx, my] = toM(px, py); V.s *= f; clampView(); const [nx, ny] = toM(px, py); V.cx += mx - nx; V.cy += my - ny; clampView(); }

/* ── 바탕 그리기 ───────────────────────────────────────── */
const BANDS = [[10, '#64e6d4'], [30, '#43ccc3'], [50, '#2fb0b4'], [100, '#2194a5'], [150, '#1b8097'], [200, '#176e88'], [300, '#135d77'], [500, '#104e68'], [1000, '#0d405a'], [2000, '#0b344b'], [5000, '#0a2a3e'], [10000, '#082233'], [20000, '#071b2a']];
const FAR = '#06141f';
