// 04_depth.js — 수심 자료 층과 보간
/* ── 수심 자료 층 ─────────────────────────────────────────
   우선순위: 내 입력 > 연안해역기본도 > 해수부 등심선 > 공개 해도 > BADA > GEBCO/추정
   위 순서대로 찾고, 높은 순위 자료가 반경 안에 있으면 그 자료만으로 보간한다(낮은 순위와 섞지 않음). */
const DTYPES = {
  survey:  { pri: 1, label: '내 수심 입력 (검수 미확인)', short: '내 입력', res: 10, color: '#d6fff9' },
  coastal: { pri: 2, label: '연안해역기본도',  short: '연안',   res: 30,  color: '#7ff3e6' },
  chart:   { pri: 3, label: '전자해도·항만도', short: '해도',   res: 50,  color: '#8fd3ff' },
  bada:    { pri: 4, label: 'BADA2024',        short: 'BADA',   res: 150, color: '#c4b5ff' },
  gebco:   { pri: 5, label: 'GEBCO 2026',      short: 'GEBCO',  res: 460, color: '#e2c48a' },
};
DTYPES.mof = { pri: 3, label: '해양수산부 수심분포도', short: '등심선', res: 50, color: '#80caff' };
const DORDER = ['survey', 'coastal', 'mof', 'chart', 'bada'];
const MAX_PTS = 600000;
const LAYERS = {};
function layerOf(type) {
  if (!LAYERS[type]) LAYERS[type] = { type, n: 0, mx: [], my: [], d: [], res: [], src: [], yr: [], meta: [], idx: new Map(), cell: Math.max(60, DTYPES[type].res * 2.5), resMax: 0 };
  return LAYERS[type];
}
const totalPts = () => DORDER.reduce((s, t) => s + (LAYERS[t] ? LAYERS[t].n : 0), 0);
function addDepthPt(type, mx, my, d, res, src, yr, meta = {}) {
  if (!DTYPES[type] || ![mx, my, d, res].every(Number.isFinite) || d < 0 || res <= 0) return false;
  if (totalPts() >= MAX_PTS) return false;
  const L = layerOf(type), i = L.n++;
  L.mx.push(mx); L.my.push(my); L.d.push(d); L.res.push(res); L.src.push(src || ''); L.yr.push(yr || '');
  L.meta.push({ ...meta, datasetId: meta.datasetId || src || 'local-' + type, verticalDatum: meta.verticalDatum || 'unknown' });
  if (res > L.resMax) L.resMax = res;
  const k = Math.floor(mx / L.cell) * 1000000 + Math.floor(my / L.cell); let a = L.idx.get(k); if (!a) L.idx.set(k, a = []); a.push(i);
  return true;
}
function clearLayers() { for (const t of DORDER) delete LAYERS[t]; }

