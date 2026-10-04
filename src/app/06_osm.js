// 06_osm.js — 오픈스트리트맵 해안 지형·이름
/* ── 오픈스트리트맵 해안 지형 (© OpenStreetMap 기여자, ODbL · 2026-10-03 내려받음) ───
   방파제·도류제·부두·안벽은 구조물 층(육지 취급)으로, 해변·암반·갯벌·암초 등은 그림과 커서 정보로 쓴다. */
const OSM = { list: [], lab: [] };
let PORT_NAMES = new Set();
const OSM_STRUCT = new Set(['bw', 'gr', 'pi', 'qu']);
const OSM_NAME = { bw: '방파제', gr: '도류제', pi: '부두·잔교', qu: '안벽', be: '해변', br: '암반·갯바위', cl: '절벽', rf: '암초', sh: '여울·사주', tf: '갯벌 (간조 때 드러남)', sm: '염습지', hb: '항만 구역', ma: '마리나', sl: '선착장 경사로', lh: '등대', hn: '항', hu: '이름 미확인 포구', dk: '방조제', bm: '다리', bd: '다리', bf: '보행 다리', bt: '철도 다리' };
function decodeOSM() {
  if (typeof OSMF === 'undefined') return;
  PORT_NAMES = new Set(BASE_PORTS.map(p => String(p[0]).replace(/\s/g, '')));
  for (const [c, ty, name, rings] of OSMF) {
    const R = rings.map(r => { let x = 12400000, y = 3300000; const n = r.length / 2, xs = new Float64Array(n), ys = new Float64Array(n);
      for (let i = 0; i < n; i++) { x += r[2 * i]; y += r[2 * i + 1]; xs[i] = mxOf(x / 1e5); ys[i] = myOf(y / 1e5); } return { xs, ys, n }; });
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const r of R) for (let i = 0; i < r.n; i++) { if (r.xs[i] < minx) minx = r.xs[i]; if (r.xs[i] > maxx) maxx = r.xs[i]; if (r.ys[i] < miny) miny = r.ys[i]; if (r.ys[i] > maxy) maxy = r.ys[i]; }
    OSM.list.push({ c, t: ty, name, R, minx, maxx, miny, maxy });
    if (OSM_STRUCT.has(c) && ty > 0) {
      const toPts = r => Array.from({ length: r.n }, (_, i) => [r.xs[i], r.ys[i]]);
      if (ty === 2) addStructLine(toPts(R[0]), true, true); else R.forEach(r => addStructLine(toPts(r), false, true));
    }
  }
  OSM.lab = OSM.list.slice().sort((a, b) => (LAB_PRI[a.c] ?? 5) - (LAB_PRI[b.c] ?? 5));
}
const LAB_PRI = { dk: 0, hn: 1, hb: 2, ma: 2, pi: 2, is: 3, lh: 4, il: 6, hu: 7 };
function osmPath(pred, margin, close) {
  const p = new Path2D(), [vx1, vy1] = toM(-margin, ch + margin), [vx2, vy2] = toM(cw + margin, -margin); let any = false;
  for (const o of OSM.list) {
    if (!pred(o) || o.maxx < vx1 || o.minx > vx2 || o.maxy < vy1 || o.miny > vy2) continue;
    for (const r of o.R) { for (let i = 0; i < r.n; i++) { const [x, y] = toS(r.xs[i], r.ys[i]); i ? p.lineTo(x, y) : p.moveTo(x, y); } if (close) p.closePath(); }
    any = true;
  }
  return any ? p : null;
}
function drawOSM(stage, gpp, TER) {
  if (!OSM.list.length || gpp > (stage === 'under' ? 90 : 400)) return;
  const g = bctx, fillP = (pred, fill, stroke, lw, dash) => { const p = osmPath(o => o.t === 2 && pred(o), 4, true); if (!p) return; if (fill) { g.fillStyle = fill; g.fill(p, 'evenodd'); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.setLineDash(dash || []); g.stroke(p); g.setLineDash([]); } };
  if (stage === 'under') {
    fillP(o => o.c === 'tf', 'rgba(150,128,92,.62)', gpp < 15 ? 'rgba(190,170,130,.5)' : null, .8);
    fillP(o => o.c === 'sm', 'rgba(112,138,88,.62)', null);
    fillP(o => o.c === 'rf' || o.c === 'sh', 'rgba(214,198,150,.38)', 'rgba(240,226,180,.7)', 1, [3, 3]);
    if (gpp < 60) {
      fillP(o => o.c === 'be', TER ? '#dcc994' : 'rgba(220,201,148,.85)', 'rgba(255,240,200,.5)', .6);
      fillP(o => o.c === 'br', TER ? '#8e7f6b' : 'rgba(142,127,107,.9)', 'rgba(70,58,46,.8)', .7);
    }
    if (gpp < 30) fillP(o => o.c === 'hb', null, 'rgba(255,208,138,.55)', 1, [5, 4]);
    if (gpp < 30) fillP(o => o.c === 'ma', 'rgba(79,227,211,.12)', 'rgba(79,227,211,.6)', 1);
    return;
  }
  // over: 절벽, 경사로, 등대, 이름
  if (gpp < 60) {
    const cl = osmPath(o => o.c === 'cl' && o.t === 1, 4, false);
    if (cl) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 3.5; g.stroke(cl); g.strokeStyle = '#5a4430'; g.lineWidth = 2; g.stroke(cl); }
    const cp = osmPath(o => o.c === 'cl' && o.t === 2, 4, true); if (cp) { g.strokeStyle = '#5a4430'; g.lineWidth = 1.5; g.stroke(cp); }
  }
  if (gpp < 20) { const sl = osmPath(o => o.c === 'sl', 4, false); if (sl) { g.strokeStyle = '#cfd6d4'; g.lineWidth = 2; g.stroke(sl); } }
  // 다리: 바다·간척호를 건너는 것만 (오픈스트리트맵)
  if (gpp < 400) {
    const z = gpp < 20 ? 1.6 : gpp < 80 ? 1.2 : 1;
    const draw = (cat, w, col, dash) => { const p = osmPath(o => o.c === cat, 8, false); if (!p) return; g.lineCap = 'butt'; g.strokeStyle = 'rgba(15,20,22,.85)'; g.lineWidth = (w + 2) * z; g.stroke(p); g.strokeStyle = col; g.lineWidth = w * z; g.setLineDash(dash || []); g.stroke(p); g.setLineDash([]); g.lineCap = 'round'; };
    if (gpp < 60) draw('bf', 1.6, '#d9dfe0');
    draw('bt', 2.2, '#9aa3a6', [6 * z, 4 * z]);
    draw('bd', 2.6, '#eef1f1');
    draw('bm', 3.4, '#f2dca0');
  }
  const placed = [];
  g.textBaseline = 'middle';
  for (const o of OSM.lab) {
    const harb = o.name && (o.c === 'hb' || o.c === 'ma' || (o.c === 'pi' && /항|선착장|부두|나루|포구|터미널/.test(o.name))) && !PORT_NAMES.has(o.name.replace(/\s/g, ''));
    const isl = o.c === 'is' || o.c === 'il', hn = o.c === 'hn', hu = o.c === 'hu', dk = o.c === 'dk';
    const showName = !!o.name && (gpp < 6 || ((o.c === 'bm' || o.c === 'bd') && gpp < 12) || (harb && gpp < 25) || (o.c === 'is' && gpp < 60) || (o.c === 'il' && gpp < 10) || (hn && S.layers.port && gpp < 25) || (hu && S.layers.port && gpp < 10) || (dk && gpp < 120));
    const showDot = o.t === 0 && ((o.c === 'lh' && gpp < 120) || (o.c === 'ma' && gpp < 25) || (o.c === 'be' && gpp < 25) || (o.c === 'cl' && gpp < 25) || (o.c === 'rf' && gpp < 25) || (o.c === 'br' && gpp < 25));
    if (!showName && !showDot) continue;
    if (isl && !showName) continue;
    const r = o.R[0]; let cx = 0, cy = 0; for (let i = 0; i < r.n; i++) { cx += r.xs[i]; cy += r.ys[i]; } const [x, y] = toS(cx / r.n, cy / r.n);
    if (x < -20 || y < -20 || x > cw + 20 || y > ch + 20) continue;
    if (showDot) {
      if (o.c === 'lh') { g.fillStyle = '#fff'; g.strokeStyle = '#e0483a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, gpp < 20 ? 4 : 3, 0, 7); g.fill(); g.stroke(); }
      else { g.fillStyle = o.c === 'ma' ? '#4fe3d3' : o.c === 'be' ? '#dcc994' : '#8e7f6b'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    }
    if (showName) {
      if (hn) drawIcon(g, 'port', x, y, 14);
      if (hu) drawIcon(g, 'port', x, y, 11, .7);
      if (dk) { g.fillStyle = '#e8dcb8'; g.fillRect(x - 6, y - 1.5, 12, 3); }
      if (harb && !showDot) drawIcon(g, 'port', x, y, 14);
      const label = hu ? o.name + ' 앞 포구*' : o.name;   // 이름은 아이콘 아래에 쓴다
      g.font = hu ? 'italic 500 10.5px IBM Plex Sans KR, sans-serif' : dk ? '700 11.5px IBM Plex Sans KR, sans-serif' : hn ? '500 11px IBM Plex Sans KR, sans-serif' : isl ? (o.c === 'is' ? 'italic 600 12px' : 'italic 500 10.5px') + ' IBM Plex Sans KR, sans-serif' : harb ? '500 11px IBM Plex Sans KR, sans-serif' : '500 11px IBM Plex Sans KR, sans-serif'; const w = g.measureText(label).width, box = [x - w / 2 - 2, y + 4, x + w / 2 + 2, y + 18];
      if (placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue; placed.push(box);
      g.lineWidth = 3; g.strokeStyle = 'rgba(6,15,19,.85)'; g.strokeText(label, x - w / 2, y + 11); g.fillStyle = hu ? '#b9c6c8' : dk ? '#efe3bf' : hn ? '#ffe2b0' : isl ? '#e4f1d6' : harb ? '#ffe2b0' : o.c === 'lh' ? '#ffd0c8' : OSM_STRUCT.has(o.c) ? '#e8eeee' : '#f3e6c4'; g.fillText(label, x - w / 2, y + 11);
    }
  }
}
function osmAt(mx, my) {   // 커서 위치의 OSM 면 (가장 작은 것)
  let best = null, ba = Infinity;
  for (const o of OSM.list) {
    if (o.t !== 2 || mx < o.minx || mx > o.maxx || my < o.miny || my > o.maxy) continue;
    let inside = false; for (const r of o.R) for (let i = 0, j = r.n - 1; i < r.n; j = i++) if ((r.ys[i] > my) !== (r.ys[j] > my) && mx < (r.xs[j] - r.xs[i]) * (my - r.ys[i]) / (r.ys[j] - r.ys[i]) + r.xs[i]) inside = !inside;
    const a = (o.maxx - o.minx) * (o.maxy - o.miny); if (inside && a < ba) { ba = a; best = o; }
  }
  return best;
}
