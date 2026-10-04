// 10_tide.js — 조석: 예보지점·물때·조위 보간
/* ── 조석: 국립해양조사원 조석예보(고, 저조) 예보지점 166곳, 오늘부터 15일 ─
   물때 이름은 음력 날짜로 정한다 (서해 7물때식: 음력 1일 = 7물, 그 밖 8물때식: 음력 1일 = 8물).
   물때 세기(%)는 그 지점의 15일(사리~조금 한 주기) 중 하루 조차가 가장 큰 날을 100으로 본 그날 조차 비율. */
const DAY0 = TIDE.from, NDAYS = 7;
const KST_NOW = new Date(Date.now() + 9 * 36e5), TODAY = KST_NOW.toISOString().slice(0, 10);
const TODAY_IDX = Math.max(0, Math.round((new Date(TODAY + 'T12:00:00Z') - new Date(DAY0 + 'T12:00:00Z')) / 864e5));   // 새벽 갱신 전이면 1
const dateAdd = (d, n) => { const x = new Date(d + 'T12:00:00+09:00'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const regionOf = (lat, lon) => (lon > 129.15 && lat > 35.3) || (lat > 35.9 && lon > 128.3) || lon > 130 ? '동해'
  : lat < 33.75 || (lat < 34.05 && lon > 126.1 && lon < 126.45) ? '제주' : (lat > 34.6 && lon < 126.95) || lon < 126 ? '서해' : '남해';
const mulOf = (reg, ld) => { if (reg === '서해') { const n = ((ld - 24) % 15 + 15) % 15; return n === 0 ? '무시' : n === 14 ? '조금' : n + '물'; } const n = ((ld - 23) % 15 + 15) % 15; return n === 0 ? '조금' : n + '물'; };
const TDATES = Object.keys(TIDE.lunar).sort();
S.day = Math.min(TODAY_IDX, NDAYS - 1);
const STATIONS = Object.entries(TIDE.st).map(([id, o]) => {
  const region = regionOf(o.lat, o.lon);
  const days = TDATES.map(date => { const [lm, ld, leap] = TIDE.lunar[date]; return { date, lunar: (leap ? '윤' : '') + lm + '.' + ld, mul: mulOf(region, ld), ev: (o.days[date] || []).map(([t, cm, k]) => [+t.slice(0, 2) + t.slice(3, 5) / 60, cm, k]) }; });
  const rng = days.map((d, i) => { const e = [...(days[i - 1] ? days[i - 1].ev.slice(-1) : []), ...d.ev, ...(days[i + 1] ? days[i + 1].ev.slice(0, 1) : [])].map(x => x[1]); return e.length > 1 ? Math.max(...e) - Math.min(...e) : 0; });
  const mx = Math.max(...rng) || 1; days.forEach((d, i) => d.pct = Math.round(rng[i] / mx * 100));
  const prev = (o.days[dateAdd(DAY0, -1)] || []).map(([t, cm, k]) => [+t.slice(0, 2) + t.slice(3, 5) / 60 - 24, cm, k]);   // 어제 극값: 오늘 0시 전후 곡선용
  return { id, name: o.name, lat: o.lat, lon: o.lon, region, days, prev };
}).filter(st => st.days.some(d => d.ev.length));
for (const st of STATIONS) {
  st.ev = [...st.prev]; st.days.forEach((d, i) => d.ev.forEach(([h, cm, k]) => st.ev.push([i * 24 + h, cm, k])));
  st.ev.sort((a, b) => a[0] - b[0]);
  const hs = st.ev.map(e => e[1]); st.msl = hs.reduce((a, b) => a + b, 0) / hs.length;   // 극값 평균 ≈ 평균해면
  st.minCm = Math.min(...hs); st.maxCm = Math.max(...hs);
  let mr = 0; for (let i = 1; i < st.ev.length; i++) { const [t0, h0] = st.ev[i - 1], [t1, h1] = st.ev[i]; mr = Math.max(mr, Math.abs(h1 - h0) * Math.PI / 2 / (t1 - t0)); }
  st.maxRate = mr || 1;
  st.mx = mxOf(st.lon); st.my = myOf(st.lat);
}
function tideAt(st, tA) {               // tA: 오늘(DAY0) 00시부터 시간
  const E = st.ev; if (tA <= E[0][0]) return { cm: E[0][1], rate: 0 }; if (tA >= E[E.length - 1][0]) return { cm: E[E.length - 1][1], rate: 0 };
  let i = 1; while (E[i][0] < tA) i++;
  const [t0, h0] = E[i - 1], [t1, h1] = E[i], f = (tA - t0) / (t1 - t0);
  return { cm: (h0 + h1) / 2 + (h0 - h1) / 2 * Math.cos(Math.PI * f), rate: (h1 - h0) / 2 * Math.PI / (t1 - t0) * Math.sin(Math.PI * f) };
}
function getTide() {
  const st = STATIONS[S.st], tA = S.day * 24 + S.t, r = tideAt(st, tA);
  return { eta: (r.cm - st.msl) / 100, u: r.rate / st.maxRate, cm: r.cm, rate: r.rate, tA };
}
