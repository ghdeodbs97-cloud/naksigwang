// 17_flow.js — 조류: 해안을 따르는 방향장, 예보 지점 흐름장, 흐름 입자, 예보 화살표
// 해안선과 나란한 방향장 (모식): 육지 마스크를 넓게 평균한 값의 기울기에 수직인 방향.
// 예보 지점에서 먼 곳은 실제 조류 방향이 아니다 — 들물/날물에 따라 해안을 따라 오가는 모습만 나타낸다.
const FC = 8; let FF = null, FFw = 0, FFh = 0, FFB = null;   // FFB: 흐름을 그리지 않을 칸(북한·대마도 육지)
function buildFlowField() {
  const W = mask.width, H = mask.height; if (!maskData || !W) { FF = null; return; }
  const sat = new Float32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += maskData[(y * W + x) * 4 + 3] > 127 ? 1 : 0; sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row; } }
  const box = (x1, y1, x2, y2) => { x1 = clamp(x1, 0, W); x2 = clamp(x2, 0, W); y1 = clamp(y1, 0, H); y2 = clamp(y2, 0, H); const a = (x2 - x1) * (y2 - y1); return a > 0 ? (sat[y2 * (W + 1) + x2] - sat[y1 * (W + 1) + x2] - sat[y2 * (W + 1) + x1] + sat[y1 * (W + 1) + x1]) / a : 0; };
  FFw = Math.ceil(W / FC); FFh = Math.ceil(H / FC); FF = new Float32Array(FFw * FFh * 2); FFB = new Uint8Array(FFw * FFh);
  const R = 28;
  for (let j = 0; j < FFh; j++) for (let i = 0; i < FFw; i++) {
    const cx = i * FC + FC / 2, cy = j * FC + FC / 2;
    const gx = box(cx, cy - R, cx + R, cy + R) - box(cx - R, cy - R, cx, cy + R), gy = box(cx - R, cy, cx + R, cy + R) - box(cx - R, cy - R, cx + R, cy);
    { const [mx, my] = toM(cx * 2, cy * 2), la = latOf(my), lo = lonOf(mx);   // 남한 해안선 밖 땅(북한 등)에는 흐름 없음
      if (foreignZone(la, lo)) { const e = gebcoAt(la, lo); if (e == null || e > 0) { FFB[j * FFw + i] = 1; FF[(j * FFw + i) * 2] = FF[(j * FFw + i) * 2 + 1] = 0; continue; } } }
    const m = Math.hypot(gx, gy), k = (j * FFw + i) * 2;
    if (m < .02) { FF[k] = 0; FF[k + 1] = 0; continue; }
    const s = Math.min(1, m * 3) / m; FF[k] = -gy * s; FF[k + 1] = gx * s;   // 기울기에 수직 = 해안과 나란히
  }
}
const isSea = (x, y) => { if (!maskData || x < 0 || y < 0 || x >= cw || y >= ch) return false; if (FFB && FFB[Math.min(FFh - 1, (y >> 1) / FC | 0) * FFw + Math.min(FFw - 1, (x >> 1) / FC | 0)]) return false; const i = ((y >> 1) * mask.width + (x >> 1)) * 4 + 3; return maskData[i] < 128; };

