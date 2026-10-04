// 01_geo.js — 좌표계(웹 메르카토르)와 해안선 디코딩·육지 판정
/* ── 좌표계: 웹 메르카토르 (m) ─────────────────────────── */
const R = 6378137, D2R = Math.PI / 180;
const mxOf = lon => R * lon * D2R;
const myOf = lat => R * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2));
const lonOf = mx => mx / R / D2R;
const latOf = my => (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) / D2R;
const kAt = lat => 1 / Math.cos(lat * D2R);       // 메르카토르 축척계수

/* ── 해안선 데이터 디코딩 ──────────────────────────────── */
function decode(list) {
  return list.map(fl => {
    const n = fl.length / 2, xs = new Float64Array(n), ys = new Float64Array(n);
    let x = 0, y = 0, minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < n; i++) {
      x += fl[2 * i]; y += fl[2 * i + 1];
      const X = mxOf(124 + x / 1e5), Y = myOf(32.9 + y / 1e5);
      xs[i] = X; ys[i] = Y;
      if (X < minx) minx = X; if (X > maxx) maxx = X; if (Y < miny) miny = Y; if (Y > maxy) maxy = Y;
    }
    return { xs, ys, n, minx, maxx, miny, maxy };
  });
}
const LOD = { full: decode(KR_COAST.full), mid: decode(KR_COAST.mid), low: decode(KR_COAST.low) };

// 가까운 해안선 검색용 격자 색인
const CS = 1000, segIdx = new Map(), BAND = 500, bandIdx = new Map(); let SEG, SEG_RING;
(() => {
  const tmp = [], tr = [];
  LOD.full.forEach((r, ri) => { for (let i = 0; i < r.n - 1; i++) {
    const x1 = r.xs[i], y1 = r.ys[i], x2 = r.xs[i + 1], y2 = r.ys[i + 1], id = tmp.length / 4;
    tmp.push(x1, y1, x2, y2); tr.push(ri);
    const gx1 = Math.floor(Math.min(x1, x2) / CS), gx2 = Math.floor(Math.max(x1, x2) / CS);
    const gy1 = Math.floor(Math.min(y1, y2) / CS), gy2 = Math.floor(Math.max(y1, y2) / CS);
    for (let gx = gx1; gx <= gx2; gx++) for (let gy = gy1; gy <= gy2; gy++) { const k = gx * 100000 + gy; let a = segIdx.get(k); if (!a) segIdx.set(k, a = []); a.push(id); }
    for (let b = Math.floor(Math.min(y1, y2) / BAND); b <= Math.floor(Math.max(y1, y2) / BAND); b++) { let a = bandIdx.get(b); if (!a) bandIdx.set(b, a = []); a.push(id); }
  } });
  SEG = Float64Array.from(tmp); SEG_RING = Int32Array.from(tr);
})();
function segDist(px, py, i) {
  const x1 = SEG[4 * i], y1 = SEG[4 * i + 1], x2 = SEG[4 * i + 2], y2 = SEG[4 * i + 3];
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
  let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
}
function nearestCoast(mx, my, maxR) {   // 반환: 메르카토르 m (못 찾으면 Infinity)
  const gx = Math.floor(mx / CS), gy = Math.floor(my / CS), maxRing = Math.ceil(maxR / CS);
  let best = Infinity;
  for (let r = 0; r <= maxRing; r++) {
    if ((r - 1) * CS > best) break;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const a = segIdx.get((gx + dx) * 100000 + gy + dy); if (!a) continue;
      for (const i of a) { const d = segDist(mx, my, i); if (d < best) best = d; }
    }
  }
  return best <= maxR ? best : Infinity;
}
function inLand(mx, my) {   // 같은 높이 띠의 해안선 선분만 세는 반직선 교차 판정 (짝홀 규칙)
  let c = false; const a = bandIdx.get(Math.floor(my / BAND));
  if (a) for (const i of a) {
    const x1 = SEG[4 * i], y1 = SEG[4 * i + 1], x2 = SEG[4 * i + 2], y2 = SEG[4 * i + 3];
    if ((y1 > my) !== (y2 > my) && mx < (x2 - x1) * (my - y1) / (y2 - y1) + x1) c = !c;
  }
  return c || (STRUCT.n > 0 && inStruct(mx, my));
}
const groundToCoast = (mx, my, maxG = 8000) => { const k = kAt(latOf(my)); const d = Math.min(nearestCoast(mx, my, maxG * k), structDist(mx, my, Math.min(maxG, 3000) * k)); return d / k; };
