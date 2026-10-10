// 20b_today.js — 「오늘」 탭: 선택한 포인트의 오늘·지금 요약 (물때 상태, 조석 띠, 바람·파고·수온·조류, 잘 맞는 시간)
const tdc = $('todayChart'), tdx = tdc.getContext('2d');
let TD = null;   // 그림에 쓰는 오늘 자료 (renderToday가 만들고 drawToday가 그림)
const kstHour = () => { const d = new Date(Date.now() + 9 * 36e5); return d.getUTCHours() + d.getUTCMinutes() / 60; };
function goodHourRanges(scores) {
  const ranges = [];
  for (let h = 0; h < 24; h++) if (scores[h] >= 60) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === h) last[1] = h + 1;
    else ranges.push([h, h + 1]);
  }
  // 끝은 포함하지 않는다. 23시 구간은 24시에서 끝내고 자정 구간과 합치지 않는다.
  // 구간이 많으면 긴 세 구간만 시간순으로 표시해 카드 길이를 제한한다.
  return ranges.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]) || a[0] - b[0]).slice(0, 3).sort((a, b) => a[0] - b[0])
    .map(([a, b]) => `${String(a).padStart(2, '0')}~${String(b).padStart(2, '0')}시`).join(' · ');
}
function renderToday() {
  const pt = POINTS[S.pt], st = STATIONS[pt ? pt.st : S.st]; if (!st) return;
  const day = Math.min(TODAY_IDX, st.days.length - 1), d = st.days[day], h = kstHour(), tA = day * 24 + h;
  const wd = '일월화수목금토'[new Date(d.date + 'T12:00:00+09:00').getDay()], [, m, dd] = d.date.split('-');
  $('tdDate').textContent = `${+m}월 ${+dd}일 (${wd}) · 음력 ${d.lunar} · ${d.mul}`;
  $('tdName').textContent = pt ? pt.name : st.name;
  $('tdReg').textContent = `${st.region} · 조석은 ${st.name} 예보지점${pt && pt.dkm >= 1 ? ` (${pt.dkm.toFixed(0)} km)` : ''} 기준`;
  // 지금 물 상태
  const r = tideAt(st, tA), u = r.rate / st.maxRate, weak = weakTide(st);
  const state = Math.abs(u) < .15 ? ['물돌이 무렵', 'slack'] : u > 0 ? ['들물', 'in'] : ['날물', 'out'];
  const el = $('tdState'); el.textContent = state[0] + (weak ? ' · 조차 작음' : ''); el.className = 'tdState ' + state[1];
  const nx = st.ev.find(e => e[0] > tA);
  if (nx) { const left = nx[0] - tA, hh = Math.floor(left), mm = Math.round((left - hh) * 60); $('tdNext').innerHTML = `다음 ${nx[2] === 'H' ? '만조' : '간조'} <b>${fmtH(nx[0] % 24)}</b> · ${nx[1]} cm, ${hh ? hh + '시간 ' : ''}${mm}분 뒤`; }
  else $('tdNext').textContent = '';
  // 사실들
  const wx = wxAt(st, day, h, pt), sw = sstFor(pt || st), [sr, ss] = sunTimes(pt ? pt.lat : st.lat, pt ? pt.lon : st.lon, day);
  $('tdMul').innerHTML = `${d.mul}<small>물때 세기 ${d.pct}%${weak ? ' · 점수에 작게 반영' : ''}</small>`;
  $('tdWind').innerHTML = wx ? `${wx.dir}풍 ${wx.sp == null ? '' : wx.sp.toFixed(1) + ' m/s'}<small>${wx.sp == null ? '세기는 정성 예보' : wx.sp <= 4 ? '약한 바람' : wx.sp < 9 ? '약간 강한 바람' : '강한 바람'}</small>` : '예보 없음';
  $('tdWave').innerHTML = wx && wx.wave != null ? `${wx.wave.toFixed(1)} m<small>${wx.wave <= 1 ? '잔잔한 편' : wx.wave <= 2 ? '조금 높음' : '높음, 갯바위 주의'}</small>` : '예보 없음';
  $('tdSst').innerHTML = sw ? `${sw[0].toFixed(1)} ℃<small>${sw[2]} ${sw[3]} km · ${sw[1].slice(-5)} 관측</small>` : '관측 없음<small>50 km 안 최근 관측 없음</small>';
  const fu = flowU(st, pt, day, tA);
  $('tdCur').innerHTML = fu.real ? (fu.r.sp * KN < .2 ? `물돌이 무렵<small>${fu.nc.c.name} 예보 지점</small>` : `${dirName16(fu.r.dir)}쪽 ${(fu.r.sp * KN).toFixed(1)} kn<small>${fu.nc.c.name} 예보 지점 ${fu.nc.km.toFixed(0)} km</small>`) : `${Math.round(Math.abs(u) * 100)}%<small>조류 예보 지점 없음 · 바닷물 높이로 추정</small>`;
  $('tdSun').innerHTML = `${fmtH(sr)} ~ ${fmtH(ss)}<small>해 뜸 ~ 해 짐</small>`;
  // 어종별 오늘 지수
  const rows = FISH.map((f, i) => { const arr = Array.from({ length: 24 }, (_, hh) => biteAt(f, pt, st, day, hh)); const mx = Math.max(...arr); return { f, i, arr, mx, best: arr.indexOf(mx) }; }).sort((a, b) => b.mx - a.mx);
  const bestH = Array.from({ length: 24 }, (_, hh) => Math.max(...rows.map(o => o.arr[hh])));
  TD = { st, day, sr, ss, bestH, h };
  const top = rows.filter(o => o.mx > 0).slice(0, 4);
  $('tdBest').innerHTML = top.length ? top.map(o => {
    const ranges = goodHourRanges(o.arr), [lv, cls] = level(o.mx);
    const when = ranges ? `${ranges} 좋음` : `가장 나은 때 ${String(o.best).padStart(2, '0')}시`;
    return `<li class="${cls}"><span class="pic">${fishSVG(o.f.f, 'td' + o.i)}</span><span class="nm">${o.f.n}<small>${when}</small></span><span class="pc">${o.mx}점<small>${lv}</small></span></li>`;
  }).join('') : '<li class="empty">오늘은 지수가 나오는 어종이 없습니다.</li>';
  drawToday();
}
function drawToday() {
  if (!TD) return;
  const r = DPR(), w = tdc.clientWidth, hgt = 150; if (!w) return;
  if (tdc.width !== Math.round(w * r)) { tdc.width = Math.round(w * r); tdc.height = Math.round(hgt * r); }
  const c = tdx; c.setTransform(r, 0, 0, r, 0, 0); c.clearRect(0, 0, w, hgt);
  const { st, day, sr, ss, bestH } = TD, mt = 18, bb = 22, X = t => t / 24 * w, lo = st.minCm, hi = st.maxCm, Y = cm => mt + (hi - cm) / (hi - lo || 1) * (hgt - mt - bb - 18);
  c.fillStyle = '#030a0e'; c.fillRect(0, 0, X(sr), hgt - bb); c.fillRect(X(ss), 0, w - X(ss), hgt - bb);      // 밤
  c.beginPath(); c.moveTo(0, hgt - bb);
  for (let i = 0; i <= 240; i++) { const t = i / 10; c.lineTo(X(t), Y(tideAt(st, day * 24 + t).cm)); }
  c.lineTo(w, hgt - bb); c.closePath(); c.fillStyle = 'rgba(79,227,211,.16)'; c.fill();
  c.beginPath(); for (let i = 0; i <= 240; i++) { const t = i / 10, y = Y(tideAt(st, day * 24 + t).cm); i ? c.lineTo(X(t), y) : c.moveTo(X(t), y); } c.strokeStyle = 'rgba(79,227,211,.85)'; c.lineWidth = 2; c.stroke();
  c.font = '600 11px JetBrains Mono, monospace'; c.textAlign = 'center';
  for (const [t, cm, k] of st.days[day].ev) { const x = X(t), y = Y(cm); c.fillStyle = k === 'H' ? '#ffb84d' : '#9ec9cf'; c.beginPath(); c.arc(x, y, 3.5, 0, 7); c.fill(); c.fillText(fmtH(t), clamp(x, 20, w - 20), k === 'H' ? y - 7 : y + 15); }
  const bw = w / 24;                                                                         // 아래 띠: 시간별 가장 높은 입질 지수
  for (let hh = 0; hh < 24; hh++) { const p = bestH[hh]; c.fillStyle = p >= 60 ? '#5ff0a8' : p >= 40 ? 'rgba(255,184,77,.8)' : p > 0 ? 'rgba(134,164,171,.28)' : 'rgba(134,164,171,.1)'; c.fillRect(hh * bw + 1, hgt - bb + 6, bw - 2, 8); }
  c.fillStyle = '#86a4ab'; c.font = '400 10px JetBrains Mono, monospace';
  for (const t of [0, 6, 12, 18, 24]) c.fillText(String(t).padStart(2, '0'), clamp(X(t), 8, w - 8), hgt - 1);
  if (day === TODAY_IDX) { const x = X(kstHour()); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 4); c.lineTo(x, hgt - bb + 14); c.stroke(); c.fillStyle = '#fff'; c.font = '600 11px IBM Plex Sans KR, sans-serif'; c.fillText('지금', clamp(x, 14, w - 14), 12); }
}
