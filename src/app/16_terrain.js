// 16_terrain.js — GEBCO 지형 격자와 바탕 지도 그리기
/* ── GEBCO 2026 지형 격자 (15초 ≈ 460 m, 육지 표고 + 해저 수심) ───────────
   GEBCO Compilation Group (2026) GEBCO 2026 Grid. 공공 영역. 행마다 앞 칸과의 차이를 저장 후 deflate 압축. */
let GE = null, GSH = null;   // GE: Int16 표고(m, 바다는 음수), GSH: 음영(0~1)
async function loadGebco() {
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다');
    const bin = atob(GEBCO.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const buf = new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const { w, h } = GEBCO, n = w * h, E = new Int16Array(n);
    for (let r = 0; r < h; r++) { let acc = 0; for (let c = 0; c < w; c++) { const k = r * w + c; let d = buf[k] | (buf[n + k] << 8); if (d > 32767) d -= 65536; acc += d; E[k] = acc; } }
    // 음영기복: 북서쪽(315°) 45° 높이의 빛. 해저는 경사가 완만해 과장 배율을 크게.
    const S2 = new Uint8Array(n), Lx = -.5, Ly = .5, Lz = Math.SQRT1_2;
    for (let r = 0; r < h; r++) {
      const lat = GEBCO.lat0 - (r + .5) * GEBCO.step, dx = GEBCO.step * 111320 * Math.cos(lat * D2R), dy = GEBCO.step * 110574;
      for (let c = 0; c < w; c++) {
        const k = r * w + c, e = E[k], z = e >= 0 ? 2.2 : 7;
        const zx = (E[r * w + Math.min(w - 1, c + 1)] - E[r * w + Math.max(0, c - 1)]) / (2 * dx) * z;
        const zy = (E[Math.max(0, r - 1) * w + c] - E[Math.min(h - 1, r + 1) * w + c]) / (2 * dy) * z;
        const L = Math.hypot(zx, zy, 1), v = (-zx * Lx - zy * Ly + Lz) / L;
        S2[k] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    }
    GE = E; GSH = S2; dirty = true; dirtyHover = true; analyzeSection();
  } catch (err) { console.warn('GEBCO 지형을 불러오지 못했습니다:', err); $('terrainNote').textContent = '지형 자료를 풀지 못했습니다 (' + err.message + '). 기본 지도로 표시합니다.'; }
}
// 경위도에서 쌍선형 보간한 표고/음영 (자료 범위 밖이면 null)
function gebcoAt(lat, lon, arr = GE) {
  if (!arr) return null;
  const { w, h, lat0, lon0, step } = GEBCO, fc = (lon - lon0) / step - .5, fr = (lat0 - lat) / step - .5;
  if (fc < 0 || fr < 0 || fc > w - 1 || fr > h - 1) return null;
  const c0 = Math.min(w - 2, fc | 0), r0 = Math.min(h - 2, fr | 0), tx = fc - c0, ty = fr - r0, k = r0 * w + c0;
  return (arr[k] * (1 - tx) + arr[k + 1] * tx) * (1 - ty) + (arr[k + w] * (1 - tx) + arr[k + w + 1] * tx) * ty;
}
const hex2 = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
function makeLUT(stops, max) {
  const out = new Uint8Array((max + 1) * 3), S_ = stops.map(([v, c]) => [v, hex2(c)]);
  for (let v = 0; v <= max; v++) { let i = 1; while (i < S_.length - 1 && S_[i][0] < v) i++; const [v0, a] = S_[i - 1], [v1, b] = S_[i], f = Math.max(0, Math.min(1, (v - v0) / (v1 - v0))); for (let j = 0; j < 3; j++) out[v * 3 + j] = a[j] + (b[j] - a[j]) * f; }
  return out;
}
const SEA_STOPS = [[0, '#86d8cf'], [5, '#64c4c0'], [10, '#46acb6'], [20, '#2f91a8'], [50, '#227597'], [100, '#1b6184'], [200, '#164f70'], [500, '#11405e'], [1000, '#0d324d'], [2000, '#0a263d'], [3500, '#071b2e']];
const LAND_STOPS = [[0, '#55704a'], [50, '#5f7c4e'], [200, '#728c56'], [400, '#8a9562'], [700, '#9c966f'], [1000, '#a08c72'], [1400, '#aa9e8f'], [2000, '#ddd6cc']];
const SEA_LUT = makeLUT(SEA_STOPS, 3500), LAND_LUT = makeLUT(LAND_STOPS, 2000);
const tcan = [document.createElement('canvas'), document.createElement('canvas'), document.createElement('canvas')];
// 화면 크기의 절반 해상도로 바다용/육지용 지형 그림을 만든다 (육지/바다 구분은 실제 해안선이 정함)
// 수심 단계 (해도처럼 구간별 색) — 단계 경계값(m)
const DEPTH_STEPS = [0, 2, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 500, 1000, 2000, 3500];
const STEP_OF = new Uint8Array(3501); { let k = 0; for (let v = 0; v <= 3500; v++) { while (k < DEPTH_STEPS.length - 2 && v >= DEPTH_STEPS[k + 1]) k++; STEP_OF[v] = k; } }
let DEPTH_GRID = null;   // 화면 절반 해상도의 바다 수심(m), 육지는 NaN
function renderTerrain(path, gpp) {
  const W = Math.ceil(cw / 2), H = Math.ceil(ch / 2);
  for (const c of tcan) if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  // 1) 육지 마스크(절반 해상도) → 해안선까지 거리(챔퍼 3-4 거리변환)
  const mc = tcan[2].getContext('2d'); mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, W, H); mc.setTransform(.5, 0, 0, .5, 0, 0); mc.fillStyle = '#fff'; mc.fill(path, 'evenodd');
  const md = mc.getImageData(0, 0, W, H).data, N = W * H, DT = new Float32Array(N), BIG = 1e9;
  for (let i = 0; i < N; i++) DT[i] = md[i * 4 + 3] > 127 ? 0 : BIG;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; let v = DT[k]; if (!v) continue;
    if (i > 0) v = Math.min(v, DT[k - 1] + 3); if (j > 0) { v = Math.min(v, DT[k - W] + 3); if (i > 0) v = Math.min(v, DT[k - W - 1] + 4); if (i < W - 1) v = Math.min(v, DT[k - W + 1] + 4); } DT[k] = v; }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; let v = DT[k]; if (!v) continue;
    if (i < W - 1) v = Math.min(v, DT[k + 1] + 3); if (j < H - 1) { v = Math.min(v, DT[k + W] + 3); if (i < W - 1) v = Math.min(v, DT[k + W + 1] + 4); if (i > 0) v = Math.min(v, DT[k + W - 1] + 4); } DT[k] = v; }
  const pxm = 2 * gpp / 3;   // 거리변환 1단위 = 절반 해상도 1칸/3 → 지상 m
  const D = new Float32Array(N);
  const sea = tcan[0].getContext('2d').createImageData(W, H), land = tcan[1].getContext('2d').createImageData(W, H);
  const { w, h, lat0, lon0, step } = GEBCO;
  const cols = new Float32Array(W); for (let i = 0; i < W; i++) cols[i] = (lonOf(toM(i * 2 + 1, 0)[0]) - lon0) / step - .5;
  for (let j = 0; j < H; j++) {
    const fr = (lat0 - latOf(toM(0, j * 2 + 1)[1])) / step - .5;
    for (let i = 0; i < W; i++) {
      const fc = cols[i], o = (j * W + i) * 4;
      if (fc < 0 || fr < 0 || fc > w - 1 || fr > h - 1) { sea.data[o] = 7; sea.data[o + 1] = 27; sea.data[o + 2] = 46; sea.data[o + 3] = 255; D[j * W + i] = NaN; continue; }
      const c0 = Math.min(w - 2, fc | 0), r0 = Math.min(h - 2, fr | 0), tx = fc - c0, ty = fr - r0, k = r0 * w + c0;
      const a = (1 - tx) * (1 - ty), b = tx * (1 - ty), c = (1 - tx) * ty, d = tx * ty;
      const e = GE[k] * a + GE[k + 1] * b + GE[k + w] * c + GE[k + w + 1] * d;
      const sh = (GSH[k] * a + GSH[k + 1] * b + GSH[k + w] * c + GSH[k + w + 1] * d) / 255;
      // 수심: 해안 150 m 안은 경사 추정, 800 m 밖은 GEBCO, 사이는 거리로 섞음 (커서 수심과 같은 식)
      const kk = j * W + i, dG = md[kk * 4 + 3] > 127 ? 0 : (DT[kk] >= BIG ? 1e6 : DT[kk] * pxm), est = depthAt(dG), wg = Math.max(0, Math.min(1, (dG - 150) / 650));
      const dm = md[kk * 4 + 3] > 127 ? NaN : (-e < 1 && wg < 1) ? est : wg * Math.max(.5, -e) + (1 - wg) * est; D[kk] = dm;
      const dv = dm === dm ? Math.min(3500, dm) | 0 : 0, si = STEP_OF[dv], dep = Math.round((DEPTH_STEPS[si] * .35 + DEPTH_STEPS[si + 1] * .65)) , fs = .62 + .55 * sh;
      // 남한 해안선 밖인데 GEBCO가 육지인 곳(북한·일본 등)은 회갈색으로. 해안 근처의 낮은 값은 바다색에 가깝게 둔다.
      // 북한·대마도 쪽에서만 GEBCO 육지를 회갈색으로 칠한다 (남한 연안의 거친 칸이 바다에 땅처럼 번지지 않게)
      const plat = lat0 - (fr + .5) * step, plon = lon0 + (fc + .5) * step;
      const foreign = (plat > 37.55 && plon < 126.0 && !(plat < 37.705 && plon > 125.55 && plon < 125.8) && !(plon < 124.82)) || (plat > 37.78 && plon < 126.35) || (plat > 37.86 && plon < 127.2) || (plat > 38.3 && plon < 128.2) || plat > 38.62 || (plon > 128.9 && plat < 34.8);
      const fo = e > 0 && (foreign || e > 60) ? Math.min(1, e / 30) : 0, fr2 = (1 - fo) * fs, fg = fo * (.45 + .7 * sh);
      const dq = Math.min(3500, dep);
      sea.data[o] = Math.min(255, SEA_LUT[dq * 3] * fr2 + 112 * fg); sea.data[o + 1] = Math.min(255, SEA_LUT[dq * 3 + 1] * fr2 + 112 * fg); sea.data[o + 2] = Math.min(255, SEA_LUT[dq * 3 + 2] * fr2 + 100 * fg); sea.data[o + 3] = 255;
      const el = Math.min(2000, Math.max(0, e)) | 0, fl = .35 + .95 * sh;
      land.data[o] = Math.min(255, LAND_LUT[el * 3] * fl); land.data[o + 1] = Math.min(255, LAND_LUT[el * 3 + 1] * fl); land.data[o + 2] = Math.min(255, LAND_LUT[el * 3 + 2] * fl); land.data[o + 3] = 255;
    }
  }
  tcan[0].getContext('2d').putImageData(sea, 0, 0); tcan[1].getContext('2d').putImageData(land, 0, 0);
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(tcan[0], 0, 0, W * 2, H * 2);
  const full = new Path2D(); full.rect(-10, -10, cw + 20, ch + 20); full.addPath(path);
  bctx.save(); bctx.clip(full, 'evenodd');
  DEPTH_GRID = { D, W, H };
  drawDepthContours(D, W, H, gpp);
  bctx.restore();
  bctx.save(); bctx.clip(path, 'evenodd');
  bctx.drawImage(tcan[1], 0, 0, W * 2, H * 2);
  drawContours([200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800], v => v % 1000 === 0 ? 'rgba(45,35,20,.38)' : 'rgba(45,35,20,.2)');
  bctx.restore();
}
// 등심선 (위에서 만든 수심 격자로, 확대할수록 촘촘하게) + 수심 숫자
function drawDepthContours(D, W, H, gpp) {
  const levels = gpp < 15 ? [2, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100] : gpp < 60 ? [5, 10, 20, 30, 40, 50, 75, 100, 150, 200] : gpp < 400 ? [10, 20, 30, 50, 100, 200, 500, 1000] : [20, 50, 100, 200, 500, 1000, 1500, 2000, 2500, 3000];
  const major = new Set([10, 50, 100, 500, 1000, 2000]);
  const g = 2, nx = Math.floor((W - 1) / g) + 1, ny = Math.floor((H - 1) / g) + 1, Z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) Z[j * nx + i] = D[(j * g) * W + i * g];
  const sc = 2 * g, labels = [];
  bctx.lineWidth = 1;
  for (const L of levels) {
    bctx.strokeStyle = major.has(L) ? 'rgba(220,250,252,.5)' : 'rgba(220,250,252,.24)'; bctx.beginPath(); let cand = null, cl = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = Z[j * nx + i], b = Z[j * nx + i + 1], c = Z[(j + 1) * nx + i + 1], d = Z[(j + 1) * nx + i];
      if (a !== a || b !== b || c !== c || d !== d) continue;
      const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0); if (idx === 0 || idx === 15) continue;
      const x = i * sc, y = j * sc, f = (p, q) => (L - p) / (q - p);
      const T = [x + sc * f(a, b), y], R = [x + sc, y + sc * f(b, c)], B = [x + sc * f(d, c), y + sc], Lf = [x, y + sc * f(a, d)];
      const seg = { 1: [Lf, B], 2: [B, R], 3: [Lf, R], 4: [T, R], 5: [Lf, T, B, R], 6: [T, B], 7: [Lf, T], 8: [Lf, T], 9: [T, B], 10: [T, R, Lf, B], 11: [T, R], 12: [Lf, R], 13: [B, R], 14: [Lf, B] }[idx];
      for (let s2 = 0; s2 < seg.length; s2 += 2) { bctx.moveTo(seg[s2][0], seg[s2][1]); bctx.lineTo(seg[s2 + 1][0], seg[s2 + 1][1]); }
      if (++cl % 97 === 0) labels.push([L, (seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2, Math.atan2(seg[1][1] - seg[0][1], seg[1][0] - seg[0][0])]);
    }
    bctx.stroke();
  }
  // 수심 숫자: 서로 겹치지 않게 일부만
  const placed = []; bctx.font = '600 10px JetBrains Mono, monospace'; bctx.textBaseline = 'middle'; bctx.textAlign = 'center';
  for (const [L, x, y, ang] of labels) {
    if (x < 30 || y < 20 || x > cw - 30 || y > ch - 20 || placed.some(([px, py]) => Math.abs(px - x) < 90 && Math.abs(py - y) < 40)) continue;
    placed.push([x, y]); let a = ang; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
    bctx.save(); bctx.translate(x, y); bctx.rotate(a); bctx.lineWidth = 3; bctx.strokeStyle = 'rgba(8,40,55,.85)'; bctx.strokeText(L + 'm', 0, 0); bctx.fillStyle = '#e6fbfc'; bctx.fillText(L + 'm', 0, 0); bctx.restore();
  }
  bctx.textAlign = 'left';
}
// 등고선 (육지, GEBCO 표고)
function drawContours(levels, color) {
  const g = 6, nx = Math.ceil(cw / g) + 1, ny = Math.ceil(ch / g) + 1, Z = new Float32Array(nx * ny);
  const lons = new Float64Array(nx); for (let i = 0; i < nx; i++) lons[i] = lonOf(toM(i * g, 0)[0]);
  for (let j = 0; j < ny; j++) { const lat = latOf(toM(0, j * g)[1]); for (let i = 0; i < nx; i++) { const v = gebcoAt(lat, lons[i]); Z[j * nx + i] = v == null ? NaN : v; } }
  bctx.lineWidth = 1;
  for (const L of levels) {
    bctx.strokeStyle = color(L); bctx.beginPath();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = Z[j * nx + i], b = Z[j * nx + i + 1], c = Z[(j + 1) * nx + i + 1], d = Z[(j + 1) * nx + i];
      if (a !== a || b !== b || c !== c || d !== d) continue;
      const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (d > L ? 1 : 0); if (idx === 0 || idx === 15) continue;
      const x = i * g, y = j * g, f = (p, q) => (L - p) / (q - p);
      const T = [x + g * f(a, b), y], R = [x + g, y + g * f(b, c)], B = [x + g * f(d, c), y + g], Lf = [x, y + g * f(a, d)];
      const seg = { 1: [Lf, B], 2: [B, R], 3: [Lf, R], 4: [T, R], 5: [Lf, T, B, R], 6: [T, B], 7: [Lf, T], 8: [Lf, T], 9: [T, B], 10: [T, R, Lf, B], 11: [T, R], 12: [Lf, R], 13: [B, R], 14: [Lf, B] }[idx];
      for (let s2 = 0; s2 < seg.length; s2 += 2) { bctx.moveTo(seg[s2][0], seg[s2][1]); bctx.lineTo(seg[s2 + 1][0], seg[s2 + 1][1]); }
    }
    bctx.stroke();
  }
}
const CITIES = [['서울', 37.566, 126.978], ['인천', 37.456, 126.705], ['태안', 36.745, 126.298], ['군산', 35.968, 126.737], ['목포', 34.812, 126.392], ['여수', 34.760, 127.662], ['통영', 34.854, 128.433], ['부산', 35.180, 129.075], ['울산', 35.539, 129.311], ['포항', 36.019, 129.343], ['강릉', 37.752, 128.876], ['속초', 38.207, 128.592], ['제주', 33.499, 126.531], ['울릉도', 37.484, 130.906]];