// 지도 좌표에서 판정한다. 화면 크기·확대·이동 및 화면 마스크와 무관하다.
function crossesLand(mx1, my1, mx2, my2) {
  const steps = Math.max(5, Math.ceil(Math.hypot(mx2 - mx1, my2 - my1) / kAt(latOf(my1)) / 5));
  for (let s = 1; s < steps; s++) {
    const f = s / steps;
    if (inLand(mx1 + (mx2 - mx1) * f, my1 + (my2 - my1) * f)) return true;
  }
  return false;
}
const searchRadius = (type, L) => type === 'bada' ? 1.5 * Math.max(150, L.resMax) : Math.max(20, 2 * Math.max(DTYPES[type].res, L.resMax));
function depthQuery(mx, my) {
  const k = kAt(latOf(my));
  for (const type of DORDER) {
    const cand = [];
    const L = LAYERS[type];
    if (L && L.n) {
      const R = searchRadius(type, L), r = R * k, c = Math.ceil(r / L.cell), gx = Math.floor(mx / L.cell), gy = Math.floor(my / L.cell);
      for (let dx = -c; dx <= c; dx++) for (let dy = -c; dy <= c; dy++) {
        const a = L.idx.get((gx + dx) * 1000000 + gy + dy); if (!a) continue;
        for (const i of a) { const d = Math.hypot(L.mx[i] - mx, L.my[i] - my); if (d <= r) cand.push({ d, mx: L.mx[i], my: L.my[i], depth: L.d[i], res: L.res[i], src: L.src[i], yr: L.yr[i], ...L.meta[i] }); }
      }
    }
    cand.push(...officialDepthCandidates(type, mx, my));
    if (!cand.length) continue;
    cand.sort((a, b) => a.d - b.d || String(a.datasetId).localeCompare(String(b.datasetId)));
    const use = [];
    for (const p of cand) {
      if (use.length >= 6) break;
      if (p.d > 2 * k && crossesLand(mx, my, p.mx, p.my)) continue;
      // 기준면이 같아도 서로 다른 자료집은 합치지 않는다. unknown도 자료집별로 격리한다.
      if (use.length && (p.datasetId !== use[0].datasetId || p.verticalDatum !== use[0].verticalDatum)) continue;
      use.push(p);
    }
    if (!use.length) continue;
    const p0 = use[0], resN = p0.res, distG = p0.d / k;
    let depth;
    if (distG < .5) depth = p0.depth;
    else { let ws = 0, vs = 0; for (const p of use) { const w = 1 / (p.d * p.d); ws += w; vs += w * p.depth; } depth = vs / ws; }
    const interp = distG >= .5 || !!p0.interpolated;
    const conf = type === 'bada' ? (distG <= 150 ? '중간' : '낮음') : type === 'chart' ? '중간' : (interp ? '중간' : '높음');
    return depthResult({ depth, type, label: DTYPES[type].label, res: resN, dist: distG, n: distG < .5 ? 1 : use.length, conf, interp, src: p0.src, yr: p0.yr,
      verticalDatum: p0.verticalDatum, datasetId: p0.datasetId, sourceType: p0.sourceType, estimated: (distG < .5 ? [p0] : use).some(p => p.estimated),
      contributingSources: (distG < .5 ? [p0] : use).map(p => ({ source: p.src, surveyYear: p.yr || null, resolution: p.res, distance: p.d / k, interpolated: !!p.interpolated })),
      confidenceReason: type === 'survey' ? '이 기기의 입력값이며 관리자 검수가 확인되지 않았습니다.' : '자료점 거리·해상도 기반 등급이며 정확도 보증이 아닙니다.' });
  }
  return null;
}
// 공식 수심 자료가 없을 때: 해안 800 m 안은 추정, 밖은 GEBCO. 기준면 미확인 자료를 혼합하지 않는다.
function modelDepth(mx, my, dG) {
  const est = estimateAt(dG); if (!GE || !isFinite(dG)) return est;
  const e = gebcoAt(latOf(my), lonOf(mx)); if (e == null) return est;
  const g = -e;
  // GEBCO의 평균해면 가정과 해안 추정의 기준면이 같다고 볼 수 없어 혼합하지 않는다.
  if (dG < 800 || g <= 0) return est;
  return depthResult({ depth: g, type: 'gebco', label: 'GEBCO 2026', res: 460, dist: null, conf: '낮음', interp: true, verticalDatum: 'MSL_assumed', estimated: true });
}
function estimateAt(dG) { return depthResult({ depth: depthAt(dG), type: 'est', label: '해안거리 기반 추정', res: null, dist: null, conf: '낮음', interp: false, estimated: true }); }
// 기존 type/label/res/dist/n/conf/interp/src/yr는 화면 호환용으로 함께 유지한다.
function depthResult(r) {
  const types = { survey: 'crowd_pending', coastal: 'coastal_official', mof: 'mof_contour', chart: 'chart_public', bada: 'bada', gebco: 'gebco', est: 'model_estimate' };
  const sourceType = r.sourceType || types[r.type];
  const datum = r.verticalDatum || 'unknown';
  const conf = sourceType === 'crowd_pending' || datum === 'unknown' ? '낮음' : r.conf;
  return { ...r, conf, sourceType, source: r.src || r.label, resolution: r.res ?? null,
    distanceToSource: r.dist ?? null, interpolated: !!r.interp, estimated: !!r.estimated,
    confidence: conf, confidenceReason: (r.confidenceReason || (r.estimated ? '저해상도 격자 또는 경사 가정으로 세부 지형을 알 수 없습니다.' : '자료점 거리·해상도 기반 등급')) +
      (datum === 'unknown' ? ' 바닷물 높이 기준면 미확인.' : ''),
    verticalDatum: datum, surveyYear: r.yr || null, measurementCount: r.n ?? 0 };
}
function fmtDepth(r) {
  if (!r) return '—';
  if (r.type === 'survey') return '약 ' + r.depth.toFixed(1) + ' m';
  if ((r.type === 'coastal' || r.type === 'chart') && r.res <= 10 && !r.interp) return r.depth.toFixed(1) + ' m';
  return '약 ' + Math.round(r.depth) + ' m';
}
function describeDepth(r) {
  if (!r) return '';
  return `수심 ${fmtDepth(r)} · 출처: ${r.label} · 신뢰도: ${r.conf}${r.estimated ? ' · 추정' : ''}`;
}
function depthDetails(r) {
  if (!r) return '';
  return `자료해상도: ${r.res == null ? '알 수 없음' : '약 ' + r.res + ' m'} · 조사연도: ${r.surveyYear || '미확인'} · 보간: ${r.interpolated ? '예' : '아니요'} · ${r.estimated ? '추정' : r.sourceType === 'crowd_pending' ? '검수 전 입력' : '공식자료'} · 기준면: ${r.verticalDatum} · ${r.confidenceReason}`;
}
