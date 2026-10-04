// 08_depth_api.js — 공공 수심 API 불러오기
/* ── 공공 수심 API (국립해양조사원 자연과학용 수심정보, BADA2024) ─────
   요청 주소·파라미터 이름은 추측하지 않는다. 사용자가 공공데이터포털에서 받은 "요청 주소 예시"를 그대로 쓰고,
   그 안의 파라미터 중 어떤 것이 범위(최소·최대 위도·경도)인지 사용자가 지정한다. */
const BADA = { tiles: new Map(), TILE: .03 };
function apiCfg() {
  return { url: $('apiUrl').value.trim(), key: $('apiKey').value.trim(), proxy: $('apiProxy').value.trim(),
    map: { minLat: $('pMinLat').value, maxLat: $('pMaxLat').value, minLon: $('pMinLon').value, maxLon: $('pMaxLon').value } };
}
function apiSave() { try { const c = apiCfg(); sessionStorage.setItem('ps_api', JSON.stringify(c)); } catch (e) {} }
function apiLoad() {
  try { const c = JSON.parse(sessionStorage.getItem('ps_api') || 'null'); if (!c) return; $('apiUrl').value = c.url || ''; $('apiKey').value = c.key || ''; $('apiProxy').value = c.proxy || ''; apiParams(c.map); } catch (e) {}
}
function apiParams(pre) {
  let names = [];
  try { names = [...new URL($('apiUrl').value.trim()).searchParams.keys()]; } catch (e) {}
  const guess = { minLat: [/min.*la|la.*min|south|lat_?1|stLat/i], maxLat: [/max.*la|la.*max|north|lat_?2|edLat/i], minLon: [/min.*lo|lo.*min|west|lon_?1|stLon/i], maxLon: [/max.*lo|lo.*max|east|lon_?2|edLon/i] };
  for (const k of Object.keys(guess)) {
    const sel = $('p' + k[0].toUpperCase() + k.slice(1));
    const g = (pre && pre[k]) || names.find(n => guess[k].some(re => re.test(n))) || '';
    sel.innerHTML = '<option value="">선택</option>' + names.map(n => `<option${n === g ? ' selected' : ''}>${n}</option>`).join('');
  }
  $('apiParamsNote').textContent = names.length ? `요청 주소에서 찾은 파라미터: ${names.join(', ')}` : '요청 주소를 붙여 넣으면 파라미터 목록이 나옵니다.';
}
function apiMsg(t) { $('apiMsg').textContent = t; }
async function apiFetchTile(cfg, la1, lo1) {
  const la2 = la1 + BADA.TILE, lo2 = lo1 + BADA.TILE;
  const u = new URL(cfg.url);
  const set = (name, v) => { if (name) u.searchParams.set(name, v.toFixed(6)); };
  set(cfg.map.minLat, la1); set(cfg.map.maxLat, la2); set(cfg.map.minLon, lo1); set(cfg.map.maxLon, lo2);
  if (cfg.key) for (const n of [...u.searchParams.keys()]) if (/^servicekey$/i.test(n)) u.searchParams.set(n, cfg.key);
  const hasPage = u.searchParams.has('pageNo') && u.searchParams.has('numOfRows');
  let page = 1, got = 0;
  for (; page <= 20; page++) {
    if (hasPage) u.searchParams.set('pageNo', String(page));
    const target = cfg.proxy ? cfg.proxy + encodeURIComponent(u.toString()) : u.toString();
    const res = await fetch(target);
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} · ${text.slice(0, 160)}`);
    let obj = null;
    try { obj = JSON.parse(text); } catch (e) {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      const err = doc.querySelector('returnAuthMsg, errMsg, resultMsg'); const code = doc.querySelector('returnReasonCode, resultCode');
      const items = [...doc.querySelectorAll('item')].map(it => Object.fromEntries([...it.children].map(c => [c.tagName, c.textContent])));
      if (!items.length && err) throw new Error(`응답 오류: ${err.textContent}${code ? ' (' + code.textContent + ')' : ''}`);
      obj = items;
    }
    const recs = findRecords(obj);
    if (!recs.length) { if (page === 1 && obj && !Array.isArray(obj)) { const s = JSON.stringify(obj).slice(0, 200); if (/error|err|fail/i.test(s)) throw new Error('응답 오류: ' + s); } break; }
    const r0 = recs[0], la = pickKey(r0, [/^lat(itude)?$/i, /위도/, /lat/i]), lo = pickKey(r0, [/^(lon|lng|longitude)$/i, /경도/, /lon|lng/i]), dk = pickDepthKey(r0) || pickKey(r0, [/dep|dpth|수심/i]);
    if (!la || !lo || !dk) throw new Error('응답 항목에서 위도·경도·수심을 찾지 못했습니다. 항목: ' + Object.keys(r0).join(', '));
    for (const r of recs) { const lat = num(r[la]), lon = num(r[lo]), d = num(r[dk]); if (isFinite(lat) && isFinite(lon) && isFinite(d)) { addDepthPt('bada', mxOf(lon), myOf(lat), Math.abs(d), 150, 'BADA2024 API', ''); got++; } }
    if (!hasPage || recs.length < +u.searchParams.get('numOfRows')) break;
  }
  return got;
}
let apiBusy = false;
async function apiLoadViewport() {
  const cfg = apiCfg(); apiSave();
  if (!cfg.url) { apiMsg('공공데이터포털에서 받은 요청 주소를 먼저 붙여 넣으세요.'); return; }
  try { new URL(cfg.url); } catch (e) { apiMsg('요청 주소 형식이 올바르지 않습니다 (https://로 시작해야 합니다).'); return; }
  if (!cfg.map.minLat || !cfg.map.maxLat || !cfg.map.minLon || !cfg.map.maxLon) { apiMsg('최소·최대 위도·경도에 해당하는 파라미터를 모두 고르세요.'); return; }
  const gw = cw / pxPerGround(); if (gw > 15000) { apiMsg('지도 폭 15 km 이하로 확대한 뒤 불러오세요. 전국 자료를 한 번에 요청하지 않습니다.'); return; }
  if (apiBusy) return; apiBusy = true;
  const [mx1, my1] = toM(0, ch), [mx2, my2] = toM(cw, 0), T = BADA.TILE;
  const la1 = Math.floor(latOf(my1) / T) * T, la2 = latOf(my2), lo1 = Math.floor(lonOf(mx1) / T) * T, lo2 = lonOf(mx2);
  const want = []; for (let la = la1; la < la2; la += T) for (let lo = lo1; lo < lo2; lo += T) { const key = cfg.url.split('?')[0] + '|' + la.toFixed(3) + ',' + lo.toFixed(3); if (!BADA.tiles.has(key)) want.push([key, la, lo]); }
  if (!want.length) { apiMsg('이 화면 범위는 이미 불러왔습니다 (같은 범위는 다시 요청하지 않습니다).'); apiBusy = false; return; }
  let total = 0, done = 0;
  for (const [key, la, lo] of want.slice(0, 16)) {
    apiMsg(`불러오는 중… ${done + 1}/${Math.min(16, want.length)} 타일`);
    try { total += await apiFetchTile(cfg, la, lo); BADA.tiles.set(key, 'ok'); done++; }
    catch (e) {
      const blocked = e instanceof TypeError;
      apiMsg(blocked ? '호출이 차단되었습니다. Claude 아티팩트 화면은 보안 정책으로 외부 주소를 부를 수 없고, 공공데이터포털 API는 브라우저 직접 호출(CORS)을 허용하지 않을 수 있습니다. 내려받은 HTML을 PC 브라우저에서 열고 "프록시 주소"에 서버리스·백엔드 프록시를 넣어 사용하세요.' : '불러오기 실패: ' + e.message);
      apiBusy = false; return;
    }
  }
  apiBusy = false; dirty = true; analyzeSection(); updateDataCount();
  apiMsg(`BADA2024 ${total.toLocaleString()}점을 ${done}개 타일에서 불러왔습니다` + (want.length > 16 ? ` (남은 ${want.length - 16}개 타일은 다시 누르면 이어서 불러옵니다)` : '') + '.');
}
