// 09_rocks.js — 낚시 제한구역과 갯바위 포인트
/* ── 낚시 제한구역 (국립해양조사원 전자해도 제한구역, 2024.11.30 제작분) — 그리지 않고, 안에 있는 포인트만 뺀다 ─ */
const BAN = BAN_AREAS.map(r => ({ r, x1: Math.min(...r.map(p => p[0])), x2: Math.max(...r.map(p => p[0])), y1: Math.min(...r.map(p => p[1])), y2: Math.max(...r.map(p => p[1])) }));
function inBan(lat, lon) {
  for (const b of BAN) {
    if (lon < b.x1 || lon > b.x2 || lat < b.y1 || lat > b.y2) continue;
    let c = false; const r = b.r;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > lat) !== (r[j][1] > lat) && lon < (r[j][0] - r[i][0]) * (lat - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
    if (c) return true;
  }
  return false;
}
/* ── 갯바위 낚시 포인트 (해양수산부 공동활용체계 자료) ───
   접근성: 가장 가까운 해안선이 본토·큰 섬·연륙교로 이어진 섬이면 "차량·도보", 확인 못 한 섬은 "확인 필요", 그 밖의 섬은 "배로만". */
const ROCKS = [];
const ACC_CAR = new Set(ACCESS.car), ACC_UNK = new Set(ACCESS.unk);
function nearestRing(mx, my, maxR) {
  const gx = Math.floor(mx / CS), gy = Math.floor(my / CS), maxRing = Math.ceil(maxR / CS);
  let best = Infinity, bi = -1;
  for (let r = 0; r <= maxRing; r++) {
    if ((r - 1) * CS > best) break;
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const a = segIdx.get((gx + dx) * 100000 + gy + dy); if (!a) continue;
      for (const i of a) { const d = segDist(mx, my, i); if (d < best) { best = d; bi = i; } }
    }
  }
  return bi >= 0 && best <= maxR ? SEG_RING[bi] : -1;
}
function accessAt(mx, my) {
  const ring = nearestRing(mx, my, 3000 * kAt(latOf(my)));
  return ring < 0 ? 'unk' : ACC_CAR.has(ring) ? 'car' : ACC_UNK.has(ring) ? 'unk' : 'boat';
}
const ACC_NAME = { car: '차량·도보 접근', unk: '접근 확인 필요', boat: '배로만 접근' };
function addRock(o) {
  const mx = mxOf(o.lon), my = myOf(o.lat);
  ROCKS.push({ kind: 'rock', type: '갯바위', ...o, mx, my, access: accessAt(mx, my), banned: inBan(o.lat, o.lon) });
}
function importRocks(rows) {
  const H = rows[0].map(h => h.trim()), L = locate(H, rows);
  const nm = findCol(H, [/포인트명/, /명칭/, /^name$/i]);
  if (nm < 0) return { ok: 0, msg: '포인트 이름 열을 찾지 못했습니다. 머리글: ' + H.slice(0, 12).join(', ') };
  if (L.wkt < 0 && (L.la < 0 || L.lo < 0) && (L.xc < 0 || L.yc < 0)) return { ok: 0, msg: '위도·경도 열을 찾지 못했습니다. 머리글: ' + H.slice(0, 12).join(', ') };
  const col = res => findCol(H, res);
  const rg = col([/지역명/, /지역/]), dp = col([/수심/]), tg = col([/주요.*어종|대상어|어종/]), td = col([/조석|물때/]), me = col([/방법|채비|낚시법/]), ad = col([/행정구역/]);
  let ok = 0, bad = 0; const seen = new Set(ROCKS.map(r => r.name + '|' + r.lat.toFixed(4)));
  for (const r of rows.slice(1)) {
    const ll = getLL(r, L), name = (r[nm] || '').trim();
    if (!ll || !name) { bad++; continue; }
    const key = name + '|' + ll[0].toFixed(4); if (seen.has(key)) continue; seen.add(key);
    addRock({ name, lat: ll[0], lon: ll[1], area: rg >= 0 ? r[rg].trim() : '', depth: dp >= 0 ? r[dp].trim() : '', targets: tg >= 0 ? r[tg].trim() : '', tide: td >= 0 ? r[td].trim() : '', method: me >= 0 ? r[me].trim() : '', addr: ad >= 0 ? r[ad].trim() : '' });
    ok++;
  }
  const c = { car: 0, unk: 0, boat: 0 }; ROCKS.forEach(r => c[r.access]++); const nb = ROCKS.filter(r => r.banned).length;
  return { ok, msg: ok ? `갯바위 포인트 ${ok.toLocaleString()}곳을 불러왔습니다 (차량·도보 ${c.car}, 확인 필요 ${c.unk}, 배로만 ${c.boat}` + (nb ? `, 제한구역 안이라 뺀 곳 ${nb}` : '') + ')' + (bad ? `, 좌표 없음 ${bad}건 제외` : '') + `. 위도 열: ${H[L.la] || '-'}, 경도 열: ${H[L.lo] || '-'}` : '불러온 포인트가 없습니다. 첫 줄 값: ' + (rows[1] || []).slice(0, 8).join(' | ') };
}
function saveRocks() { try { localStorage.setItem('ps_rocks', JSON.stringify(ROCKS.map(r => [r.name, r.lat, r.lon, r.area, r.depth, r.targets, r.tide, r.method, r.addr]))); } catch (e) {} }
function loadRocks() {
  const seen = new Set();
  const put = a => { const [name, lat, lon, area, depth, targets, tide, method, addr] = a; const k = name + '|' + (+lat).toFixed(4); if (seen.has(k)) return; seen.add(k); addRock({ name, lat: +lat, lon: +lon, area, depth, targets, tide, method, addr }); };
  (typeof BASE_ROCKS !== 'undefined' ? BASE_ROCKS : []).forEach(put);
  try { JSON.parse(localStorage.getItem('ps_rocks') || '[]').forEach(put); } catch (e) {}
}
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function rockInfoHTML(p) {
  const rows = [['접근', ACC_NAME[p.access]], ['지역', p.area || p.addr], ['수심 범위 (자료)', p.depth], ['주요 대상어 (자료)', p.targets], ['조석 (자료)', p.tide], ['낚시 방법 (자료)', p.method]].filter(r => r[1]);
  return `<dl class="rock">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}
