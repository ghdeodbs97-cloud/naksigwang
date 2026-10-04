// 05_struct.js — 해안 구조물(방파제·부두) 층
/* ── 해안 구조물(방파제·부두 등) 층 ─────────────────── */
const STRUCT = { lines: [], polys: [], seg: [], idx: new Map(), n: 0, nb: 0 };   // nb: 기본 내장(OSM) 구조물 수
const STC = 400;
function addStructSeg(x1, y1, x2, y2) {
  const id = STRUCT.seg.length / 4; STRUCT.seg.push(x1, y1, x2, y2);
  for (let gx = Math.floor(Math.min(x1, x2) / STC); gx <= Math.floor(Math.max(x1, x2) / STC); gx++)
    for (let gy = Math.floor(Math.min(y1, y2) / STC); gy <= Math.floor(Math.max(y1, y2) / STC); gy++) { const k = gx * 100000 + gy; let a = STRUCT.idx.get(k); if (!a) STRUCT.idx.set(k, a = []); a.push(id); }
}
function addStructLine(pts, closed, base) {   // pts: [[mx,my],...]
  if (pts.length < 2) return;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const o = { xs, ys, n: pts.length, minx: Math.min(...xs), maxx: Math.max(...xs), miny: Math.min(...ys), maxy: Math.max(...ys), base: !!base };
  (closed ? STRUCT.polys : STRUCT.lines).push(o); STRUCT.n++; if (base) STRUCT.nb++;
  for (let i = 0; i < pts.length - 1; i++) addStructSeg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  if (closed) addStructSeg(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1]);
}
function structDist(mx, my, maxR) {
  if (!STRUCT.n) return Infinity;
  const gx = Math.floor(mx / STC), gy = Math.floor(my / STC), c = Math.ceil(maxR / STC); let best = Infinity;
  for (let dx = -c; dx <= c; dx++) for (let dy = -c; dy <= c; dy++) {
    const a = STRUCT.idx.get((gx + dx) * 100000 + gy + dy); if (!a) continue;
    for (const i of a) {
      const x1 = STRUCT.seg[4 * i], y1 = STRUCT.seg[4 * i + 1], x2 = STRUCT.seg[4 * i + 2], y2 = STRUCT.seg[4 * i + 3];
      const ddx = x2 - x1, ddy = y2 - y1, L2 = ddx * ddx + ddy * ddy; let t = L2 ? ((mx - x1) * ddx + (my - y1) * ddy) / L2 : 0; t = clamp(t, 0, 1);
      const d = Math.hypot(mx - x1 - t * ddx, my - y1 - t * ddy); if (d < best) best = d;
    }
  }
  return best <= maxR ? best : Infinity;
}
function inStruct(mx, my) {
  const k = kAt(latOf(my));
  if (structDist(mx, my, 6 * k) <= 4 * k) return true;     // 선형 구조물은 폭 약 8 m로 간주
  for (const r of STRUCT.polys) {
    if (mx < r.minx || mx > r.maxx || my < r.miny || my > r.maxy) continue;
    let c = false; for (let i = 0, j = r.n - 1; i < r.n; j = i++) if ((r.ys[i] > my) !== (r.ys[j] > my) && mx < (r.xs[j] - r.xs[i]) * (my - r.ys[i]) / (r.ys[j] - r.ys[i]) + r.xs[i]) c = !c;
    if (c) return true;
  }
  return false;
}
function structPath(margin) {
  const p = new Path2D(), lp = new Path2D();
  const [vx1, vy1] = toM(-margin, ch + margin), [vx2, vy2] = toM(cw + margin, -margin);
  const vis = r => r.maxx >= vx1 && r.minx <= vx2 && r.maxy >= vy1 && r.miny <= vy2;
  for (const r of STRUCT.polys) if (vis(r)) { for (let i = 0; i < r.n; i++) { const [x, y] = toS(r.xs[i], r.ys[i]); i ? p.lineTo(x, y) : p.moveTo(x, y); } p.closePath(); }
  for (const r of STRUCT.lines) if (vis(r)) { for (let i = 0; i < r.n; i++) { const [x, y] = toS(r.xs[i], r.ys[i]); i ? lp.lineTo(x, y) : lp.moveTo(x, y); } }
  return [p, lp];
}
