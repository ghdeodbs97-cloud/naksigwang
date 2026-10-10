// 20_readouts.js — 계기판 값 표시
/* ── 계기판 ────────────────────────────────────────────── */
const fmtH = t => { t = ((t % 24) + 24) % 24; const h = Math.floor(t), m = Math.floor((t - h) * 60); return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'); };
const setText = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };
const DIRS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const dirName = d => DIRS[Math.round((((d % 360) + 360) % 360) / 45) % 8];
function updateReadouts(tide) {
  setText('clock', fmtH(S.t));
  setText('etaVal', Math.round(tide.cm) + ' cm');
  const slack = Math.abs(tide.u) < .15, dd = STATIONS[S.st].days[S.day];
  const pt = POINTS[S.pt], fu = flowU(STATIONS[S.st], pt, S.day, tide.tA);
  setText('curVal', fu.real ? Math.round(fu.u * 100) + '% · ' + (fu.r.sp * KN < .2 ? '물돌이 무렵' : dirName16(fu.r.dir) + '쪽으로 흐름') + ' (조류 예보)'
    : Math.round(Math.abs(tide.u) * 100) + '% · ' + (slack ? '정조 무렵' : tide.u > 0 ? '들물 중' : '날물 중') + (weakTide(STATIONS[S.st]) ? ' (조차가 작아 점수에 작게 반영)' : ' (바닷물 높이 변화로 추정)'));
  updateCrnt(pt, tide);
  const wst = STATIONS[S.st]; setText('curDir', dd.mul + ' (물때 세기 ' + dd.pct + '%)' + (weakTide(wst) ? ` · 조차 ${Math.round(wst.maxCm - wst.minCm)} cm라 점수에 작게 반영` : ''));
  const wx = wxAt(STATIONS[S.st], S.day, S.t, POINTS[S.pt]);
  S.hs = wx && wx.wave != null ? wx.wave : .5;
  setText('wxWind', wx ? wx.dir + '풍 ' + (wx.sp == null ? '(세기 정성 예보)' : wx.sp.toFixed(1) + ' m/s') : '자료 없음');
  setText('wxWave', wx && wx.wave != null ? wx.wave.toFixed(2) + ' m' : '자료 없음');
  const sw = sstFor(pt || STATIONS[S.st]); setText('wxSst', sw ? `${sw[0].toFixed(1)} ℃ (${sw[2]} ${sw[3]} km · ${sw[1]} 관측)` : '50 km 안 최근 관측 없음');
  setText('wxSlot', wx ? String(wx.slot).padStart(2, '0') + '시 예보 · ' + wx.from + (wx.near ? ` (약 ${wx.km} km 옆 격자)` : '') : S.day <= TODAY_IDX ? '이 시각 예보 없음 (이미 지난 시각)' : '이 시각 예보 없음 (기상청 단기예보는 3~5일 뒤까지)');
  const chip = $('tideChip');
  const label = slack ? (tide.eta > 0 ? '만조 전후 · 정조' : '간조 전후 · 정조') : tide.u > 0 ? '들물' : '날물';
  if (chip.textContent !== label) { chip.textContent = label; chip.className = 'chip ' + (slack ? 'slack' : tide.u > 0 ? 'in' : 'out'); }
  const st = STATIONS[S.st], nh = st.ev.find(e => e[0] > tide.tA && e[2] === 'H'), nl = st.ev.find(e => e[0] > tide.tA && e[2] === 'L');
  const fmtE = e => { if (!e) return '—'; const dd = Math.floor(e[0] / 24) - S.day; return fmtH(e[0] % 24) + (dd > 0 ? ` (+${dd}일)` : '') + ' ' + e[1] + 'cm'; };
  setText('nextHW', fmtE(nh)); setText('nextLW', fmtE(nl));
  if (SEC) {
    setText('sLen', fmtD(SEC.L)); setText('sCross', SEC.cross.length + '곳');
    let md = null, sea = 0, me = 0; for (const p of SEC.pts) if (!p.land) { sea++; if (isPub(p.r.type)) me++; if (!md || p.r.depth > md.depth) md = p.r; } setText('sMax', md ? fmtDepth(md) + (md.type === 'est' ? ' (추정)' : md.type === 'gebco' ? ' (GEBCO)' : '') : '—'); setText('sMeas', sea ? Math.round(me / sea * 100) + '%' : '—');
  } else { setText('sLen', '—'); setText('sCross', '—'); setText('sMax', '—'); setText('sMeas', '—'); }
  setText('sTide', Math.round(tide.cm) + ' cm (' + STATIONS[S.st].name + ', 기본수준면 기준)');
}


function updateCrnt(pt, tide) {
  if (!CR.ready) { setText('crNow', CR.err ? '불러오지 못함: ' + CR.err : '불러오는 중…'); setText('crDay', '—'); setText('crSrc', '—'); return; }
  const st = STATIONS[S.st], nc = nearestCrnt(pt ? pt.lat : st.lat, pt ? pt.lon : st.lon);
  if (!nc || nc.km > CR_NEAR) { setText('crNow', '15 km 안에 예보 지점 없음'); setText('crDay', '—'); setText('crSrc', nc ? `가장 가까운 지점: ${nc.c.name} ${nc.km.toFixed(0)} km` : '—'); return; }
  const r = crntAt(nc.c, tide.tA);
  setText('crNow', !r ? '예보 기간 밖' : r.sp * KN < .2 ? `물돌이 무렵 (${(r.sp * KN).toFixed(1)} 노트)` : `${dirName16(r.dir)}쪽으로 ${(r.sp * KN).toFixed(1)} 노트 (${Math.round(r.sp)} cm/s)`);
  const ev = crntDay(nc.c, S.day);
  setText('crDay', ev.map(e => e.sp === 0 ? `${fmtH(e.h)} 물돌이` : `${fmtH(e.h)} 최강 ${dirName16(e.dir)} ${(e.sp * KN).toFixed(1)}kn`).join(' · ') || '—');
  setText('crSrc', `${nc.c.name} 예보 지점 · ${nc.km < 1 ? '1 km 이내' : nc.km.toFixed(1) + ' km'}${nc.km > CR_GOOD ? ' (떨어져 있어 세기·방향은 다를 수 있음)' : ''}`);
}
