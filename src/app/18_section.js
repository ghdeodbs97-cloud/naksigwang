// 18_section.js — 단면(측면도) 분석과 그리기
/* ── 단면 ──────────────────────────────────────────────── */
const sec = $('sec'), sctx = sec.getContext('2d'); let sw = 0, shh = 0, SEC = null;
function analyzeSection() {
  dirty = true;   // 아이콘이 새 단면선을 피해 다시 놓이도록 바탕을 다시 그림
  if (!S.A || !S.B) { SEC = null; renderSecInfo(); return; }
  autoShore();   // 해안 종류에 맞춰 추정 경사·수심 상한을 먼저 정한다 (18b_shore.js)
  const kA = kAt(latOf(S.A[1])), Lg = Math.hypot(S.B[0] - S.A[0], S.B[1] - S.A[1]) / kA;
  const N = Math.round(clamp(Lg / 2, 300, 1000));            // 최소 300개, 길면 약 2 m 간격까지
  const pts = []; let L = 0;
  for (let k = 0; k <= N; k++) {
    const f = k / N, mx = S.A[0] + (S.B[0] - S.A[0]) * f, my = S.A[1] + (S.B[1] - S.A[1]) * f;
    if (k) { const p = pts[k - 1]; L += Math.hypot(mx - p.mx, my - p.my) / kAt(latOf((my + p.my) / 2)); }
    const land = inLand(mx, my), dG = Math.min(groundToCoast(mx, my, 8000), 8000);
    const r = land ? null : (depthQuery(mx, my) || modelDepth(mx, my, dG));
    pts.push({ mx, my, s: L, land, dG, r });
  }
  const cross = [];
  for (let k = 1; k <= N; k++) if (pts[k].land !== pts[k - 1].land) cross.push(k);
  SEC = { pts, L, cross, N };
  SEC.prof = profileFeatures(SEC);
  renderSecInfo();
}
const isPub = t => t === 'survey' || t === 'coastal' || t === 'chart';
// 해안선에서 바다 쪽으로 진행하는 수심 프로파일에서 지형 특징을 찾는다
function profileFeatures(sec) {
  const { pts, cross } = sec;
  let c0 = 0, dir = 1;
  if (cross.length) { const c = cross[0]; if (pts[c - 1].land && !pts[c].land) { c0 = c; dir = 1; } else { c0 = c - 1; dir = -1; } }
  const s0 = pts[c0].s, seq = [];
  for (let k = c0; k >= 0 && k < pts.length; k += dir) { const p = pts[k]; if (p.land) { if (seq.length) break; continue; } seq.push({ x: Math.abs(p.s - s0), d: p.r.depth, t: p.r.type }); }
  const out = { items: [], note: '', cast: [] };
  if (seq.length < 10) { out.note = '바다 구간이 짧아 분석하지 않았습니다.'; return out; }
  const types = new Set(seq.map(q => q.t)), onlyEst = types.size === 1 && types.has('est'), pubShare = seq.filter(q => isPub(q.t)).length / seq.length;
  for (const m of [50, 100, 150]) { const q = seq.find(q => q.x >= m); out.cast.push({ m, q }); }
  if ([...types].every(x => x === 'est' || x === 'gebco') && types.has('gebco')) { out.note = '이 단면은 GEBCO 460 m 격자와 추정값뿐이라 수십 m 단위의 급심·수중여는 찾을 수 없습니다. 아래 결과는 큰 흐름만 참고하세요.'; }
  if (onlyEst) { out.note = '이 단면은 추정 모델만 있어 해저지형 특징을 분석하지 않았습니다. 실측·공공 수심을 불러오면 분석합니다.'; return out; }
  if (pubShare < .5 && !out.note) out.note = '세부 급심/수중여 탐지 신뢰도 낮음 (고해상도 연안 자료가 부족하고 BADA 150 m 격자·추정값 위주인 구간).';
  // 평활 후 기울기
  const step = seq.length > 1 ? (seq[seq.length - 1].x - seq[0].x) / (seq.length - 1) : 1;
  const win = Math.max(1, Math.round(10 / step));
  const sm = seq.map((q, i) => { let a = 0, n = 0; for (let j = Math.max(0, i - win); j <= Math.min(seq.length - 1, i + win); j++) { a += seq[j].d; n++; } return a / n; });
  const sl = sm.map((d, i) => { const a = Math.max(0, i - win), b = Math.min(sm.length - 1, i + win); return (sm[b] - sm[a]) / Math.max(1e-6, seq[b].x - seq[a].x); });
  const runs = (test, minLen) => { const r = []; let st = null; for (let i = 0; i <= sl.length; i++) { const ok = i < sl.length && test(sl[i], i); if (ok && st === null) st = i; if (!ok && st !== null) { if (seq[i - 1].x - seq[st].x >= minLen) r.push([st, i - 1]); st = null; } } return r; };
  const f = v => v.toFixed(1), xm = i => Math.round(seq[i].x);
  const steep = runs(v => v > .12, 10);
  steep.slice(0, 3).forEach(([a, b]) => {
    out.items.push(`${xm(a)}~${xm(b)} m 급심 (${f(sm[a])} m → ${f(sm[b])} m)`);
    let bi = a, bv = 0; for (let i = Math.max(1, a - win); i <= Math.min(sl.length - 2, a + win); i++) { const cv = sl[i + 1] - sl[i - 1]; if (cv > bv) { bv = cv; bi = i; } }
    out.items.push(`브레이크라인 약 ${xm(bi)} m`);
    if (a > 0) { let i0 = a; while (i0 > 0 && sl[i0 - 1] > .05) i0--; if (i0 < a) out.items.push(`${xm(i0)} m 전방부터 수심 변화율 증가`); }
  });
  runs(v => Math.abs(v) < .01, 40).slice(0, 2).forEach(([a, b]) => out.items.push(`${xm(a)}~${xm(b)} m 평탄지 (약 ${f(sm[a])} m)`));
  runs(v => v > .01 && v < .03, 40).slice(0, 2).forEach(([a, b]) => out.items.push(`${xm(a)}~${xm(b)} m 완경사`));
  for (let i = 1; i < seq.length; i++) { const j = seq.findIndex(q => q.x >= seq[i].x + 10); if (j > 0 && Math.abs(seq[j].d - seq[i].d) > 1.5) { out.items.push(`${xm(i)} m 부근 수심 급변 (${f(seq[i].d)} m → ${f(seq[j].d)} m)`); break; } }
  const span = Math.max(win * 3, Math.round(20 / step));
  let got = 0;
  for (let i = span; i < sm.length - span && got < 3; i++) {
    const L0 = Math.min(...sm.slice(i - span, i)), R0 = Math.min(...sm.slice(i + 1, i + span + 1)), Lx = Math.max(...sm.slice(i - span, i)), Rx = Math.max(...sm.slice(i + 1, i + span + 1));
    if (sm[i] - Math.max(sm[i - span], sm[i + span]) > 1 && sm[i] >= Lx && sm[i] >= Rx) { out.items.push(`${xm(i)} m 부근 골·물골 후보 (주변보다 약 ${f(sm[i] - Math.max(sm[i - span], sm[i + span]))} m 깊음)`); got++; i += span; }
    else if (Math.min(sm[i - span], sm[i + span]) - sm[i] > 1 && sm[i] <= L0 && sm[i] <= R0) { out.items.push(`${xm(i)} m 부근 수중 능선 후보 (주변보다 약 ${f(Math.min(sm[i - span], sm[i + span]) - sm[i])} m 얕음)`); got++; i += span; }
  }
  if (!out.items.length) out.items.push('뚜렷한 급심·골·능선이 보이지 않는 완만한 단면입니다.');
  return out;
}
function renderSecInfo() {
  const box = $('secInfo');
  if (!SEC) { box.innerHTML = ''; return; }
  const P = SEC.prof || { items: [], cast: [], note: '' };
  const cast = P.cast.map(({ m, q }) => `<span class="cast"><b>${m} m</b> ${q ? (q.t === 'est' ? '추정 약 ' + Math.round(q.d) + ' m' : q.t === 'gebco' ? '약 ' + Math.round(q.d) + ' m · GEBCO' : (q.t === 'bada' ? '약 ' + Math.round(q.d) : q.t === 'survey' ? q.d.toFixed(1) : '약 ' + Math.round(q.d)) + ' m · ' + DTYPES[q.t].short) : '단면 밖'}</span>`).join('');
  box.innerHTML = (cast ? `<div class="casts"><span class="hint">해안선에서 캐스팅 거리별 수심</span>${cast}</div>` : '') +
    `<ul class="feats">${P.items.map(t => `<li>${t}</li>`).join('')}</ul>` + (P.note ? `<p class="note warnTxt">${P.note}</p>` : '');
}

