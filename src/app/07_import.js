// 07_import.js — 좌표 정규화, 수심 파일 불러오기, 이 브라우저에 저장
/* ── 좌표 정규화 (경위도 또는 평면직각좌표) ─────────── */
function toLatLon(a, b) {   // GeoJSON 순서 [x(lon), y(lat)]
  let lon = a, lat = b;
  if (Math.abs(a) > 1000 || Math.abs(b) > 1000) { const q = tmToLL(a, b); lat = q[0]; lon = q[1]; }
  else if (lat > 90 && lon < 90) [lat, lon] = [lon, lat];
  if (!(lat >= 32 && lat <= 39.5 && lon >= 123.5 && lon <= 132.5)) return null;
  return [lat, lon];
}
const DEPTH_KEYS = [/^수심$/, /^depth$/i, /^valsou$/i, /^valdco$/i, /^심도$/, /^drval1$/i, /^contour$/i, /^elevation$/i, /^z$/i, /수심/, /depth/i, /심도/];
function pickDepthKey(props) { const ks = Object.keys(props || {}); for (const re of DEPTH_KEYS) { const k = ks.find(x => re.test(x)); if (k) return k; } return null; }
function depthVal(props, key) {
  const v = num(props[key]); if (!isFinite(v)) return NaN;
  return /elevation|^z$/i.test(key) ? Math.abs(v) : Math.abs(v);  // 해저고도(음수)는 깊이(양수)로 바꿈
}
const pickKey = (o, res) => { const ks = Object.keys(o); for (const re of res) { const k = ks.find(x => re.test(x)); if (k) return k; } return null; };

