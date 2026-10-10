// 23_main.js — 예시 단면, 시작 처리, 매 프레임 갱신
/* ── 예시 단면: 강릉 북쪽 동해안의 한 지점에서 바다 방향 ─── */
function exampleSection(lon, lat) {
  const tx = mxOf(lon), ty = myOf(lat); let best = Infinity, br = null, bi = 0;
  for (const r of LOD.full) for (let i = 1; i < r.n - 1; i++) { const d = Math.hypot(r.xs[i] - tx, r.ys[i] - ty); if (d < best) { best = d; br = r; bi = i; } }
  const vx = br.xs[bi], vy = br.ys[bi], k = kAt(latOf(vy));
  let nx = -(br.ys[bi + 1] - br.ys[bi - 1]), ny = br.xs[bi + 1] - br.xs[bi - 1]; const nl = Math.hypot(nx, ny); nx /= nl; ny /= nl;
  if (inLand(vx + nx * 30 * k, vy + ny * 30 * k)) { nx = -nx; ny = -ny; }
  S.A = [vx - nx * 80 * k, vy - ny * 80 * k]; S.B = [vx + nx * 450 * k, vy + ny * 450 * k];
  analyzeSection();
}

$('portFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f, 'port'); e.target.value = ''; });
$('depthFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f, 'depth'); e.target.value = ''; });
$('clearData').addEventListener('click', clearData);
stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drop'); });
stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
stage.addEventListener('drop', e => { e.preventDefault(); stage.classList.remove('drop'); for (const f of e.dataTransfer.files) handleFile(f); });
decodeOSM(); loadLocal(); loadDepth(); loadRocks(); updateDataCount();
$('rockFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f, 'rock'); e.target.value = ''; });
$('showBoat').addEventListener('change', e => { S.showBoat = e.target.checked; const nm = POINTS[S.pt] && POINTS[S.pt].name; buildPoints(); selectPoint(Math.max(0, POINTS.findIndex(p => p.name === nm)), false); dirty = true; });
const bc = $('biteChart'), bcx = bc.getContext('2d');
function drawBiteChart() {
  if (!BITE_H) return;
  const r = DPR(), w = bc.clientWidth, h = 120; if (!w) return;
  if (bc.width !== Math.round(w * r)) { bc.width = Math.round(w * r); bc.height = Math.round(h * r); }
  bcx.setTransform(r, 0, 0, r, 0, 0); bcx.clearRect(0, 0, w, h);
  const ml = 8, mr = 8, mt = 24, mb = 18, X = t => ml + t / 24 * (w - ml - mr), Y = p => mt + (1 - p / 100) * (h - mt - mb);
  const { sr, ss, best } = BITE_H;
  bcx.fillStyle = '#04090c'; bcx.fillRect(0, 0, w, h);
  bcx.fillStyle = 'rgba(255,184,77,.06)'; bcx.fillRect(X(sr), mt, X(ss) - X(sr), h - mt - mb);
  bcx.strokeStyle = 'rgba(120,220,230,.14)'; bcx.lineWidth = 1; bcx.setLineDash([3, 3]);
  for (const p of [40, 60]) { bcx.beginPath(); bcx.moveTo(ml, Y(p)); bcx.lineTo(w - mr, Y(p)); bcx.stroke(); }
  bcx.setLineDash([]);
  const bw = (w - ml - mr) / 24;
  best.forEach((b, i) => { const p = b ? b.p : 0; bcx.fillStyle = p >= 60 ? '#5ff0a8' : p >= 40 ? '#ffb84d' : '#2f5560'; bcx.fillRect(X(i) + 1, Y(p), Math.max(1, bw - 2), h - mb - Y(p)); });
  const st = STATIONS[S.st], lo = st.minCm, hi = st.maxCm;
  bcx.beginPath();
  for (let i = 0; i <= 96; i++) { const t = i / 4, c = tideAt(st, S.day * 24 + t).cm, y = mt + (hi - c) / Math.max(1, hi - lo) * (h - mt - mb); i ? bcx.lineTo(X(t), y) : bcx.moveTo(X(t), y); }
  bcx.strokeStyle = 'rgba(79,227,211,.75)'; bcx.lineWidth = 1.4; bcx.stroke();
  bcx.font = '400 9.5px JetBrains Mono, monospace'; bcx.fillStyle = '#7a9ea6'; bcx.textBaseline = 'top';
  for (let t = 0; t <= 24; t += 6) bcx.fillText(String(t).padStart(2, '0'), clamp(X(t) - 6, 0, w - 14), h - mb + 4);
  const x = X(S.t), b = best[Math.floor(S.t)];
  bcx.strokeStyle = '#fff'; bcx.lineWidth = 1.5; bcx.beginPath(); bcx.moveTo(x, mt - 4); bcx.lineTo(x, h - mb); bcx.stroke();
  bcx.fillStyle = '#fff'; bcx.beginPath(); bcx.arc(x, h - mb, 6, 0, 7); bcx.fill();
  const label = `${fmtH(S.t)} · ${b ? b.n + ' ' + b.p + '점' : ''}`;
  bcx.font = '600 11px JetBrains Mono, monospace';
  const lw = bcx.measureText(label).width + 12, lx = clamp(x - lw / 2, 0, w - lw);
  bcx.fillStyle = 'rgba(6,15,19,.92)'; bcx.fillRect(lx, 2, lw, 18); bcx.fillStyle = '#d5ecee'; bcx.fillText(label, lx + 6, 5);
}
bc.addEventListener('pointerdown', e => {
  const set = ev => { const b = bc.getBoundingClientRect(); S.t = clamp((ev.clientX - b.left - 8) / (b.width - 16) * 24, 0, 23.99); $('tIn').value = S.t; };
  bc.setPointerCapture(e.pointerId); set(e);
  bc.onpointermove = ev => { if (bc.hasPointerCapture(ev.pointerId)) set(ev); };
});
$('structFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f, 'struct'); e.target.value = ''; });
apiLoad(); if (!$('pMinLat').options.length) apiParams();
$('apiUrl').addEventListener('input', () => { apiParams(); apiSave(); });
for (const id of ['apiKey', 'apiProxy', 'pMinLat', 'pMaxLat', 'pMinLon', 'pMaxLon']) $(id).addEventListener('change', apiSave);
$('apiGo').addEventListener('click', apiLoadViewport);
let apiTimer = null;
function apiAutoKick() { if (!$('apiAuto').checked) return; clearTimeout(apiTimer); apiTimer = setTimeout(apiLoadViewport, 900); }
$('copyOverpass').addEventListener('click', () => { const t = $('overpassQ').textContent; navigator.clipboard && navigator.clipboard.writeText(t).then(() => { $('copyOverpass').textContent = '복사됨'; }, () => { const r = document.createRange(); r.selectNodeContents($('overpassQ')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }); });

new ResizeObserver(() => { if (stage.clientWidth !== cw) resize(); }).observe(stage);
resize();
loadGebco();
loadCrnt();
fitLonLat([124.4, 32.9, 131.95, 38.7]);
buildPoints();
{ const z = { lat: 37.9, lon: 128.83 }; let bi = 0, bd = Infinity; POINTS.forEach((p, i) => { const d = gdist(p, z); if (d < bd) { bd = d; bi = i; } }); selectPoint(bi, false); }
exampleSection(128.93, 37.80);

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (S.playing) S.t = (S.t + dt * .7) % 24;
  for (const id of ['tIn', 'tIn2']) { const el = $(id); if (document.activeElement !== el && Math.abs(el.value - S.t) > .01) el.value = S.t; }
  const tide = getTide();
  if (Math.floor(S.t) !== biteHour) renderBite();
  if (TAB === 'map' || TAB === 'today') {               // 보이는 탭만 그린다 (휴대폰 전지 절약). 오늘 탭에도 지도가 있다
    if (dirty) { renderBase(); dirtyHover = true; apiAutoKick(); }
    setText('clock2', fmtH(S.t));
    updateHover(); drawUI(); drawCrnt(tide); stepParticles(tide, dt); drawSection(now, tide);
  }
  updateReadouts(tide);
  if (TAB === 'tide') drawTideChart(tide);
  if (TAB === 'bite') drawBiteChart();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