function lineStyle(r) {
  if (!r || r.type === 'est') return { c: 'rgba(127,243,230,.75)', w: 1.4, dash: [5, 4] };
  if (r.type === 'gebco') return { c: DTYPES.gebco.color, w: 1.4, dash: [2, 3], a: .9 };
  const c = DTYPES[r.type].color;
  if (r.type === 'bada') return { c, w: 1.3, dash: [], a: r.interp ? .6 : 1 };
  return { c, w: 2.8, dash: [], a: r.interp ? .55 : 1 };
}
function drawSection(now, tide) {
  const r = DPR(); sctx.setTransform(r, 0, 0, r, 0, 0);
  const w = sw, h = shh, ml = 50, mr = 14, mt = 22, mb = 26;
  sctx.globalAlpha = 1; sctx.fillStyle = '#04090c'; sctx.fillRect(0, 0, w, h);
  if (!SEC) { sctx.fillStyle = '#7a9ea6'; sctx.font = '400 13px IBM Plex Sans KR, sans-serif'; sctx.textBaseline = 'middle'; sctx.fillText('평면도에서 해안을 확대한 뒤, 육지에서 바다 쪽으로 단면선을 그어 보세요.', 20, h / 2); return; }
  const { pts, L, cross, N } = SEC;
  const landH = 3;
  const zs = pts.map(p => p.land ? landH : -p.r.depth);
  const minZ = Math.min(...zs), maxD = -minZ;
  const ymin = Math.floor((minZ - 2) / 5) * 5, ymax = landH + 1.5;
  const X = d => ml + d / L * (w - ml - mr), Y = v => mt + (ymax - v) / (ymax - ymin) * (h - mt - mb);
  const xk = k => X(pts[k].s);
  sctx.font = '400 10px JetBrains Mono, monospace'; sctx.textBaseline = 'middle';
  sctx.strokeStyle = 'rgba(120,220,230,.08)'; sctx.fillStyle = '#7a9ea6'; sctx.lineWidth = 1;
  const vstep = ymax - ymin > 60 ? 10 : 5;
  for (let v = Math.ceil(ymin / vstep) * vstep; v <= ymax; v += vstep) { sctx.beginPath(); sctx.moveTo(ml, Y(v)); sctx.lineTo(w - mr, Y(v)); sctx.stroke(); sctx.fillText(v === 0 ? '0 m' : (v > 0 ? '+' : '') + v + 'm', 6, Y(v)); }
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const step = nice.find(s => s / L * (w - ml - mr) >= 70) || 50000; sctx.textBaseline = 'top';
  for (let d = 0; d <= L; d += step) { sctx.beginPath(); sctx.moveTo(X(d), mt); sctx.lineTo(X(d), h - mb); sctx.stroke(); const lbl = d >= 1000 ? d / 1000 + 'km' : d + 'm'; sctx.fillText(lbl, Math.min(X(d) - 8, w - mr - lbl.length * 6.2), h - mb + 6); }
  // 물: 자료 기준면(0 m) 기준으로 그림. 예측 조위는 기준면 일치가 확인되지 않아 더하지 않는다.
  const phase = reduceMotion ? 0 : now / 1000 * 1.6, lam = Math.max(30, L / 25);
  const surf = d => S.hs / 2 * Math.sin(2 * Math.PI * d / lam - phase);
  sctx.beginPath(); sctx.moveTo(ml, Y(surf(0)));
  for (let x = ml; x <= w - mr; x += 2) sctx.lineTo(x, Y(surf((x - ml) / (w - ml - mr) * L)));
  sctx.lineTo(w - mr, Y(ymin)); sctx.lineTo(ml, Y(ymin)); sctx.closePath();
  const g = sctx.createLinearGradient(0, Y(0), 0, Y(ymin)); g.addColorStop(0, 'rgba(60,210,205,.30)'); g.addColorStop(1, 'rgba(8,44,64,.55)');
  sctx.fillStyle = g; sctx.fill();
  if (maxD > 4) {
    sctx.setLineDash([6, 5]); sctx.strokeStyle = 'rgba(255,120,110,.45)'; sctx.lineWidth = 1.2;
    for (const f of [1 / 3, 2 / 3]) { sctx.beginPath(); sctx.moveTo(ml, Y(-maxD * f)); sctx.lineTo(w - mr, Y(-maxD * f)); sctx.stroke(); }
    sctx.setLineDash([]);
    let deep = 0; zs.forEach((z, k) => { if (z < zs[deep]) deep = k; });
    sctx.font = '700 12px IBM Plex Sans KR, sans-serif'; sctx.textBaseline = 'middle'; sctx.fillStyle = 'rgba(213,236,238,.7)';
    const lx = clamp(xk(deep) - 14, ml + 4, w - mr - 36);
    [['상층', 1 / 6], ['중층', .5], ['하층', 5 / 6]].forEach(([t, f]) => sctx.fillText(t, lx, Y(-maxD * f)));
  }
  // 해저면 채움
  sctx.beginPath(); sctx.moveTo(xk(0), Y(zs[0]));
  for (let k = 1; k <= N; k++) { if (pts[k].land !== pts[k - 1].land) sctx.lineTo(xk(k), Y(zs[k - 1])); sctx.lineTo(xk(k), Y(zs[k])); }
  sctx.lineTo(xk(N), h - mb + 1); sctx.lineTo(xk(0), h - mb + 1); sctx.closePath();
  const gb = sctx.createLinearGradient(0, Y(0), 0, h); gb.addColorStop(0, '#20302c'); gb.addColorStop(1, '#0a1214'); sctx.fillStyle = gb; sctx.fill();
  // 육지 구간
  let k0 = null; const runs = [];
  for (let k = 0; k <= N + 1; k++) { const isL = k <= N && pts[k].land; if (isL && k0 === null) k0 = k; if (!isL && k0 !== null) { runs.push([k0, k - 1]); k0 = null; } }
  for (const [a, b] of runs) {
    const x1 = xk(a), x2 = xk(b);
    sctx.fillStyle = '#1c2622'; sctx.fillRect(x1, Y(landH), Math.max(1, x2 - x1), h - mb - Y(landH));
    sctx.save(); sctx.beginPath(); sctx.rect(x1, Y(landH), Math.max(1, x2 - x1), h - mb - Y(landH)); sctx.clip();
    sctx.strokeStyle = 'rgba(191,247,239,.08)'; sctx.lineWidth = 1;
    for (let x = x1 - h; x < x2 + h; x += 8) { sctx.beginPath(); sctx.moveTo(x, h); sctx.lineTo(x + h, 0); sctx.stroke(); }
    sctx.restore();
    if (x2 - x1 > 70) { sctx.fillStyle = '#7a9ea6'; sctx.font = '400 11px IBM Plex Sans KR, sans-serif'; sctx.textBaseline = 'top'; sctx.fillText('육지·구조물 (고도 자료 없음)', x1 + 6, Y(landH) + 6); }
  }
  // 해저면 선: 자료 출처별 스타일
  let seg = null;
  const flush = () => { if (!seg) return; sctx.globalAlpha = seg.st.a ?? 1; sctx.setLineDash(seg.st.dash); sctx.strokeStyle = seg.st.c; sctx.lineWidth = seg.st.w; sctx.stroke(); sctx.setLineDash([]); sctx.globalAlpha = 1; seg = null; };
  for (let k = 0; k <= N; k++) {
    const p = pts[k]; if (p.land) { flush(); continue; }
    const st = lineStyle(p.r), key = st.c + st.w + (st.a ?? 1) + st.dash.join();
    const x = xk(k), y = Y(zs[k]);
    if (!seg || seg.key !== key) { const prev = seg && seg.last; flush(); sctx.beginPath(); if (prev) sctx.moveTo(prev[0], prev[1]); else sctx.moveTo(x, y); seg = { key, st }; }
    sctx.lineTo(x, y); seg.last = [x, y];
  }
  flush();
  // 해안선에서 캐스팅 거리
  sctx.font = '600 10px JetBrains Mono, monospace'; sctx.textBaseline = 'bottom';
  cross.slice(0, 4).forEach(c => {
    const seaFwd = pts[c - 1].land && !pts[c].land, s0 = (pts[c].s + pts[c - 1].s) / 2;
    sctx.strokeStyle = '#ffb84d'; sctx.lineWidth = 2; sctx.beginPath(); sctx.moveTo(X(s0), Y(landH)); sctx.lineTo(X(s0), Y(S.hs / 2 + .8)); sctx.stroke();
    sctx.fillStyle = '#ffb84d'; sctx.fillText('해안선', clamp(X(s0) - 18, ml, w - mr - 40), Y(S.hs / 2 + .8) - 2);
    for (const m of [50, 100, 150]) {
      const s = seaFwd ? s0 + m : s0 - m; if (s < 0 || s > L) continue;
      const k = Math.round(s / L * N); if (pts[k].land) continue;
      const x = X(s); sctx.setLineDash([2, 4]); sctx.strokeStyle = 'rgba(255,184,77,.6)'; sctx.lineWidth = 1;
      sctx.beginPath(); sctx.moveTo(x, Y(0)); sctx.lineTo(x, Y(zs[k])); sctx.stroke(); sctx.setLineDash([]);
      sctx.fillStyle = 'rgba(255,184,77,.85)'; sctx.fillText(m + 'm', x - 12, Y(zs[k]) - 3);
    }
  });
  // 수면(자료 기준면 0 m 주변 파고)
  sctx.beginPath(); let on = false;
  for (let x = ml; x <= w - mr; x += 2) { const d = (x - ml) / (w - ml - mr) * L, k = Math.round(d / L * N); if (pts[k].land) { on = false; continue; } const y = Y(surf(d)); on ? sctx.lineTo(x, y) : sctx.moveTo(x, y); on = true; }
  sctx.strokeStyle = 'rgba(235,255,252,.85)'; sctx.lineWidth = 1.2; sctx.stroke();
  const vx = (L / (w - ml - mr)) / ((ymax - ymin) / (h - mt - mb));
  sctx.font = '400 10px JetBrains Mono, monospace'; sctx.textBaseline = 'top'; sctx.fillStyle = '#7a9ea6';
  sctx.fillText('수직 과장 ×' + (vx >= 10 ? vx.toFixed(0) : vx.toFixed(1)) + ' · 0 m = 자료 기준면', ml + 4, 5);
  sctx.fillStyle = '#ffb84d'; sctx.font = '600 11px JetBrains Mono, monospace'; sctx.fillText('A', ml - 12, 5); sctx.fillText('B', w - mr - 8, 5);
  if (S.secHover != null) {
    const k = Math.round(S.secHover * N), x = xk(k), p = pts[k];
    sctx.strokeStyle = 'rgba(255,255,255,.6)'; sctx.lineWidth = 1; sctx.beginPath(); sctx.moveTo(x, mt); sctx.lineTo(x, h - mb); sctx.stroke();
    const lines = ['A에서 ' + fmtD(p.s), p.land ? '육지·구조물' : '해안에서 ' + (p.dG >= 8000 ? '8 km+' : fmtD(p.dG))];
    if (!p.land) { const q = p.r; lines.push((q.type === 'est' ? '추정 수심 ' : '수심 ') + fmtDepth(q), '출처 ' + (q.type === 'est' ? '해안거리 추정' : DTYPES[q.type].label), '신뢰도 ' + q.conf); }
    const bw = 168, bh = 8 + lines.length * 15, bx = x + bw + 12 > w ? x - bw - 8 : x + 8;
    sctx.fillStyle = 'rgba(6,15,19,.92)'; sctx.fillRect(bx, mt + 4, bw, bh);
    sctx.font = '600 11px JetBrains Mono, monospace';
    lines.forEach((t, i) => { sctx.fillStyle = i === 2 ? '#4fe3d3' : '#d5ecee'; sctx.fillText(t, bx + 7, mt + 9 + i * 15); });
  }
}
const fmtD = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
