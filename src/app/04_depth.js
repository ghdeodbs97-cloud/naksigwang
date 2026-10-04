// 04_depth.js — 수심 자료 층과 보간
/* ── 수심 자료 층 ─────────────────────────────────────────
   우선순위: 1 사용자 실측 > 2 연안해역기본도 > 3 전자해도·항만도 > 4 BADA2024 > 5 해안거리 추정
   위 순서대로 찾고, 높은 순위 자료가 반경 안에 있으면 그 자료만으로 보간한다(낮은 순위와 섞지 않음). */
const DTYPES = {
  survey:  { pri: 1, label: '사용자 실측',     short: '실측',   res: 10,  color: '#d6fff9' },
  coastal: { pri: 2, label: '연안해역기본도',  short: '연안',   res: 30,  color: '#7ff3e6' },
  chart:   { pri: 3, label: '전자해도·항만도', short: '해도',   res: 50,  color: '#8fd3ff' },
  bada:    { pri: 4, label: 'BADA2024',        short: 'BADA',   res: 150, color: '#c4b5ff' },
  gebco:   { pri: 5, label: 'GEBCO 2026',      short: 'GEBCO',  res: 460, color: '#e2c48a' },
};
const DORDER = ['survey', 'coastal', 'chart', 'bada'];
const MAX_PTS = 600000;
const LAYERS = {};
function layerOf(type) {
  if (!LAYERS[type]) LAYERS[type] = { type, n: 0, mx: [], my: [], d: [], res: [], src: [], yr: [], idx: new Map(), cell: Math.max(60, DTYPES[type].res * 2.5), resMax: 0 };
  return LAYERS[type];
}
const totalPts = () => DORDER.reduce((s, t) => s + (LAYERS[t] ? LAYERS[t].n : 0), 0);
function addDepthPt(type, mx, my, d, res, src, yr) {
  if (totalPts() >= MAX_PTS) return false;
  const L = layerOf(type), i = L.n++;
  L.mx.push(mx); L.my.push(my); L.d.push(d); L.res.push(res); L.src.push(src || ''); L.yr.push(yr || '');
  if (res > L.resMax) L.resMax = res;
  const k = Math.floor(mx / L.cell) * 1000000 + Math.floor(my / L.cell); let a = L.idx.get(k); if (!a) L.idx.set(k, a = []); a.push(i);
  return true;
}
function clearLayers() { for (const t of DORDER) delete LAYERS[t]; }

// 화면 안에서 두 점 사이에 육지·구조물이 끼어 있는지 (화면 밖은 판단하지 않음)
function crossesLand(mx1, my1, mx2, my2) {
  for (let s = 1; s <= 4; s++) {
    const f = s / 5, [x, y] = toS(mx1 + (mx2 - mx1) * f, my1 + (my2 - my1) * f);
    if (x < 0 || y < 0 || x >= cw || y >= ch) continue;
    if (!isSea(x | 0, y | 0)) return true;
  }
  return false;
}
const searchRadius = (type, L) => type === 'bada' ? 1.5 * Math.max(150, L.resMax) : Math.max(20, 2 * Math.max(DTYPES[type].res, L.resMax));
function depthQuery(mx, my) {
  const k = kAt(latOf(my));
  for (const type of DORDER) {
    const L = LAYERS[type]; if (!L || !L.n) continue;
    const R = searchRadius(type, L), r = R * k, c = Math.ceil(r / L.cell), gx = Math.floor(mx / L.cell), gy = Math.floor(my / L.cell);
    const cand = [];
    for (let dx = -c; dx <= c; dx++) for (let dy = -c; dy <= c; dy++) {
      const a = L.idx.get((gx + dx) * 1000000 + gy + dy); if (!a) continue;
      for (const i of a) { const d = Math.hypot(L.mx[i] - mx, L.my[i] - my); if (d <= r) cand.push([d, i]); }
    }
    if (!cand.length) continue;
    cand.sort((a, b) => a[0] - b[0]);
    const use = [];
    for (const [d, i] of cand) { if (use.length >= 6) break; if (d > 2 * k && crossesLand(mx, my, L.mx[i], L.my[i])) continue; use.push([d, i]); }
    if (!use.length) continue;
    const [d0, i0] = use[0], resN = L.res[i0], distG = d0 / k;
    let depth;
    if (distG < .5) depth = L.d[i0];
    else { let ws = 0, vs = 0; for (const [d, i] of use) { const w = 1 / (d * d); ws += w; vs += w * L.d[i]; } depth = vs / ws; }
    const interp = distG > resN;
    const conf = type === 'bada' ? (distG <= 150 ? '중간' : '낮음') : type === 'chart' ? '중간' : (interp ? '중간' : '높음');
    return { depth, type, label: DTYPES[type].label, res: resN, dist: distG, n: use.length, conf, interp, src: L.src[i0], yr: L.yr[i0] };
  }
  return null;
}
// 공식 수심 자료가 없을 때: 해안 150 m 안은 경사 추정, 800 m 밖은 GEBCO, 그 사이는 거리에 따라 섞는다
function modelDepth(mx, my, dG) {
  const est = estimateAt(dG); if (!GE || !isFinite(dG)) return est;
  const e = gebcoAt(latOf(my), lonOf(mx)); if (e == null) return est;
  const w = Math.max(0, Math.min(1, (dG - 150) / 650)), g = -e;
  if (w === 0 || (g < 1 && w < 1)) return est;   // 해안 가까이에서 GEBCO 칸이 육지로 잡힌 경우는 추정만 사용
  return { depth: w * Math.max(.5, g) + (1 - w) * est.depth, type: 'gebco', label: 'GEBCO 2026', res: 460, dist: null, conf: '낮음', interp: true, mix: w < 1 };
}
function estimateAt(dG) { return { depth: depthAt(dG), type: 'est', label: '해안거리 기반 추정', res: null, dist: null, conf: '낮음', interp: true }; }
function fmtDepth(r) {
  if (!r) return '—';
  if (r.type === 'survey') return (r.interp ? '약 ' : '') + r.depth.toFixed(1) + ' m';
  if ((r.type === 'coastal' || r.type === 'chart') && r.res <= 10 && !r.interp) return r.depth.toFixed(1) + ' m';
  return '약 ' + Math.round(r.depth) + ' m';
}
function describeDepth(r) {
  if (!r) return '';
  if (r.type === 'est') return `추정 수심 ${fmtDepth(r)} · 출처: 해안거리 기반 추정 · 신뢰도: 낮음`;
  if (r.type === 'gebco') return `수심 ${fmtDepth(r)} · 출처: GEBCO 2026 (약 460 m 격자${r.mix ? ', 해안 가까이는 경사 추정과 혼합' : ''}) · 신뢰도: 낮음 · 수중여·턱 표현 불가`;
  let s = `수심 ${fmtDepth(r)} · 출처: ${r.label}${r.src ? ' (' + r.src + ')' : ''} · 신뢰도: ${r.conf} · 최근 자료점 ${Math.round(r.dist)} m · ${r.type === 'bada' ? '격자' : '자료'} 해상도 약 ${r.res} m`;
  if (r.type === 'bada') s += ' · 세부 수중여·턱 표현 불가';
  return s;
}
