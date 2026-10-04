// 00_boot.js — 공통 도구와 매일 갱신 자료(data/*.json) 불러오기
const $ = id => document.getElementById(id);
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 매일 갱신 자료: GitHub Actions 수집기가 하루 2번 공공데이터포털 API를 받아 data/*.json으로 저장 ── */
async function loadJSON(n) { const r = await fetch(`data/${n}.json?v=${Date.now() / 6e5 | 0}`, { cache: 'no-cache' }); if (!r.ok) throw new Error(n + '.json ' + r.status); return r.json(); }
let TIDE, OBS, WXG, META;
try { [TIDE, OBS, WXG, META] = await Promise.all(['tide', 'obs', 'wx', 'meta'].map(loadJSON)); }
catch (e) { document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px;color:#ff7a6e;font:14px sans-serif">예보 자료를 불러오지 못했습니다 (${e.message}). 잠시 뒤 새로고침해 주세요.</p>`); throw e; }
{ const g = new Date(META.generated); $('dataTime').textContent = `${g.getMonth() + 1}/${g.getDate()} ${String(g.getHours()).padStart(2, '0')}:${String(g.getMinutes()).padStart(2, '0')}`; }
