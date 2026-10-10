// p1_assertions.js — 실제 앱 함수로 계산·자료 품질 회귀 검사 (브라우저 테스트에서만 주입)
const check = (ok, message) => { if (!ok) throw new Error(message); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fish = FISH.find(f => f.n === '감성돔'), day = S.day, hour = 6;
const east = POINTS.filter(p => p.region === '동해' && p.lon < 130 && !p.kind);
const picked = [];
for (const lat of [38.4, 38.17, 37.89, 37.5, 36.05]) {
  const p = east.filter(p => picked.every(q => gdist(p, q) > 15)).sort((a, b) => Math.abs(a.lat - lat) - Math.abs(b.lat - lat))[0];
  check(p, '동해에서 15 km 이상 떨어진 실제 포인트 5곳 필요'); picked.push(p);
}
const comparison = picked.map(p => {
  const st = STATIONS[p.st], e = biteEvalAt(fish, p, st, day, hour);
  check(same(e, biteEvalAt(fish, p, st, day, hour)), '동일 입력 결정성');
  check(e.score === biteAt(fish, p, st, day, hour), '숫자 API 호환');
  return { point: p.name, date: st.days[day].date, hour, fish: fish.n, score: e.score, rawScore: e.rawScore, confidence: e.confidence, temperature: e.sources.temperature.observation, wind: e.sources.weather.sp ?? null, wave: e.sources.weather.wave ?? null, grid: e.sources.weather.grid ?? null, current: e.sources.current, factors: e.factors, reasons: biteReasons(e) };
});
// 15 km 범위와 예보 기간 검사는 대역 함수가 아닌 실제 flowU로 확인한다.
const savedCrStations = CR.st;
try {
  const c = CR.st.find(c => crntAt(c, day * 24 + hour) && crntDay(c, day).some(e => e.sp > 0));
  check(c, '실제 조류 예보 검사 지점'); CR.st = [c]; CR_NEAR_CACHE.clear();
  check(flowU(STATIONS[picked[0].st], c, day, day * 24 + hour).real, '15 km 안 실제 조류 우선');
  check(!flowU(STATIONS[picked[0].st], { lat: c.lat + 16 / 111, lon: c.lon }, day, day * 24 + hour).real, '15 km 밖 실제 조류 미사용');
  check(!flowU(STATIONS[picked[0].st], c, day, 1e6).real, '예보 기간 밖 추정 복귀');
} finally { CR.st = savedCrStations; CR_NEAR_CACHE.clear(); }
const signatures = comparison.map(r => JSON.stringify([r.temperature?.value, r.temperature?.km, r.wind, r.wave, r.current.u]));
if (new Set(signatures).size > 1) {
  check(new Set(comparison.map(r => JSON.stringify(r.factors))).size > 1, '다른 실제 입력의 기여분 보존');
  check(new Set(comparison.map(r => r.rawScore)).size > 1, '실제 입력 차이가 원점수에 반영됨');
}
// 동일 조석 지점에 연결해도 위치별 수온 관측을 찾는지 확인한다.
const savedObs = { ...OBS }, clock = Date.now(), savedWx = wxAt, savedFlow = flowU, savedSst = sstForLocation;
const savedMeta = structuredClone(META), savedCatches = CATCHES;
const p = picked[0], st = STATIONS[p.st], obsTime = ms => new Date(ms + 9 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
let count = 3;
try {
  for (const k of Object.keys(OBS)) delete OBS[k];
  OBS.a = { name: '검사 A', lat: p.lat, lon: p.lon, sst: [18, obsTime(clock - 36e5)] };
  OBS.b = { name: '검사 B', lat: p.lat - .25, lon: p.lon, sst: [26, obsTime(clock - 36e5)] };
  SST_C.clear();
  check(sstForLocation(p).id === 'a' && sstForLocation({ ...p, lat: p.lat - .25 }).id === 'b', '포인트 위치별 수온 캐시'); count++;
  OBS.a.sst[1] = obsTime(clock - 25 * 36e5); SST_C.clear();
  check(sstForLocation(p).id === 'b', '가장 가까운 유효 관측 선택'); count++;
  OBS.b.lat = p.lat - 2; SST_C.clear(); check(sstForLocation(p) === null, '50 km·24시간 제한'); count++;
  const observation = { value: 20, km: 1, ageHours: 1, quality: 'measured' };
  sstForLocation = () => ({ ...observation });
  let weather = { sp: 3, wave: .4, near: false, km: 0, ageHours: 2, lagHours: 0 };
  wxAt = () => weather;
  let actual = true;
  flowU = () => actual ? { real: true, u: .65, nc: { km: 1, c: { name: '검사 조류' } } } : { real: false, u: .65 };
  for (const k of Object.keys(META)) delete META[k]; META.generated = new Date(clock).toISOString(); CATCHES = [];
  const evaluate = () => biteEvalAt(fish, p, st, day, hour), full = evaluate();
  check(same(full, evaluate()), '고정 입력의 전체 결과 동일'); count++;
  sstForLocation = () => null; let e = evaluate();
  check(Number.isFinite(e.score) && e.confidence < full.confidence && e.factors.find(f => f.key === 'temperature').effect === 0, '수온 누락 중립·신뢰도 하락'); count++;
  sstForLocation = () => ({ ...observation }); weather = { ...weather, wave: null }; e = evaluate();
  check(Number.isFinite(e.score) && e.confidence < full.confidence && e.factors.find(f => f.key === 'wave').effect === 0, '파고 누락 중립·신뢰도 하락'); count++;
  weather.wave = .4; actual = false; check(evaluate().confidence < full.confidence, '추정 흐름 신뢰도 하락'); count++; actual = true;
  for (const patch of [{ near: true, km: 10 }, { ageHours: 30 }, { lagHours: 2 }]) {
    const saved = weather; weather = { ...weather, ...patch }; check(evaluate().confidence < full.confidence, '인접·이전 발표·시간 fallback'); count++; weather = saved;
  }
  for (const status of ['merged_fallback', 'kept_previous_incomplete']) {
    META['wx.json'] = { status }; check(evaluate().confidence < full.confidence && evaluate().score === full.score, 'P0 메타 신뢰도만 반영'); count++;
  }
  delete META['wx.json']; META.generated = new Date(clock - 72 * 36e5).toISOString(); check(evaluate().confidence < full.confidence, '오래된 수집'); count++; META.generated = new Date(clock).toISOString();
  for (const patch of [{ km: 40 }, { ageHours: 23 }]) {
    sstForLocation = () => ({ ...observation, ...patch }); check(evaluate().confidence < full.confidence, '멀거나 오래된 수온'); count++;
  }
  sstForLocation = () => ({ ...observation });
  weather.sp = 6; e = evaluate(); check(e.score < full.score && e.factors.find(f => f.key === 'wind').effect < full.factors.find(f => f.key === 'wind').effect, '7 m/s 이하 실제 풍속 차이'); count++;
  weather.sp = 3; weather.wave = .9; check(evaluate().score < full.score, '1 m 이하 실제 파고 차이'); count++; weather.wave = .4;
  CATCHES = [{ region: st.region, date: '2026-10-09', pt: p.name, count: 1, species: fish.n }]; e = evaluate();
  check(e.score !== full.score && e.confidence === full.confidence, '내 조황기록 보정 유지·신뢰도 독립'); count++;
  check(biteEvalAt({ ...fish, season: 0 }, p, st, day, hour).score === 0, '대상어 부적합 0점'); count++;
} finally {
  wxAt = savedWx; flowU = savedFlow; sstForLocation = savedSst; CATCHES = savedCatches;
  for (const k of Object.keys(OBS)) delete OBS[k]; Object.assign(OBS, savedObs); SST_C.clear();
  for (const k of Object.keys(META)) delete META[k]; Object.assign(META, savedMeta);
}
return { checks: count, comparison };
