import fs from 'node:fs';
import assert from 'node:assert/strict';

const boot = fs.readFileSync(new URL('../src/app/00_boot.js', import.meta.url), 'utf8');

async function run(fetchImpl) {
  const els = { dataTime: { textContent: '' }, dataTime2: { textContent: '' } };
  const notices = [];
  const document = {
    body: { prepend(x) { notices.unshift(x); } },
    createElement() { return { style: { cssText: '' }, textContent: '' }; },
    getElementById(id) { return els[id] || {}; },
  };
  const fn = new Function('fetch', 'document', 'matchMedia', `return (async()=>{${boot}\nreturn { OBS, WXG, META, DATA_LOAD };})()`);
  const result = await fn(fetchImpl, document, () => ({ matches: false }));
  return { result, els, notices };
}

const okTide = { from: '2026-10-04', lunar: { '2026-10-04': [8, 24, 0] }, st: { A: { name: 'A', lat: 1, lon: 1, days: { '2026-10-04': [['06:00', 100, 'H']] } } } };

const degraded = await run(async url => {
  if (url.includes('tide.json')) return { ok: true, status: 200, json: async () => okTide };
  if (url.includes('obs.json')) throw new Error('obs down');
  if (url.includes('wx.json')) return { ok: true, status: 200, json: async () => ({ base: '202610040800', cells: {} }) };
  return { ok: false, status: 503, json: async () => ({}) };
});
assert.deepEqual(degraded.result.OBS, {});
assert.equal(degraded.result.META.degraded, true);
assert.equal(degraded.els.dataTime.textContent, '확인 불가');
assert.equal(degraded.notices.length, 1);

let failed = false;
try {
  await run(async url => {
    if (url.includes('tide.json')) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({}) };
  });
} catch (e) {
  failed = /tide\.json unavailable/.test(String(e));
}
assert.equal(failed, true, 'tide failure must remain fatal');
console.log('boot degradation tests: PASS');

const good = { tide: okTide, obs: {}, wx: { base: '202610040800', cells: {} }, meta: { generated: '2026-10-04T12:00:00+09:00' } };
for (const name of ['obs', 'wx', 'meta']) {
  for (const value of [null, [], 'broken', { broken: true }]) {
    const r = await run(async url => {
      const key = /data\/(\w+)\.json/.exec(url)[1];
      return { ok: true, json: async () => key === name ? value : structuredClone(good[key]) };
    });
    assert.equal(r.notices.length, 1, `${name}: 잘못된 형식 안내`);
    assert.equal(r.result.DATA_LOAD[name].status, 'rejected');
  }
}
for (const value of [null, {}, { ...okTide, st: {} }, { ...okTide, lunar: {} }]) {
  await assert.rejects(run(async url => ({ ok: true, json: async () => url.includes('tide.json') ? value : {} })), /tide.json unavailable/);
}
const allMissing = await run(async url => {
  if (url.includes('tide.json')) return { ok: true, json: async () => structuredClone(okTide) };
  throw new Error('연결 실패');
});
assert.deepEqual(allMissing.result.WXG.cells, {});
assert.equal(allMissing.notices.length, 1);
console.log('확장 초기 로딩 회귀 테스트: 통과');
