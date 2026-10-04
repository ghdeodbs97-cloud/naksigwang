// 14_bite.js — 시간별 입질 지수
/* ── 시간별 조과 지수 (엄격한 규칙 기반 추정) ───────────
   시즌 × 해역 × 물때 세기 × 파고 × 시간대 밝기 × 그 시각 물흐름 세기를 곱한다.
   곱셈이라 조건이 하나만 나빠도 크게 내려가고, 해뜰녘·해질녘에 물이 적당히 흐를 때만 높게 나온다. */
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
// 수온: 관측값이 범위 안이면 1, 벗어난 1 ℃마다 0.1씩 (최소 0.5). 관측값이 없거나 범위 자료가 부정확한 어종은 반영하지 않음
function tempF(fish, st) {
  const w = sstFor(st), r = TEMP_PREF[fish.n]; if (!w || !r || !r[2]) return 1;
  const d = w[0] < r[0] ? r[0] - w[0] : w[0] > r[1] ? w[0] - r[1] : 0; return Math.max(.5, 1 - (weakTide(st) ? .15 : .1) * d);
}
// 조차가 작은 바다(그 관측소 7일 예보의 최고·최저 조위 차 60 cm 미만: 동해안·울릉도)는 조석 흐름이 약해
// 물때와 조위 변화 속도를 지수에 넣지 않고, 대신 평균값(중립)을 곱한 뒤 바람·수온 비중을 높인다.
const weakTide = st => st.maxCm - st.minCm < 60;
const FLOW_AVG_C = new Map(), FLOW_AVG = cur => FLOW_AVG_C.get(cur) ?? (FLOW_AVG_C.set(cur, FLOW_AVG0(cur)), FLOW_AVG_C.get(cur));
const FLOW_AVG0 = cur => { let a = 0; for (let i = 0; i < 180; i++) a += flowF({ cur }, Math.sin((i + .5) / 180 * Math.PI)); return a / 180; };
const FT_AVG = cur => 1 - .25 * cur + .25 * cur * .57;   // 물때 세기 0~100% 고르게 놓았을 때의 평균
const windF = sp => sp == null ? 1 : sp <= 7 ? 1 : sp <= 10 ? .85 : sp <= 13 ? .6 : .35;   // 풍랑주의보 기준(14 m/s)에 가까울수록 크게 감점
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
function biteAt(fish, pt, st, day, h) {
  const base = fish.season * fish.reg[REG_IDX[st.region]] * targetF(fish, pt);
  if (base <= 0) return 0;
  const weak = weakTide(st), pct = st.days[day].pct, g = 1 - Math.min(1, Math.abs(pct - 60) / 60);
  const fT = weak ? FT_AVG(fish.cur) : (1 - .25 * fish.cur) + .25 * fish.cur * g;
  const wx = wxAt(st, day, h + .5, pt), hs = wx && wx.wave != null ? wx.wave : null;
  const fW = (hs == null ? 1 : hs <= 1 ? 1 : hs <= 1.5 ? .85 : hs <= 2.5 ? .55 : .25) * (weak && wx ? windF(wx.sp) : 1);   // 파고 예보가 없으면 반영하지 않음
  const lat = pt ? pt.lat : st.lat, lon = pt ? pt.lon : st.lon, [sr, ss] = sunTimes(lat, lon, day);
  const fu = flowU(st, pt, day, day * 24 + h + .5), fF = weak && !fu.real ? FLOW_AVG(fish.cur) : flowF(fish, fu.u);
  return Math.max(1, Math.min(99, Math.round(100 * base * fT * fW * tempF(fish, st) * myF(fish, st).f * lightF(LIGHT[fish.n], h + .5, sr, ss) * fF * .9)));
}
const level = p => p >= 60 ? ['높음', 'hi'] : p >= 40 ? ['보통', 'mid'] : p > 0 ? ['낮음', 'lo'] : ['없음', 'none'];
function spark(arr, sel) {
  const w = 120, hh = 26, bw = w / 24;
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}" aria-hidden="true">` + arr.map((p, i) => { const bh = Math.max(1, p / 100 * (hh - 2)), c = p >= 60 ? '#5ff0a8' : p >= 40 ? '#ffb84d' : p > 0 ? '#3d6670' : '#22343a'; return `<rect x="${(i * bw + .5).toFixed(1)}" y="${(hh - bh).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}"${i === sel ? ' stroke="#fff" stroke-width="1"' : ''}/>`; }).join('') + '</svg>';
}
let biteHour = -1, BITE_H = null;
function renderBite() {
  const st = STATIONS[S.st], d = st.days[S.day], pt = POINTS[S.pt], H = Math.floor(S.t);
  biteHour = H;
  $('biteSub').textContent = `${pt ? pt.name : st.name} · ${d.date.slice(5).replace('-', '/')} ${String(H).padStart(2, '0')}시 · ${d.mul} (${d.pct}%)`;
  const [sr, ss] = sunTimes(pt ? pt.lat : st.lat, pt ? pt.lon : st.lon, S.day);
  const rows = FISH.map((f, i) => { const arr = Array.from({ length: 24 }, (_, h) => biteAt(f, pt, st, S.day, h)); const best = arr.indexOf(Math.max(...arr)); return { f, i, arr, p: arr[H], best }; }).sort((a, b) => b.p - a.p || b.arr[b.best] - a.arr[a.best]);
  BITE_H = { sr, ss, best: Array.from({ length: 24 }, (_, h) => { let b = null; for (const r of rows) if (!b || r.arr[h] > b.p) b = { p: r.arr[h], n: r.f.n }; return b; }) };
  const top = rows.filter(r => r.arr[r.best] >= 60);
  $('biteWin').textContent = `해 뜸 ${fmtH(sr)} · 해 짐 ${fmtH(ss)} · ` + (top.length ? '오늘 "높음"이 나오는 시간: ' + top.slice(0, 4).map(r => `${r.f.n} ${String(r.best).padStart(2, '0')}시`).join(', ') : '오늘은 "높음"이 나오는 시간이 없습니다.');
  $('fishGrid').innerHTML = rows.map(({ f, i, arr, p, best }) => {
    const [lv, cls] = level(p);
    return `<div class="fish ${cls}"><div class="pic">${fishSVG(f.f, i)}</div><div class="fn">${f.n}<span class="lt">${LIGHT_NAME[LIGHT[f.n]]}</span></div><div class="fp"><b>${p}%</b><span class="lv ${cls}">${lv}</span></div>${spark(arr, H)}<div class="bestH">최고 ${String(best).padStart(2, '0')}시 ${arr[best]}%</div></div>`;
  }).join('');
  if (pt && pt.kind === 'rock') $('rockInfo').innerHTML = rockInfoHTML(pt); else $('rockInfo').innerHTML = '';
  if (typeof renderBasis === 'function') renderBasis();
  if (typeof renderToday === 'function') renderToday();
  if (typeof renderLog === 'function') renderLog();
}