function buildPath(rings, margin) {
  const p = new Path2D(), x0 = -margin, x1 = cw + margin, y0 = -margin, y1 = ch + margin;
  const oc = (x, y) => (x < x0 ? 1 : 0) | (x > x1 ? 2 : 0) | (y < y0 ? 4 : 0) | (y > y1 ? 8 : 0);
  const sx = new Float64Array(0);
  for (const r of rings) {
    const n = r.n, X = new Float64Array(n), Y = new Float64Array(n), C = new Uint8Array(n);
    for (let i = 0; i < n; i++) { X[i] = (r.xs[i] - V.cx) * V.s + cw / 2; Y[i] = (V.cy - r.ys[i]) * V.s + ch / 2; C[i] = oc(X[i], Y[i]); }
    let lx = X[0], ly = Y[0], lc = C[0];
    p.moveTo(lx, ly);
    for (let i = 1; i < n; i++) {
      if (i < n - 1) {
        if (lc & C[i] & C[i + 1]) continue;                       // 화면 밖 같은 쪽에 머무는 구간 생략
        if (Math.abs(X[i] - lx) < .6 && Math.abs(Y[i] - ly) < .6) continue;
      }
      p.lineTo(X[i], Y[i]); lx = X[i]; ly = Y[i]; lc = C[i];
    }
    p.closePath();
  }
  return p;
}