// 화면 격자마다 가까운 조류 예보 지점들의 흐름을 거리 가중 평균 (8 km 밖은 0). 값은 노트/2.5, 최대 2.
let RF = null, RFkey = '';
function realField(tA) {
  if (!CR.ready || !FF) return null;
  const key = FFw + ',' + FFh + ',' + V.cx.toFixed(1) + ',' + V.cy.toFixed(1) + ',' + V.s + ',' + (Math.round(tA * 20) / 20);
  if (key === RFkey) return RF; RFkey = key;
  const ppg = pxPerGround(), Rpx = 8000 * ppg, e2 = (500 * ppg) ** 2, near = [];
  for (const c of CR.st) {
    const [x, y] = toS(c.mx, c.my); if (x < -Rpx || y < -Rpx || x > cw + Rpx || y > ch + Rpx) continue;
    const q = crntAt(c, tA); if (!q) continue;
    const m = Math.min(2, q.sp * KN / 2.5), a = q.dir * D2R; near.push([x, y, Math.sin(a) * m, -Math.cos(a) * m]);
  }
  if (!near.length) return (RF = null);
  if (!RF || RF.length !== FFw * FFh * 3) RF = new Float32Array(FFw * FFh * 3);
  for (let j = 0; j < FFh; j++) for (let i = 0; i < FFw; i++) {
    const sx = (i * FC + FC / 2) * 2, sy = (j * FC + FC / 2) * 2, k = (j * FFw + i) * 3;
    let ws = 0, vx = 0, vy = 0, am = 0;
    for (const [x, y, ex, ey] of near) { const d2 = (sx - x) ** 2 + (sy - y) ** 2; if (d2 >= Rpx * Rpx) continue; const w = 1 / (d2 + e2); ws += w; vx += w * ex; vy += w * ey; am = Math.max(am, 1 - Math.sqrt(d2) / Rpx); }
    if (!ws) { RF[k + 2] = 0; continue; }
    RF[k] = vx / ws; RF[k + 1] = vy / ws; RF[k + 2] = am * am * (3 - 2 * am);
  }
  return RF;
}

/* ── 조류 입자 ─────────────────────────────────────────── */
const NP = 900; const P = { x: new Float32Array(NP), y: new Float32Array(NP), age: new Float32Array(NP), max: new Float32Array(NP) };
function spawn(k) { for (let t = 0; t < 25; t++) { const x = Math.random() * cw, y = Math.random() * ch; if (isSea(x | 0, y | 0)) { P.x[k] = x; P.y[k] = y; P.age[k] = 0; P.max[k] = 50 + Math.random() * 110; return; } } P.age[k] = 1e9; }
// 지도를 끌거나 확대·축소하는 동안에는 입자를 숨겼다가, 손을 떼고 0.3초 뒤 새 화면에 맞춰 다시 뿌린다.
// (예전에는 움직이는 동안 매 프레임 입자를 새로 뿌려서, 휴대폰에서 누르면 조류가 아주 빨리 흐르는 것처럼 보였다)
let flowStale = true, flowHidden = false;
function stepParticles(tide, dt) {
  const moving = ptrs.size > 0 || performance.now() - VIEW_T < 300;
  if (moving) { if (!flowHidden) { fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, flow.width, flow.height); flowHidden = true; } return; }
  if (flowStale) { buildFlowField(); for (let k = 0; k < NP; k++) spawn(k); fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, flow.width, flow.height); flowStale = false; }
  flowHidden = false;
  fctx.setTransform(DPR(), 0, 0, DPR(), 0, 0);
  fctx.globalCompositeOperation = 'destination-out'; fctx.fillStyle = 'rgba(0,0,0,.09)'; fctx.fillRect(0, 0, cw, ch);
  fctx.globalCompositeOperation = 'source-over';
  if (!S.layers.flow || !FF) return;
  const sc = 1.4 * dt * 60, rf = realField(tide.tA);
  fctx.strokeStyle = 'rgba(205,255,250,.55)'; fctx.lineWidth = 1; fctx.beginPath();
  for (let k = 0; k < NP; k++) {
    if (P.age[k] > P.max[k]) { spawn(k); continue; }
    const fi = (Math.min(FFh - 1, (P.y[k] >> 1) / FC | 0) * FFw + Math.min(FFw - 1, (P.x[k] >> 1) / FC | 0)) * 2;
    let vx = FF[fi] * tide.u, vy = FF[fi + 1] * tide.u;
    if (rf) {   // 예보 지점 8 km 안: 예보 유향·유속 (해안 가까이는 해안선 방향으로 꺾음)
      const k3 = fi / 2 * 3, a = rf[k3 + 2];
      if (a > 0) {
        let ex = rf[k3], ey = rf[k3 + 1]; const fm = Math.hypot(FF[fi], FF[fi + 1]);
        if (fm > .05) { const hx = FF[fi] / fm, hy = FF[fi + 1] / fm, dot = ex * hx + ey * hy, mag = Math.hypot(ex, ey), sg = dot < 0 ? -1 : 1; ex += (sg * hx * mag - ex) * fm; ey += (sg * hy * mag - ey) * fm; }
        vx += (ex - vx) * a; vy += (ey - vy) * a;
      }
    }
    const nx = P.x[k] + vx * sc + (Math.random() - .5) * .15, ny = P.y[k] + vy * sc + (Math.random() - .5) * .15;
    if (!isSea(nx | 0, ny | 0)) { spawn(k); continue; }
    fctx.moveTo(P.x[k], P.y[k]); fctx.lineTo(nx + .01, ny);
    P.x[k] = nx; P.y[k] = ny; P.age[k] += dt * 60;
  }
  fctx.stroke();
}

