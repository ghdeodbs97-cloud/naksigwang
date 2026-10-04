// 22_catchlog.js — 내 조과 기록
/* ── 내 조황 기록: 이 기기 브라우저(localStorage)에 저장. 로그인·서버 저장은 다음 단계 ── */
function localCatches() {
  const K = 'nsg_catches', subs = [];
  const read = () => { try { return JSON.parse(localStorage.getItem(K) || '[]'); } catch (e) { return []; } };
  const write = a => { try { localStorage.setItem(K, JSON.stringify(a)); } catch (e) { throw { code: '저장 공간 사용 불가' }; } const docs = a.map(x => ({ id: x.id, data: () => x })); subs.forEach(f => f({ docs })); };
  return {
    onSnapshot(f) { subs.push(f); f({ docs: read().map(x => ({ id: x.id, data: () => x })) }); },
    async add(o) { const a = read(); a.push({ ...o, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }); write(a); },
    doc(id) { return { async delete() { write(read().filter(x => x.id !== id)); } }; }
  };
}
let catchDB = null, catchCol = null, myId = '';
$('logSpecies').innerHTML = '<option value="">어종 선택</option>' + FISH.map(f => `<option>${f.n}</option>`).join('') + '<option value="-">꽝 (못 잡음)</option>';
function renderLog() {
  const pt = POINTS[S.pt]; $('logPt').textContent = pt ? pt.name : '—';
  if (!$('logDate').value) $('logDate').value = STATIONS[S.st].days[S.day].date;
  const list = CATCHES.slice().sort((a, b) => (b.date + b.hour).localeCompare(a.date + a.hour)).slice(0, 12);
  $('logList').innerHTML = list.length ? list.map(c => `<li><b>${c.date.slice(5)} ${c.hour}</b> ${c.pt} · ${c.species === '-' ? '꽝' : c.species + ' ' + c.count + '마리'}${c.memo ? ' · ' + c.memo.replace(/[<>&]/g, '') : ''} <button type="button" class="linkBtn" data-del="${c.id}">삭제</button></li>`).join('') : '<li class="hint">아직 기록이 없습니다.</li>';
  $('logCount').textContent = CATCHES.length ? `전체 ${CATCHES.length}건` : '';
}
(async () => {
  try {
    catchDB = window.claude && window.claude.use && await window.claude.use('db');
    if (!catchDB) { catchCol = localCatches(); $('logCount').title = '이 기기의 브라우저에만 저장됩니다'; }
    else { const user = await window.claude.use('user'); myId = user ? await user.id() : ''; catchCol = catchDB.collection('catches'); }
    catchCol.onSnapshot(snap => { CATCHES = snap.docs.map(d => ({ id: d.id, ...d.data() })); renderBite(); }, e => { $('logMsg').textContent = '기록을 불러오지 못했습니다 (' + e.code + ').'; });
  } catch (e) { $('logMsg').textContent = '기록 저장소에 연결하지 못했습니다.'; }
})();
$('logForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!catchCol) return;
  const pt = POINTS[S.pt], sp = $('logSpecies').value, cnt = sp === '-' ? 0 : Math.max(0, Math.round(+$('logCount2').value || 0));
  if (!sp) { $('logMsg').textContent = '어종을 고르세요 (못 잡았으면 "꽝").'; return; }
  if (sp !== '-' && cnt < 1) { $('logMsg').textContent = '마릿수를 1 이상으로 넣으세요.'; return; }
  const st = STATIONS[pt.st];
  try {
    await catchCol.add({ date: $('logDate').value, hour: $('logHour').value || '', pt: pt.name, lat: +pt.lat.toFixed(5), lon: +pt.lon.toFixed(5), region: st.region, station: st.name, species: sp, count: cnt, memo: $('logMemo').value.slice(0, 120), by: myId, at: new Date().toISOString() });
    $('logMsg').textContent = '저장했습니다. 이 기록이 조과 지수 보정에 바로 반영됩니다.'; $('logMemo').value = '';
  } catch (err) { $('logMsg').textContent = '저장하지 못했습니다 (' + (err && err.code || '오류') + ').'; }
});
$('logList').addEventListener('click', async e => {
  const b = e.target.closest('[data-del]'); if (!b || !catchCol) return;
  try { await catchCol.doc(b.dataset.del).delete(); } catch (err) { $('logMsg').textContent = '삭제하지 못했습니다 (' + (err && err.code || '오류') + ').'; }
});
