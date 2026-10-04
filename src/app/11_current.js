// 11_current.js — 조류 예보(물돌이·최강)와 해 뜨고 지는 시각
/* ── 조류 예보: 국립해양조사원 「조류예보 최강창낙조 및 전류」 (공공데이터포털, 199개 예보 지점) ──
   지점마다 전류(물돌이, 유속 0)와 최강 유속 시각·유향·유속(cm/s)이 번갈아 있다. 그 사이는 사인 곡선으로 보간한다.
   유향은 물이 흘러가는 방향(북=0°, 시계 방향). 바람·하천·해류 영향은 들어 있지 않은 천문 조류 예측값이다. */
const CR = { st: [], ready: false, err: '' }, CR_NEAR = 15, CR_GOOD = 5;   // km: 15 km 넘으면 쓰지 않음, 5 km 이내면 가까움
const KN = 0.0194384;   // cm/s → 노트
async function loadCrnt() {
  try {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다');
    const bin = atob(CRNT.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const buf = new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const n = CRNT.n, rd = (p, k) => buf[p * 2 * n + k] | (buf[p * 2 * n + n + k] << 8);
    let k = 0;
    for (const [name, lat, lon, cnt, t0] of CRNT.st) {
      const t = new Float64Array(cnt), d = new Uint16Array(cnt), s = new Float32Array(cnt); let acc = t0;
      for (let i = 0; i < cnt; i++, k++) { if (i) acc += rd(0, k); t[i] = acc / 60; d[i] = rd(1, k); s[i] = rd(2, k) / 10; }
      CR.st.push({ name, lat, lon, t, d, s, mx: mxOf(lon), my: myOf(lat) });
    }
    CR.ready = true; CR_NEAR_CACHE.clear(); biteHour = -1; if (typeof renderBasis === 'function') renderBasis();
  } catch (e) { CR.err = e.message || String(e); }
}
// tA(9/30 00시부터 시간)의 유향·유속
const CR_OFF = (new Date(DAY0 + 'T00:00:00+09:00') - new Date('2026-09-30T00:00:00+09:00')) / 36e5;   // 조류 자료는 9/30 00시 기준
function crntAt(c, tA) {
  tA += CR_OFF; const T = c.t; if (tA < T[0] || tA >= T[T.length - 1]) return null;
  let lo = 0, hi = T.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= tA) lo = m; else hi = m; }
  const f = (tA - T[lo]) / (T[hi] - T[lo]);
  if (c.s[lo] === 0) return { sp: c.s[hi] * Math.sin(Math.PI / 2 * f), dir: c.d[hi], i: hi };   // 물돌이 → 최강
  return { sp: c.s[lo] * Math.cos(Math.PI / 2 * f), dir: c.d[lo], i: lo };                    // 최강 → 물돌이
}
// 하루(day 0 = 9/30) 안의 물돌이·최강 시각
function crntDay(c, day) {
  const a = day * 24 + CR_OFF, b = a + 24, out = [];
  for (let i = 0; i < c.t.length; i++) { if (c.t[i] >= b) break; if (c.t[i] >= a) out.push({ h: c.t[i] - a + 1e-6, sp: c.s[i], dir: c.d[i] }); }
  return out;
}
const CR_NEAR_CACHE = new Map();
function nearestCrnt(lat, lon) {
  const key = lat.toFixed(4) + ',' + lon.toFixed(4); if (CR_NEAR_CACHE.has(key)) return CR_NEAR_CACHE.get(key);
  let best = null, bd = Infinity; for (const c of CR.st) { const d = gdist({ lat, lon }, c); if (d < bd) { bd = d; best = c; } }
  const r = best ? { c: best, km: bd } : null; CR_NEAR_CACHE.set(key, r); return r;
}
// 조과 지수용 흐름 세기: 15 km 안에 예보 지점이 있으면 그 지점 유속을 그날 최강 유속으로 나눈 값
function flowU(st, pt, day, tA) {
  if (CR.ready) {
    const nc = nearestCrnt(pt ? pt.lat : st.lat, pt ? pt.lon : st.lon);
    if (nc && nc.km <= CR_NEAR) {
      const r = crntAt(nc.c, tA); let mx = 0; for (const e of crntDay(nc.c, day)) mx = Math.max(mx, e.sp);
      if (r && mx > 0) return { u: r.sp / mx, real: true, nc, r, mx };
    }
  }
  return { u: tideAt(st, tA).rate / st.maxRate, real: false };
}
const ARROW_DIRS = ['북', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동', '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서'];
const dirName16 = d => ARROW_DIRS[Math.round((((d % 360) + 360) % 360) / 22.5) % 16];
// 해 뜨고 지는 시각 (NOAA 근사식, 한국 표준시)
const DOY0 = Math.round((new Date(DAY0 + 'T12:00:00Z') - new Date(DAY0.slice(0, 4) + '-01-01T12:00:00Z')) / 864e5) + 1;
function sunTimes(lat, lon, dayIdx) {
  const N = DOY0 + dayIdx;
  const g = 2 * Math.PI / 365 * (N - 1 + .5);
  const eq = 229.18 * (.000075 + .001868 * Math.cos(g) - .032077 * Math.sin(g) - .014615 * Math.cos(2 * g) - .040849 * Math.sin(2 * g));
  const dec = .006918 - .399912 * Math.cos(g) + .070257 * Math.sin(g) - .006758 * Math.cos(2 * g) + .000907 * Math.sin(2 * g) - .002697 * Math.cos(3 * g) + .00148 * Math.sin(3 * g);
  const la = lat * D2R, ha = Math.acos(Math.cos(90.833 * D2R) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec)) / D2R;
  const noon = 720 - 4 * lon - eq + 540;
  return [(noon - 4 * ha) / 60, (noon + 4 * ha) / 60];
}
