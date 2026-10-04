// 00_boot.js — 공통 도구와 매일 갱신 자료(data/*.json) 불러오기
const $ = id => document.getElementById(id);
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 매일 갱신 자료: GitHub Actions 수집기가 하루 2번 공공데이터포털 API를 받아 data/*.json으로 저장 ── */
async function loadJSON(n) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const r = await fetch(`data/${n}.json?v=${Date.now() / 6e5 | 0}`, { cache: 'no-cache', signal: controller.signal });
    if (!r.ok) throw new Error(n + '.json ' + r.status);
    const data = await r.json();
    if (!validBootData(n, data)) throw new Error(n + '.json 형식 오류 또는 빈 자료');
    return data;
  } finally { clearTimeout(timer); }
}
function validBootData(name, data) {
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const coords = o => obj(o) && Number.isFinite(o.lat) && Number.isFinite(o.lon);
  if (!obj(data)) return false;
  if (name === 'meta') return typeof data.generated === 'string' && Number.isFinite(Date.parse(data.generated));
  if (name === 'obs') return Object.values(data).every(o => coords(o) && (!o.sst ||
    (Array.isArray(o.sst) && Number.isFinite(o.sst[0]) && typeof o.sst[1] === 'string')));
  if (name === 'wx') return typeof data.base === 'string' && obj(data.cells) && Object.values(data.cells).every(c =>
    obj(c) && Object.values(c).every(v => Array.isArray(v) && v.length === 3 && v.every(x => x === null || Number.isFinite(x))));
  if (name === 'tide') {
    if (typeof data.from !== 'string' || !Number.isFinite(Date.parse(data.from)) || !obj(data.lunar) || !obj(data.st)) return false;
    const dates = Object.keys(data.lunar);
    if (!dates.length || !Object.values(data.lunar).every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return false;
    // 손상된 일부 지점은 제외하고 정상 지점이 남으면 앱을 계속 시작한다.
    data.st = Object.fromEntries(Object.entries(data.st).filter(([, o]) => coords(o) && obj(o.days) &&
      Object.values(o.days).every(es => Array.isArray(es) && es.every(e => Array.isArray(e) && e.length === 3 &&
        typeof e[0] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(e[0]) && Number.isFinite(e[1]) && ['H', 'L'].includes(e[2]))) &&
      dates.some(d => o.days[d]?.length)));
    return Object.keys(data.st).length > 0;
  }
  return false;
}
function bootNotice(text, fatal = false) {
  const p = document.createElement('p');
  p.style.cssText = `padding:10px 16px;margin:0;color:${fatal ? '#ff7a6e' : '#ffcf78'};background:#0b171d;font:13px sans-serif`;
  p.textContent = text;
  document.body.prepend(p);
}

const DATA_LOAD = {};
const dataNames = ['tide', 'obs', 'wx', 'meta'];
const settled = await Promise.allSettled(dataNames.map(loadJSON));
for (let i = 0; i < dataNames.length; i++) DATA_LOAD[dataNames[i]] = settled[i];

// 조석은 앱 전체 계산의 기준이므로 필수. 나머지 원천은 없어도 해당 기능만 제한한다.
if (DATA_LOAD.tide.status !== 'fulfilled' || !DATA_LOAD.tide.value || !DATA_LOAD.tide.value.from || !DATA_LOAD.tide.value.lunar || !DATA_LOAD.tide.value.st) {
  const why = DATA_LOAD.tide.status === 'rejected' ? DATA_LOAD.tide.reason.message : '형식 오류';
  bootNotice(`조석 자료를 불러오지 못해 앱을 시작할 수 없습니다 (${why}).`, true);
  throw new Error('tide.json unavailable: ' + why);
}

const TIDE = DATA_LOAD.tide.value;
const OBS = DATA_LOAD.obs.status === 'fulfilled' && DATA_LOAD.obs.value && typeof DATA_LOAD.obs.value === 'object' ? DATA_LOAD.obs.value : {};
const WXG = DATA_LOAD.wx.status === 'fulfilled' && DATA_LOAD.wx.value && DATA_LOAD.wx.value.cells ? DATA_LOAD.wx.value : { base: '', cells: {} };
const metaOk = DATA_LOAD.meta.status === 'fulfilled' && DATA_LOAD.meta.value && DATA_LOAD.meta.value.generated;
const META = metaOk ? DATA_LOAD.meta.value : { generated: new Date().toISOString(), errors: [], degraded: true };

const optionalFailed = ['obs', 'wx', 'meta'].filter(n => DATA_LOAD[n].status !== 'fulfilled');
if (optionalFailed.length) {
  const labels = { obs: '수온·관측', wx: '기상', meta: '갱신시각' };
  bootNotice(`${optionalFailed.map(n => labels[n]).join(', ')} 자료를 불러오지 못했습니다. 가능한 기능은 계속 사용할 수 있습니다.`);
}

{
  let txt = '확인 불가';
  if (metaOk) {
    const g = new Date(META.generated);
    if (!Number.isNaN(g.getTime())) txt = `${g.getMonth() + 1}/${g.getDate()} ${String(g.getHours()).padStart(2, '0')}:${String(g.getMinutes()).padStart(2, '0')}`;
  }
  $('dataTime').textContent = txt;
  $('dataTime2').textContent = txt;
}