/* ── 수심 자료 불러오기 ─────────────────────────────── */
function importDepthRows(rows, type) {
  const H = rows[0].map(h => h.trim()), L = locate(H, rows);
  const dc = findCol(H, DEPTH_KEYS);
  if (L.wkt < 0 && (L.la < 0 || L.lo < 0) && (L.xc < 0 || L.yc < 0)) return { ok: 0, msg: '위도·경도 열을 찾지 못했습니다. 머리글: ' + H.slice(0, 10).join(', ') };
  if (dc < 0) return { ok: 0, msg: '수심 열을 찾지 못했습니다. 머리글: ' + H.slice(0, 10).join(', ') };
  const sc = findCol(H, [/^source$/i, /출처/]), rc = findCol(H, [/^resolution$/i, /해상도/]), yc = findCol(H, [/조사년도|연도|year/i]);
  let ok = 0, bad = 0, full = false;
  for (const r of rows.slice(1)) {
    const ll = getLL(r, L), d = Math.abs(num(r[dc]));
    if (!ll || !isFinite(d)) { bad++; continue; }
    const res = rc >= 0 && isFinite(num(r[rc])) ? num(r[rc]) : DTYPES[type].res;
    if (!addDepthPt(type, mxOf(ll[1]), myOf(ll[0]), d, res, sc >= 0 ? r[sc] : '', yc >= 0 ? r[yc] : '')) { full = true; break; }
    ok++;
  }
  return { ok, msg: ok ? `${DTYPES[type].label} 수심 ${ok.toLocaleString()}점을 불러왔습니다 (열: ${H[dc]})` + (bad ? `, ${bad}건 제외` : '') + (full ? `. 최대 ${MAX_PTS.toLocaleString()}점에서 멈췄습니다` : '') : '불러온 수심점이 없습니다.' };
}
function importDepthJSON(obj, type) {
  const res0 = DTYPES[type].res;
  let ok = 0, lines = 0, bad = 0, keyUsed = null, full = false;
  const add = (lat, lon, d, res, src, yr) => { if (!addDepthPt(type, mxOf(lon), myOf(lat), d, res, src, yr)) { full = true; return false; } ok++; return true; };
  const sampleLine = (coords, d, res, src, yr) => {   // 등심선: 자료 해상도 간격으로만 샘플링
    lines++; const step = Math.max(10, res);
    let carry = 0;
    for (let i = 0; i < coords.length - 1 && !full; i++) {
      const a = toLatLon(coords[i][0], coords[i][1]), b = toLatLon(coords[i + 1][0], coords[i + 1][1]); if (!a || !b) { bad++; continue; }
      const segG = Math.hypot((b[0] - a[0]) * 111000, (b[1] - a[1]) * 111000 * Math.cos(a[0] * D2R));
      let t = carry; while (t <= segG) { const f = segG ? t / segG : 0; if (!add(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, d, res, src, yr)) break; t += step; }
      carry = t - segG;
    }
  };
  const handle = (g, props) => {
    if (!g || full) return;
    const key = pickDepthKey(props); keyUsed = keyUsed || key;
    let d = key ? depthVal(props, key) : NaN;
    const res = isFinite(num(props && (props.resolution ?? props['해상도']))) ? num(props.resolution ?? props['해상도']) : res0;
    const src = props && (props.source || props['출처']) || '', yr = props && (props['조사년도'] || props.year) || '';
    const pt = c => { const dd = isFinite(d) ? d : (c.length > 2 && isFinite(c[2]) ? Math.abs(c[2]) : NaN); const ll = toLatLon(c[0], c[1]); if (!ll || !isFinite(dd)) { bad++; return; } add(ll[0], ll[1], dd, res, src, yr); };
    if (g.type === 'Point') pt(g.coordinates);
    else if (g.type === 'MultiPoint') g.coordinates.forEach(pt);
    else if (g.type === 'LineString') { if (isFinite(d)) sampleLine(g.coordinates, d, res, src, yr); else bad++; }
    else if (g.type === 'MultiLineString') { if (isFinite(d)) g.coordinates.forEach(c => sampleLine(c, d, res, src, yr)); else bad++; }
    else if (g.type === 'GeometryCollection') g.geometries.forEach(x => handle(x, props));
    else bad++;
  };
  if (obj.type === 'FeatureCollection') obj.features.forEach(f => handle(f.geometry, f.properties || {}));
  else if (obj.type === 'Feature') handle(obj.geometry, obj.properties || {});
  else {
    const recs = findRecords(obj);
    if (!recs.length) return { ok: 0, msg: 'GeoJSON(FeatureCollection)도, 위도·경도·수심을 가진 목록도 아닙니다.' };
    const r0 = recs[0], la = pickKey(r0, [/^lat(itude)?$/i, /위도/, /lat/i]), lo = pickKey(r0, [/^(lon|lng|longitude)$/i, /경도/, /lon|lng/i]), dk = pickDepthKey(r0);
    if (!la || !lo || !dk) return { ok: 0, msg: '목록에서 위도·경도·수심 항목을 찾지 못했습니다. 항목: ' + Object.keys(r0).slice(0, 10).join(', ') };
    keyUsed = dk;
    for (const r of recs) { const ll = toLatLon(num(r[lo]), num(r[la])), d = depthVal(r, dk); if (!ll || !isFinite(d)) { bad++; continue; } if (!add(ll[0], ll[1], d, res0, r.source || '', '')) break; }
  }
  return { ok, msg: ok ? `${DTYPES[type].label} 수심 ${ok.toLocaleString()}점을 불러왔습니다` + (lines ? ` (등심선 ${lines}개를 약 ${Math.max(10, res0)} m 간격으로 샘플링)` : '') + (keyUsed ? `, 수심 속성: ${keyUsed}` : '') + (bad ? `, ${bad}건 제외` : '') + (full ? `. 최대 ${MAX_PTS.toLocaleString()}점에서 멈췄습니다` : '')
    : '불러온 수심점이 없습니다. 수심 속성(수심, depth, VALSOU, VALDCO 등)과 좌표를 확인하세요.' };
}
function findRecords(o, depth = 0) {   // JSON 안에서 객체 배열을 찾음 (공공데이터포털 response.body.items.item 형태 포함)
  if (depth > 6 || o == null) return [];
  if (Array.isArray(o)) { if (o.length && typeof o[0] === 'object' && !Array.isArray(o[0])) return o; for (const x of o) { const r = findRecords(x, depth + 1); if (r.length) return r; } return []; }
  if (typeof o === 'object') { for (const k of Object.keys(o)) { const v = o[k]; if (k === 'item' && v && typeof v === 'object' && !Array.isArray(v)) return [v]; const r = findRecords(v, depth + 1); if (r.length) return r; } }
  return [];
}
function importStructJSON(obj) {
  let n = 0, bad = 0;
  const conv = cs => cs.map(c => toLatLon(c[0], c[1])).filter(Boolean).map(([la, lo]) => [mxOf(lo), myOf(la)]);
  const h = g => {
    if (!g) return;
    if (g.type === 'LineString') { const p = conv(g.coordinates); if (p.length > 1) { addStructLine(p, false); n++; } else bad++; }
    else if (g.type === 'MultiLineString') g.coordinates.forEach(c => h({ type: 'LineString', coordinates: c }));
    else if (g.type === 'Polygon') { const p = conv(g.coordinates[0]); if (p.length > 2) { addStructLine(p, true); n++; } else bad++; }
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(c => h({ type: 'Polygon', coordinates: c }));
    else if (g.type === 'GeometryCollection') g.geometries.forEach(h);
  };
  const fs = obj.type === 'FeatureCollection' ? obj.features : obj.type === 'Feature' ? [obj] : [];
  fs.forEach(f => h(f.geometry));
  return { ok: n, msg: n ? `해안 구조물 ${n}개(선·면)를 불러왔습니다` + (bad ? `, ${bad}개 제외` : '') + '. 지도와 단면에서 육지(구조물)로 처리합니다.' : 'GeoJSON에서 선(LineString)이나 면(Polygon)을 찾지 못했습니다.' };
}

