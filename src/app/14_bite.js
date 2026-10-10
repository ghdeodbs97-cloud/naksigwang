// 14_bite.js — 시간별 입질 지수
// 규칙 기반 조건점수와 자료 신뢰도를 별도로 계산한다.
const LIGHT = { 감성돔: 'dd', 볼락: 'n', 벵에돔: 'd', 농어: 'nd', 우럭: 'n', 광어: 'd', 노래미: 'd', 삼치: 'dd', 고등어: 'dd', 참돔: 'dd', 잿방어: 'd', 부시리: 'dd', 대구: 'd', 숭어: 'd', 전갱이: 'nd', 돌돔: 'd', 백조기: 'd', 전어: 'd' };
const LIGHT_T = { dd: [1, .55, .2], d: [.85, .85, .15], n: [.8, .3, 1], nd: [1, .45, .85] };   // [해뜰녘·해질녘, 낮, 밤]
const LIGHT_NAME = { dd: '해뜰녘·해질녘', d: '낮', n: '밤', nd: '밤·해뜰녘·해질녘' };
function lightF(type, h, sr, ss) {
  const tw = Math.min(Math.abs(h - sr), Math.abs(h - ss)) <= 1.25, day = h > sr && h < ss, T = LIGHT_T[type];
  return tw ? T[0] : day ? T[1] : T[2];
}
const flowF = (fish, u) => 1 - fish.cur * .6 * Math.min(1, Math.abs(Math.abs(u) - .65) / .65);   // 최강 유속의 65% 안팎에서 가장 좋게
function targetF(fish, pt) {
  if (!pt || !pt.targets) return 1;
  return pt.targets.includes(fish.n) || (fish.n === '우럭' && pt.targets.includes('조피볼락')) || (fish.n === '노래미' && pt.targets.includes('쥐노래미')) || (fish.n === '광어' && pt.targets.includes('넙치')) || (fish.n === '백조기' && pt.targets.includes('보구치')) ? 1 : .55;
}
// 조차가 작은 바다는 조석 추정의 비중만 줄이고 실제 환경 차이는 유지한다.
const weakTide = st => st.maxCm - st.minCm < 60;
function biteDataQuality(name) {
  const m = META[name + '.json'], status = m?.status || '', age = (Date.now() - Date.parse(META.generated)) / 36e5;
  // P0 메타는 파일 단위이므로 특정 포인트의 복구 여부로 단정하지 않는다.
  const retained = status.startsWith('kept_previous') || status === 'no_data_to_save';
  const fallback = status === 'merged_fallback' || m?.fallback > 0, stale = !Number.isFinite(age) || age > 24;
  return { status, retained, fallback, stale, multiplier: META.degraded ? .7 : retained ? .65 : stale ? .75 : fallback ? .85 : 1 };
}
function biteTemperature(fish, p, st, day = 0) {
  const w = sstForLocation(p), pref = TEMP_PREF[fish.n], enabled = !!pref?.[2];
  // 먼 실측과 오래된 실측의 영향은 약하게. 현재 실측은 미래 수온 예보가 아니다.
  const ahead = Math.max(0, (Date.parse(dateAdd(DAY0, day) + 'T12:00:00+09:00') - Date.now()) / 36e5);
  const reliability = w ? Math.max(0, 1 - w.km / 50) * (1 - .5 * w.ageHours / 24) / (1 + ahead / 48) : 0;
  const delta = w && enabled ? Math.max(0, pref[0] - w.value, w.value - pref[1]) : 0;
  return { observation: w, enabled, reliability, delta, effect: w && enabled ? clamp(8 - delta * 6, -24, 8) * reliability * (weakTide(st) ? 1.25 : 1) : 0 };
}
// 내 조황 기록 보정: 같은 해역에서 기록한 출조 중 그 어종을 잡은 비율을, 모델 기대치(시즌×해역)와 섞어 0.5~1.5배로 반영
let CATCHES = [];
function myF(fish, st) {
  const reg = st.region, trips = new Map();
  for (const c of CATCHES) if (c.region === reg) { const k = c.date + '|' + c.pt; if (!trips.has(k)) trips.set(k, new Set()); if (c.count > 0) trips.get(k).add(c.species); }
  const n = trips.size; if (!n) return { f: 1, n: 0, hit: 0 };
  let hit = 0; for (const s2 of trips.values()) if (s2.has(fish.n)) hit++;
  const base = Math.max(.05, fish.season * fish.reg[REG_IDX[reg]]), K = 5, rate = (hit + K * base) / (n + K);
  return { f: Math.max(.5, Math.min(1.5, rate / base)), n, hit };
}
// 확률이 아닌 조건점수: 기본 적합도 50점 + 알려진 조건의 기여분.
// 누락 원천의 기여분은 0이며 확보 여부는 자료 신뢰도에서 별도로 평가한다.
function biteEvalAt(fish, pt, st, day, h) {
  const p = pt || st, weak = weakTide(st), env = weak ? 1.25 : 1;
  const wx = wxAt(st, day, h + .5, pt), temperature = biteTemperature(fish, p, st, day);
  const fu = flowU(st, pt, day, day * 24 + h + .5), [sr, ss] = sunTimes(p.lat, p.lon, day);
  const quality = { temperature: biteDataQuality('obs'), weather: biteDataQuality('wx'), tide: biteDataQuality('tide') };
  const factors = [], add = (key, label, effect, quality) => factors.push({ key, label, effect, quality });
  const base = fish.season * fish.reg[REG_IDX[st.region]] * targetF(fish, pt);
  add('base', '시즌·해역·대상어 적합', 50 * base, 'rule');
  const light = lightF(LIGHT[fish.n], h + .5, sr, ss);
  add('light', light >= .8 ? '선호하는 피딩 시간' : '선호 시간대 밖', 30 * (light - .5), 'estimated');
  add('temperature', !temperature.observation ? '수온 자료 없음' : !temperature.enabled ? '수온 기준 미적용' : temperature.delta ? '수온 범위 밖 ' + temperature.delta.toFixed(1) + '℃' : '수온 적합', temperature.effect, temperature.observation ? 'measured' : 'missing');
  // 연속식으로 실제 차이를 보존한다. 풍속 7 m/s·파고 1 m가 중립이다.
  // 약한 조석에서는 환경 기여도 1.25배, 조위 기반 추정 기여도 0.15배(가정값).
  add('wind', wx?.sp == null ? '풍속 자료 없음' : wx.sp <= 7 ? '바람 약함' : '바람 강함', wx?.sp == null ? 0 : 12 * clamp(1 - wx.sp / 7, -2, 1) * env, wx?.sp == null ? 'missing' : 'forecast');
  add('wave', wx?.wave == null ? '파고 자료 없음' : wx.wave <= 1 ? '파고 안정' : '파고 높음', wx?.wave == null ? 0 : 10 * clamp(1 - wx.wave, -2, 1) * env, wx?.wave == null ? 'missing' : 'forecast');
  const g = 1 - Math.min(1, Math.abs(st.days[day].pct - 60) / 60);
  add('tide', weak ? '조석 영향 작음' : '물때 세기', 8 * fish.cur * (g - .5) * (weak ? .15 : 1), 'forecast');
  add('current', fu.real ? '실제 조류 예보 기준' : '조류 예보 없음 · 흐름 추정', 20 * (flowF(fish, fu.u) - .8) * (weak && !fu.real ? .15 : 1), fu.real ? 'forecast' : 'estimated');
  const subtotal = factors.reduce((v, f) => v + f.effect, 0), mine = myF(fish, st);
  add('catch', '내 조황기록 보정', subtotal * (mine.f - 1), 'personal');
  // 확보 배점: 수온 25, 풍속 15, 파고 20, 조류 25, 조석 15.
  // 추정 흐름은 7점만 배정(실제 예보 대비 18점 감소). 내 기록은 신뢰도와 분리한다.
  const wxQuality = wx ? (wx.near ? Math.max(.5, 1 - wx.km / 25) : 1) * (wx.ageHours == null ? .5 : wx.ageHours > 24 ? .6 : 1) * (1 - .1 * wx.lagHours) * quality.weather.multiplier : 0;
  const confidence = Math.round(clamp(25 * temperature.reliability * quality.temperature.multiplier + (wx?.sp == null ? 0 : 15 * wxQuality) + (wx?.wave == null ? 0 : 20 * wxQuality) + (fu.real ? 25 * (1 - .3 * fu.nc.km / 15) : 7 * quality.tide.multiplier) + 15 * quality.tide.multiplier, 0, 100));
  const rawScore = base <= 0 ? 0 : clamp(subtotal * mine.f, 1, 99);
  return { score: Math.round(rawScore), rawScore, confidence, confidenceLevel: confidence >= 80 ? '높음' : confidence >= 55 ? '보통' : '낮음', factors: base <= 0 ? [{ key: 'base', label: '시즌·해역 기준에 맞지 않음', effect: 0, quality: 'rule' }] : factors,
    sources: { temperature: { ...temperature, ...quality.temperature }, weather: { ...(wx || {}), ...quality.weather, stale: quality.weather.stale || !!wx && (wx.ageHours == null || wx.ageHours > 24), quality: wx ? 'forecast' : 'missing' }, tide: { station: st.id, km: gdist(p, st), weak, ...quality.tide }, current: { source: fu.real ? 'forecast' : 'tide_estimate', station: fu.real ? fu.nc.c.name : st.id, km: fu.real ? fu.nc.km : gdist(p, st), u: fu.u } } };
}
function biteAt(fish, pt, st, day, h) { return biteEvalAt(fish, pt, st, day, h).score; }
function biteReasons(ev) {
  if (ev.score === 0) return '시즌·해역 기준에 맞지 않음';
  const relevant = ev.factors.filter(f => !['base', 'catch'].includes(f.key));
  const positive = relevant.filter(f => f.effect > .05).sort((a, b) => b.effect - a.effect);
  const negative = relevant.filter(f => f.effect < -.05).sort((a, b) => a.effect - b.effect);
  const chosen = [...positive.slice(0, 1), ...negative.slice(0, 1)];
  for (const f of [...relevant.filter(f => f.quality === 'missing' || f.key === 'current' && f.quality === 'estimated'), ...positive, ...negative]) if (!chosen.includes(f) && chosen.length < 4) chosen.push(f);
  return chosen.map(f => `${f.quality === 'missing' || f.key === 'current' && f.quality === 'estimated' ? '참고' : f.effect > 0 ? '+' : '−'} ${f.label}`).join(' · ');
}
const level = p => p >= 60 ? ['높음', 'hi'] : p >= 40 ? ['보통', 'mid'] : p > 0 ? ['낮음', 'lo'] : ['없음', 'none'];
function spark(arr, sel) {
  const w = 120, hh = 26, bw = w / 24;
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}" aria-hidden="true">` + arr.map((p, i) => { const bh = Math.max(1, p / 100 * (hh - 2)), c = p >= 60 ? '#5ff0a8' : p >= 40 ? '#ffb84d' : p > 0 ? '#3d6670' : '#22343a'; return `<rect x="${(i * bw + .5).toFixed(1)}" y="${(hh - bh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}"${i === sel ? ' stroke="#fff" stroke-width="1"' : ''}/>`; }).join('') + '</svg>';
}
let biteHour = -1, biteDataMinute = -1, BITE_H = null;
function renderBite() {
  const st = STATIONS[S.st], d = st.days[S.day], pt = POINTS[S.pt], H = Math.floor(S.t);
  biteHour = H;
  // 관측 만료·발표 자료의 24시간 경계와 수온 age를 최대 약 1분 안에 반영한다.
  biteDataMinute = Math.floor(Date.now() / 60000);
  $('biteSub').textContent = `${pt ? pt.name : st.name} · ${d.date.slice(5).replace('-', '/')} ${String(H).padStart(2, '0')}시 · ${d.mul}`;
  const [sr, ss] = sunTimes(pt ? pt.lat : st.lat, pt ? pt.lon : st.lon, S.day);
  const rows = FISH.map((f, i) => { const arr = Array.from({ length: 24 }, (_, h) => biteAt(f, pt, st, S.day, h)); const best = arr.indexOf(Math.max(...arr)); return { f, i, arr, p: arr[H], best, ev: biteEvalAt(f, pt, st, S.day, H) }; }).sort((a, b) => b.p - a.p || b.arr[b.best] - a.arr[a.best]);
  BITE_H = { sr, ss, best: Array.from({ length: 24 }, (_, h) => { let b = null; for (const r of rows) if (!b || r.arr[h] > b.p) b = { p: r.arr[h], n: r.f.n }; return b; }) };
  const top = rows.filter(r => r.arr[r.best] >= 60);
  $('biteWin').textContent = `해 뜸 ${fmtH(sr)} · 해 짐 ${fmtH(ss)} · ` + (top.length ? '오늘 "높음"이 나오는 시간: ' + top.slice(0, 4).map(r => `${r.f.n} ${String(r.best).padStart(2, '0')}시`).join(', ') : '오늘은 "높음"이 나오는 시간이 없습니다.');
  $('fishGrid').innerHTML = rows.map(({ f, i, arr, p, best, ev }) => {
    const [lv, cls] = level(p);
    return `<div class="fish ${cls}"><div class="pic">${fishSVG(f.f, i)}</div><div class="fn">${f.n}<span class="lt">${LIGHT_NAME[LIGHT[f.n]]}</span></div><div class="fp"><b>${p}점</b><span class="lv ${cls}">${lv}</span></div>${spark(arr, H)}<div class="bestH">최고 ${String(best).padStart(2, '0')}시 ${arr[best]}점</div><p class="biteConfidence">자료 신뢰도 ${ev.confidenceLevel}</p><p class="biteReasons">${biteReasons(ev)}</p></div>`;
  }).join('');
  if (pt && pt.kind === 'rock') $('rockInfo').innerHTML = rockInfoHTML(pt); else $('rockInfo').innerHTML = '';
  if (typeof renderBasis === 'function') renderBasis();
  if (typeof renderToday === 'function') renderToday();
  if (typeof renderLog === 'function') renderLog();
}
