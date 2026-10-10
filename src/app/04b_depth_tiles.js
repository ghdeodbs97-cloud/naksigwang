// 04b_depth_tiles.js — 지도 표현과 분리한 공식 수심 지역 자료 로더
const OFFICIAL_DEPTH = { manifest: null, init: null, cache: new Map(), signature: '', generation: 0,
  maxTiles: 12, maxPoints: 60000, maxBytes: 8 * 1024 * 1024, error: '', timer: null };
const OFFICIAL_TYPES = { coastal_official: 'coastal', mof_contour: 'mof', chart_public: 'chart', bada: 'bada' };
async function depthReadJSON(url, limit) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: url.endsWith('manifest.json') ? 'no-cache' : 'default' });
    if (!response.ok) throw Error('수심 자료 HTTP ' + response.status);
    const reader = response.body.getReader(), chunks = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw Error('수심 자료 크기 제한'); }
      chunks.push(value);
    }
    const buf = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { buf.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder().decode(buf));
  } finally { clearTimeout(timeout); }
}
async function depthManifest() {
  if (!OFFICIAL_DEPTH.init) OFFICIAL_DEPTH.init = (async () => {
    try {
      const m = await depthReadJSON('static/depth/manifest.json', 1024 * 1024);
      if (m.version !== 1 || !Array.isArray(m.tiles) || !Array.isArray(m.datasets)) throw Error('수심 목록 형식');
      const datasetIds = new Set(), files = new Set();
      for (const ds of m.datasets) {
        if (!OFFICIAL_TYPES[ds.sourceType] || typeof ds.id !== 'string' || !ds.id || datasetIds.has(ds.id) || typeof ds.source !== 'string' || !ds.source ||
          !Number.isFinite(ds.resolution) || !(ds.resolution > 0 && ds.resolution <= 1000) || typeof ds.verticalDatum !== 'string' || !ds.verticalDatum) throw Error('수심 출처 정보');
        datasetIds.add(ds.id);
      }
      for (const t of m.tiles) {
        if (!/^[a-zA-Z0-9_/-]+\.json$/.test(t.file) || t.file.includes('..') || files.has(t.file) || !Array.isArray(t.bbox) || t.bbox.length !== 4 || !t.bbox.every(Number.isFinite) ||
          t.bbox[0] > t.bbox[2] || t.bbox[1] > t.bbox[3] || !Number.isInteger(t.count) || !(t.count > 0 && t.count <= 12000) || !Number.isInteger(t.bytes) || !(t.bytes > 0 && t.bytes <= 1024 * 1024)) throw Error('수심 타일 정보');
        files.add(t.file);
      }
      OFFICIAL_DEPTH.manifest = m; return m;
    } catch (e) { OFFICIAL_DEPTH.error = e.message; return null; }
  })();
  return OFFICIAL_DEPTH.init;
}
// 경위도 범위 배열만 받는다. Canvas/화면 좌표를 알 필요가 없다.
async function depthPrepareAreas(areas) {
  const m = await depthManifest(); if (!m || !m.tiles.length) return false;
  const pad = Math.max(...m.datasets.map(d => d.resolution * (d.sourceType === 'bada' ? 1.5 : 2)), 0) / 80000;
  const boxes = areas.filter(b => b.every(Number.isFinite) && b[2] - b[0] <= .6 && b[3] - b[1] <= .6);
  const wants = m.tiles.filter(t => boxes.some(b => t.bbox[0] <= b[2] + pad && t.bbox[2] >= b[0] - pad && t.bbox[1] <= b[3] + pad && t.bbox[3] >= b[1] - pad));
  // 큰 범위는 일부만 싣지 않는다. 더 확대하면 완전한 지역 묶음을 읽는다.
  const signature = wants.map(t => t.file).sort().join('|');
  if (signature === OFFICIAL_DEPTH.signature) return false;
  OFFICIAL_DEPTH.signature = signature;
  const generation = ++OFFICIAL_DEPTH.generation;
  if (wants.length > OFFICIAL_DEPTH.maxTiles || wants.reduce((n, t) => n + t.count, 0) > OFFICIAL_DEPTH.maxPoints || wants.reduce((n, t) => n + t.bytes, 0) > OFFICIAL_DEPTH.maxBytes) {
    OFFICIAL_DEPTH.cache.clear(); OFFICIAL_DEPTH.error = '공식 수심 자료는 지도를 더 확대하면 불러옵니다.'; return true;
  }
  let changed = false;
  const keep = new Set(wants.map(t => t.file));
  for (const key of OFFICIAL_DEPTH.cache.keys()) if (!keep.has(key)) { OFFICIAL_DEPTH.cache.delete(key); changed = true; }
  for (const tile of wants) {
    if (generation !== OFFICIAL_DEPTH.generation) return changed;
    if (OFFICIAL_DEPTH.cache.has(tile.file)) continue;
    try {
      const doc = await depthReadJSON('static/depth/' + tile.file, 1024 * 1024);
      if (generation !== OFFICIAL_DEPTH.generation) return changed;
      if (doc.version !== 1 || !Array.isArray(doc.points) || doc.points.length !== tile.count) throw Error('수심 타일 점 개수');
      const idx = new Map(); let maxRadius = 0;
      for (const row of doc.points) {
        const [lon, lat, depth, dataset, year, interpolated] = row, ds = m.datasets[dataset];
        if (!ds || ![lon, lat, depth].every(Number.isFinite) || lon < 123.5 || lon > 132.5 || lat < 32 || lat > 39.5 || depth < 0 ||
          lon < tile.bbox[0] || lon > tile.bbox[2] || lat < tile.bbox[1] || lat > tile.bbox[3] || typeof interpolated !== 'boolean') throw Error('수심 타일 좌표/속성');
        const radius = ds.resolution * (ds.sourceType === 'bada' ? 1.5 : 2);
        maxRadius = Math.max(maxRadius, radius);
        const p = { mx: mxOf(lon), my: myOf(lat), depth, res: ds.resolution, src: ds.source, yr: year ?? ds.surveyYear,
          datasetId: ds.id, sourceType: ds.sourceType, verticalDatum: ds.verticalDatum, interpolated, estimated: !!ds.estimated, radius };
        const key = Math.floor(p.mx / 1000) + ',' + Math.floor(p.my / 1000);
        if (!idx.has(key)) idx.set(key, []); idx.get(key).push(p);
      }
      OFFICIAL_DEPTH.cache.set(tile.file, { idx, maxRadius }); changed = true; OFFICIAL_DEPTH.error = '';
    } catch (e) { OFFICIAL_DEPTH.error = e.message; /* 다음 이동/재확대에서 다시 시도한다. 조회는 기존 자료로 계속한다. */ }
  }
  return changed;
}
function officialDepthCandidates(type, mx, my) {
  const out = [], k = kAt(latOf(my)), gx = Math.floor(mx / 1000), gy = Math.floor(my / 1000);
  for (const tile of OFFICIAL_DEPTH.cache.values()) {
    const n = Math.ceil(tile.maxRadius * k / 1000);
    for (let x = gx - n; x <= gx + n; x++) for (let y = gy - n; y <= gy + n; y++) {
      for (const p of tile.idx.get(x + ',' + y) || []) {
        if (OFFICIAL_TYPES[p.sourceType] !== type) continue;
        const d = Math.hypot(mx - p.mx, my - p.my);
        if (d <= p.radius * k) out.push({ ...p, d });
      }
    }
  }
  return out;
}
// 화면 어댑터. 미래 위성지도에서는 이 범위 생성 부분만 교체하면 된다.
function scheduleDepthArea() {
  clearTimeout(OFFICIAL_DEPTH.timer);
  OFFICIAL_DEPTH.timer = setTimeout(async () => {
    const a = toM(0, ch), b = toM(cw, 0), areas = [[lonOf(a[0]), latOf(a[1]), lonOf(b[0]), latOf(b[1])]];
    if (S.A && S.B) areas.push([Math.min(lonOf(S.A[0]), lonOf(S.B[0])), Math.min(latOf(S.A[1]), latOf(S.B[1])), Math.max(lonOf(S.A[0]), lonOf(S.B[0])), Math.max(latOf(S.A[1]), latOf(S.B[1]))]);
    if (await depthPrepareAreas(areas)) { dirty = true; dirtyHover = true; analyzeSection(); }
  }, 250);
}