function renderBase() {
  dirty = false;
  const r = DPR(), ppg = pxPerGround(), gpp = 1 / ppg, diag = Math.hypot(cw, ch);
  const lod = gpp > 2000 ? LOD.low : gpp > 35 ? LOD.mid : LOD.full;
  const TER = S.mapStyle === 'terrain' && !!GE, BANDS_ = BANDS;
  const drawBands = BANDS_.filter(([d]) => d * ppg >= 3 && d * ppg <= 3 * diag);
  const margin = drawBands.length ? drawBands[drawBands.length - 1][0] * ppg + 4 : 4;
  // 화면 중심이 해안에서 아주 먼 경우의 바탕색
  const dC = groundToCoast(V.cx, V.cy, 25000);
  let bg = FAR; for (const [d, c] of BANDS_) if (d * ppg > 3 * diag && dC < d) { bg = c; break; }
  const [vx1, vy1] = toM(-margin, ch + margin), [vx2, vy2] = toM(cw + margin, -margin);
  const vis = lod.filter(q => q.maxx >= vx1 && q.minx <= vx2 && q.maxy >= vy1 && q.miny <= vy2);
  const path = buildPath(vis, margin);
  bctx.setTransform(r, 0, 0, r, 0, 0);
  bctx.fillStyle = bg; bctx.fillRect(0, 0, cw, ch);
  bctx.lineJoin = 'round'; bctx.lineCap = 'round';
  if (TER) renderTerrain(path, gpp);
  else {
    for (let k = drawBands.length - 1; k >= 0; k--) { const [d, c] = drawBands[k]; bctx.lineWidth = 2 * d * ppg; bctx.strokeStyle = c; bctx.stroke(path); }
    bctx.fillStyle = '#141b19'; bctx.fill(path, 'evenodd');
  }
  drawOSM('under', gpp, TER);
  let sPoly = null, sLine = null;
  if (STRUCT.n) { [sPoly, sLine] = structPath(margin); const sw0 = Math.max(gpp > 60 ? 1 : 2, 8 * ppg); bctx.fillStyle = TER ? '#a9b1af' : '#3a4744'; bctx.fill(sPoly); bctx.strokeStyle = TER ? '#eef2f1' : '#c9d6d2'; bctx.lineWidth = gpp > 60 ? .5 : 1; bctx.stroke(sPoly); bctx.lineCap = 'butt'; bctx.strokeStyle = TER ? '#c3cac8' : '#b9c7c3'; bctx.lineWidth = sw0; bctx.stroke(sLine); bctx.lineCap = 'round'; }
  if (TER) {   // 실제 해안선 (OSM)
    bctx.strokeStyle = 'rgba(214,201,160,.35)'; bctx.lineWidth = gpp > 300 ? 1.5 : 3; bctx.stroke(path);
    bctx.strokeStyle = 'rgba(232,224,196,.75)'; bctx.lineWidth = gpp > 300 ? .5 : .9; bctx.stroke(path);
  } else {
    bctx.strokeStyle = 'rgba(191,247,239,.18)'; bctx.lineWidth = 3.5; bctx.stroke(path);
    bctx.strokeStyle = '#bff7ef'; bctx.lineWidth = gpp > 300 ? .7 : 1.2; bctx.stroke(path);
  }
  drawOSM('over', gpp, TER);
  // 경위도선
  const degPx = R * D2R * V.s;
  const STEPS = [5, 2, 1, .5, .2, .1, .05, .02, .01, .005, .002, .001, .0005], step = STEPS.filter(s => s * degPx >= 70).pop() || 5;
  const dec = step >= 1 ? 0 : step >= .1 ? 1 : step >= .01 ? 2 : step >= .001 ? 3 : 4;
  const [mxL, myB] = toM(0, ch), [mxR, myT] = toM(cw, 0);
  bctx.strokeStyle = 'rgba(150,230,240,.09)'; bctx.lineWidth = 1; bctx.font = '400 10px JetBrains Mono, monospace'; bctx.fillStyle = 'rgba(190,230,235,.65)';
  bctx.beginPath();
  for (let lo = Math.ceil(lonOf(mxL) / step) * step; lo <= lonOf(mxR); lo += step) { const x = toS(mxOf(lo), 0)[0]; bctx.moveTo(x, 0); bctx.lineTo(x, ch); }
  for (let la = Math.ceil(latOf(myB) / step) * step; la <= latOf(myT); la += step) { const y = toS(0, myOf(la))[1]; bctx.moveTo(0, y); bctx.lineTo(cw, y); }
  bctx.stroke();
  bctx.textBaseline = 'top';
  for (let lo = Math.ceil(lonOf(mxL) / step) * step; lo <= lonOf(mxR); lo += step) { const x = toS(mxOf(lo), 0)[0]; if (x > 40 && x < cw - 60) bctx.fillText(lo.toFixed(dec) + '°E', x + 3, 3); }
  bctx.textBaseline = 'bottom';
  for (let la = Math.ceil(latOf(myB) / step) * step; la <= latOf(myT); la += step) { const y = toS(0, myOf(la))[1]; if (y > 30 && y < ch - 40) bctx.fillText(la.toFixed(dec) + '°N', 3, y - 2); }
  // 도시 이름 (넓게 볼 때만)
  if (gpp > 60) {
    bctx.font = '500 12px IBM Plex Sans KR, sans-serif'; bctx.textBaseline = 'middle';
    for (const [nm, la, lo] of CITIES) { const [x, y] = toS(mxOf(lo), myOf(la)); if (x < 0 || y < 0 || x > cw || y > ch) continue; bctx.fillStyle = '#ffb84d'; bctx.beginPath(); bctx.arc(x, y, 2.5, 0, 7); bctx.fill(); bctx.fillStyle = 'rgba(230,245,246,.9)'; bctx.fillText(nm, x + 6, y); }
  }
  drawPortsAndSoundings(gpp);
  drawStations();
  // 축척, 방위
  const bm = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000].find(m => m * ppg >= 70) || 100000;
  const bar = bm * ppg, lbl = bm >= 1000 ? bm / 1000 + ' km' : bm + ' m';
  bctx.fillStyle = 'rgba(6,15,19,.7)'; bctx.fillRect(10, ch - 30, bar + 24 + lbl.length * 7, 20);
  bctx.strokeStyle = '#d5ecee'; bctx.lineWidth = 2; bctx.beginPath(); bctx.moveTo(16, ch - 16); bctx.lineTo(16 + bar, ch - 16); bctx.stroke();
  bctx.fillStyle = '#d5ecee'; bctx.font = '600 11px JetBrains Mono, monospace'; bctx.textBaseline = 'alphabetic'; bctx.fillText(lbl, 22 + bar, ch - 12);
  bctx.fillText('N ↑', cw - 34, 20);
  // 위치 안내 미니맵
  const gw = cw * gpp;
  if (gw < 300000) {
    const mw = Math.min(130, cw * .22), bx1 = mxOf(124.4), bx2 = mxOf(131.95), by1 = myOf(32.9), by2 = myOf(38.7);
    const ms = mw / (bx2 - bx1), mh = (by2 - by1) * ms, ox = cw - mw - 12, oy = ch - mh - 12;
    bctx.fillStyle = 'rgba(6,15,19,.85)'; bctx.fillRect(ox - 4, oy - 4, mw + 8, mh + 8);
    bctx.strokeStyle = 'rgba(79,227,211,.35)'; bctx.lineWidth = 1; bctx.strokeRect(ox - 4, oy - 4, mw + 8, mh + 8);
    bctx.fillStyle = '#2a3a37'; bctx.beginPath();
    for (const q of LOD.low) { for (let i = 0; i < q.n; i++) { const x = ox + (q.xs[i] - bx1) * ms, y = oy + (by2 - q.ys[i]) * ms; i ? bctx.lineTo(x, y) : bctx.moveTo(x, y); } bctx.closePath(); }
    bctx.fill('evenodd');
    const [a1, a2] = toM(0, 0), [b1, b2] = toM(cw, ch);
    const rx = ox + (a1 - bx1) * ms, ry = oy + (by2 - a2) * ms, rw = Math.max(4, (b1 - a1) * ms), rh = Math.max(4, (a2 - b2) * ms);
    bctx.strokeStyle = '#ffb84d'; bctx.lineWidth = 1.5; bctx.strokeRect(rx, ry, rw, rh);
  }
  // 육지 마스크 (조류 입자용)
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mask.width, mask.height);
  mctx.setTransform(.5, 0, 0, .5, 0, 0); mctx.fillStyle = '#fff'; mctx.fill(path, 'evenodd');
  if (sPoly) { mctx.fill(sPoly); mctx.strokeStyle = '#fff'; mctx.lineWidth = Math.max(2, 8 * ppg); mctx.stroke(sLine); }
  maskData = mctx.getImageData(0, 0, mask.width, mask.height).data;
  // 범례, 안내
  $('bandTitle').textContent = TER ? '수심 구간' : '해안선에서 거리';
  $('bandLegend').innerHTML = TER ? DEPTH_STEPS.slice(0, -1).map((d, k) => { const v = Math.round(d * .35 + DEPTH_STEPS[k + 1] * .65), c = `rgb(${SEA_LUT[v * 3]},${SEA_LUT[v * 3 + 1]},${SEA_LUT[v * 3 + 2]})`; return `<span class="b"><i style="background:${c}"></i>${d >= 1000 ? d / 1000 + 'k' : d}~</span>`; }).join('') + '<span class="b">m</span>' + '<span class="b"><i style="background:#728c56"></i>육지 200m</span><span class="b"><i style="background:#a08c72"></i>1000m</span>'
    : BANDS_.filter(([d]) => d * ppg >= 3).slice(0, 8).map(([d, c]) => `<span class="b"><i style="background:${c}"></i>${d >= 1000 ? d / 1000 + 'km' : d + 'm'}</span>`).join('');
  $('viewSize').textContent = '보이는 폭 ' + (gw >= 1000 ? (gw / 1000).toFixed(gw >= 10000 ? 0 : 1) + ' km' : Math.round(gw) + ' m');
  $('warn').hidden = gw > 1500;
  buildFlowField();
  for (let k = 0; k < NP; k++) spawn(k);
  fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, flow.width, flow.height);
}
