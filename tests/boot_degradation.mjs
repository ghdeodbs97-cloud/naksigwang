import fs from 'node:fs';
import assert from 'node:assert/strict';
const boot = fs.readFileSync(new URL('../src/app/00_boot.js', import.meta.url), 'utf8');
const now = new Date(), day = new Date(+now + 9 * 36e5).toISOString().slice(0, 10);
const dateAddTest = (date, i) => new Date(Date.parse(date + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10);
const dates = Array.from({ length: 7 }, (_, i) => dateAddTest(day, i));
const base = new Date(+now + 9 * 36e5).toISOString().replace(/[-:T]/g, '').slice(0, 12);
const station = { name: '지점', lat: 35, lon: 129, days: Object.fromEntries(dates.map(d => [d, [['06:00', 100, 'H']]])) };
const good = {
  tide: { from: day, lunar: Object.fromEntries(dates.map(d => [d, [8, 24, 0]])), st: { A: station } },
  obs: { A: { name: '관측', lat: 35, lon: 129, sst: [20, day + ' 00:00'] } },
  wx: { base, cells: { '1,1': { [day.replaceAll('-', '') + '12']: [90, 5, 1] } } },
  meta: { generated: now.toISOString() },
};
async function run(overrides = {}, rejected = []) {
  const els = { dataTime: { textContent: '' }, dataTime2: { textContent: '' } }, notices = [];
  const document = { body: { prepend(x) { notices.push(x.textContent); } }, createElement() { return { style: {} }; }, getElementById(id) { return els[id]; } };
  const fn = new Function('fetch', 'document', 'matchMedia', `return (async()=>{${boot}\nreturn {TIDE, OBS, WXG, META, DATA_LOAD};})()`);
  const result = await fn(async url => {
    const name = /data\/(\w+)\.json/.exec(url)[1];
    if (rejected.includes(name)) throw new Error('연결 실패');
    return { ok: true, json: async () => structuredClone(Object.hasOwn(overrides, name) ? overrides[name] : good[name]) };
  }, document, () => ({ matches: false }));
  return { result, els, notices };
}
assert.match((await run()).els.dataTime.textContent, /^자료 갱신/);
for (const name of ['obs', 'wx', 'meta']) {
  const r = await run({}, [name]);
  assert.equal(r.result.DATA_LOAD[name].status, 'rejected');
  assert.equal(r.notices.length, 1);
  if (name === 'meta') assert.equal(r.els.dataTime.textContent, '확인 불가');
  for (const value of [null, [], 'broken', { broken: true }, ...(name === 'obs' ? [{}] : name === 'wx' ? [{ base, cells: {} }] : [])]) {
    const bad = await run({ [name]: value });
    assert.equal(bad.result.DATA_LOAD[name].status, 'rejected');
    assert.equal(bad.notices.length, 1);
  }
}
const missing = await run({}, ['obs', 'wx', 'meta']);
assert.deepEqual(missing.result.OBS, {});
assert.deepEqual(missing.result.WXG.cells, {});
assert.equal(missing.notices.length, 1);
await assert.rejects(run({}, ['tide']), /tide.json unavailable/);
for (const value of [null, {}, { ...good.tide, st: {} }, { ...good.tide, lunar: {} }]) await assert.rejects(run({ tide: value }), /tide.json unavailable/);
const short = structuredClone(good.tide);
short.from = dateAddTest(day, -1);
short.lunar = { [short.from]: [8, 23, 0] };
short.st.A.days = { [short.from]: [['06:00', 100, 'H']] };
await assert.rejects(run({ tide: short }), /tide.json unavailable/);
const partial = structuredClone(good.tide);
partial.st.B = structuredClone(station);
delete partial.st.B.days[dates[2]];
const filtered = await run({ tide: partial });
assert.deepEqual(Object.keys(filtered.result.TIDE.st), ['A']);
assert.ok(filtered.notices.some(n => n.includes('조석 지점')));
for (const status of ['merged_fallback', 'kept_previous_low_fresh_ratio', 'kept_previous_incomplete']) {
  const r = await run({ meta: { generated: now.toISOString(), 'wx.json': { status } } });
  assert.match(r.els.dataTime.textContent, status === 'merged_fallback' ? /일부 이전 자료 사용/ : /이전 자료 사용 중/);
  assert.ok(r.notices.some(n => n.includes('기상')));
}
const stale = await run({ meta: { generated: new Date(+now - 3 * 864e5).toISOString() } });
assert.match(stale.els.dataTime.textContent, /이전 자료 사용 중/);
// 구형 파일 및 인접 격자에서도 실제 발표 시각을 사용하는지 검증한다.
const forecast = fs.readFileSync(new URL('../src/app/13_forecast.js', import.meta.url), 'utf8');
const code = forecast.slice(forecast.indexOf('const WX_CELL'), forecast.indexOf('function buildPoints'));
function forecastFor(wx, obs = {}) {
  return new Function('WXG', 'OBS', 'DAY0', 'dateAdd', 'kmaGrid', 'dirName', 'gdist', code + '\nreturn {wxAt, sstFor};')(
    wx, obs, day, dateAddTest, () => [1, 1], () => '동', () => 1);
}
const oldBase = '202601010800';
let w = structuredClone(good.wx); w.bases = { '1,1': oldBase };
assert.match(forecastFor(w).wxAt(station, 0, 12).from, /2026\/01\/01 08시 발표 \(이전 발표\)/);
assert.ok(forecastFor(good.wx).wxAt(station, 0, 12).from.includes(base.slice(8, 10) + '시 발표'));
w.cells['2,1'] = w.cells['1,1']; delete w.cells['1,1']; w.bases = { '2,1': oldBase };
assert.match(forecastFor(w).wxAt(station, 0, 12).from, /2026\/01\/01/);
assert.equal(forecastFor(good.wx, { A: { ...station, sst: [20, '2026-01-01 00:00'] } }).sstFor({id: 'A'}), null);
console.log('초기 로딩·빈 자료·조석 날짜·보존 상태·격자 발표시각 회귀: 통과');

await run({ meta: { generated: now.toISOString(), 'wx.json': { status: 123 } } });