// 조류 예보 지점 화살표: 그 시각 유향·유속 (길이 ∝ 유속)
const crColor = kn => kn < .5 ? '#9ec9cf' : kn < 1.5 ? '#5ff0a8' : kn < 3 ? '#ffb84d' : '#ff7a6e';
function drawCrnt(tide) {
  if (!S.layers.flow || !CR.ready) return;
  const r = DPR(); uctx.setTransform(r, 0, 0, r, 0, 0);
  const gw = cw / pxPerGround(), showName = gw < 60000, big = gw < 400000;
  uctx.font = '600 10.5px JetBrains Mono, monospace'; uctx.textBaseline = 'middle';
  for (const c of CR.st) {
    const [x, y] = toS(c.mx, c.my); if (x < -30 || y < -30 || x > cw + 30 || y > ch + 30) continue;
    const q = crntAt(c, tide.tA); if (!q) continue;
    const kn = q.sp * KN, col = crColor(kn);
    uctx.lineWidth = 1.5; uctx.strokeStyle = 'rgba(6,15,19,.9)'; uctx.fillStyle = col;
    if (kn < .2) { uctx.strokeStyle = col; uctx.lineWidth = 1.5; uctx.beginPath(); uctx.arc(x, y, big ? 4 : 3, 0, 7); uctx.stroke(); }   // 물돌이: 속 빈 고리 (항 아이콘과 구분)
    else {
      const L = (big ? 10 : 6) + Math.min(big ? 30 : 14, kn * (big ? 8 : 4)), a = q.dir * D2R, dx = Math.sin(a), dy = -Math.cos(a);
      const x0 = x - dx * L / 2, y0 = y - dy * L / 2, x1 = x + dx * L / 2, y1 = y + dy * L / 2, hw = big ? 5 : 3.5, hl = big ? 8 : 5;
      uctx.beginPath(); uctx.moveTo(x0, y0); uctx.lineTo(x1 - dx * hl * .6, y1 - dy * hl * .6);
      uctx.strokeStyle = 'rgba(6,15,19,.9)'; uctx.lineWidth = 5; uctx.stroke(); uctx.strokeStyle = col; uctx.lineWidth = 2.5; uctx.stroke();
      uctx.beginPath(); uctx.moveTo(x1, y1); uctx.lineTo(x1 - dx * hl - dy * hw, y1 - dy * hl + dx * hw); uctx.lineTo(x1 - dx * hl + dy * hw, y1 - dy * hl - dx * hw); uctx.closePath();
      uctx.lineWidth = 1.5; uctx.strokeStyle = 'rgba(6,15,19,.9)'; uctx.stroke(); uctx.fill();
    }
    if (gw < 150000 && (kn >= .2 || gw < 40000)) {   // 글자는 150 km 폭 안에서만, 「물돌이」 글자는 40 km 안에서만 (넓게 볼 때 어지럽지 않게)
      const t = (kn < .2 ? '물돌이' : kn.toFixed(1) + 'kn') + (showName ? ' ' + c.name : '');
      uctx.lineWidth = 3; uctx.strokeStyle = 'rgba(6,15,19,.85)'; uctx.strokeText(t, x + 9, y + 9); uctx.fillStyle = col; uctx.fillText(t, x + 9, y + 9);
    }
  }
}