/* ── 저장 (이 브라우저에만) ──────────────────────────── */
function saveDepth() {
  try {
    const o = {}; for (const t of DORDER) { const L = LAYERS[t]; if (L && L.n && L.n <= 150000) o[t] = L.d.map((d, i) => [+latOf(L.my[i]).toFixed(6), +lonOf(L.mx[i]).toFixed(6), d, L.res[i], L.src[i]]); }
    localStorage.setItem('ps_depth2', JSON.stringify(o));
  } catch (e) {}
  try {
    const conv = r => Array.from({ length: r.n }, (_, i) => [+lonOf(r.xs[i]).toFixed(6), +latOf(r.ys[i]).toFixed(6)]);
    localStorage.setItem('ps_struct', JSON.stringify({ l: STRUCT.lines.filter(r => !r.base).map(conv), p: STRUCT.polys.filter(r => !r.base).map(conv) }));
  } catch (e) {}
}
function loadDepth() {
  try {
    const o = JSON.parse(localStorage.getItem('ps_depth2') || '{}');
    for (const t of DORDER) for (const [la, lo, d, res, src] of (o[t] || [])) addDepthPt(t, mxOf(lo), myOf(la), d, res, src, '');
    const old = JSON.parse(localStorage.getItem('ps_sound') || '[]');     // 이전 버전의 실측 기록
    for (const [la, lo, d] of old) addDepthPt('survey', mxOf(lo), myOf(la), d, 10, '이전 버전 실측', '');
    if (old.length) { localStorage.removeItem('ps_sound'); saveDepth(); }
  } catch (e) {}
  try {
    const s = JSON.parse(localStorage.getItem('ps_struct') || 'null');
    if (s) { const m = a => a.map(([lo, la]) => [mxOf(lo), myOf(la)]); s.l.forEach(a => addStructLine(m(a), false)); s.p.forEach(a => addStructLine(m(a), true)); }
  } catch (e) {}
}
