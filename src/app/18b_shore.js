// 18b_shore.js — 단면선이 바다로 나가는 해안의 종류(백사장·갯바위·외항·내항·갯벌 등)를 자동으로 판정해 추정 수심 설정을 맞춘다
// 판정 근거: ⓪ 갯바위 낚시 포인트 150 m 안 → 갯바위(이름이 「…백사장」이면 백사장)
//           ① 방파제·부두·해안에 둘러싸인 물(구조물이나 항 400 m 안) → 내항 ② 방파제 바로 옆이나 항 350 m 안의 트인 물 → 외항
//           ③ 오픈스트리트맵 해변(natural=beach) → 백사장 ④ 갯벌(wetland=tidalflat) → 갯벌 ⑤ 절벽(cliff) → 급경사 갯바위
//           ⑥ 암초(reef)·갯바위 포인트 근처 → 갯바위. 어디에도 해당하지 않으면 지금 설정을 그대로 둔다.
// 경사·수심 상한 값은 일반적인 해안 형태를 바탕으로 정한 가정값이다 (측량값 아님).
const SHORE = {
  cliff: { name: '급경사 갯바위', ratio: 4, dmax: 30 },
  rock: { name: '갯바위', ratio: 8, dmax: 30 },
  outer: { name: '외항 (방파제 바깥)', ratio: 3, dmax: 15 },
  inner: { name: '내항 (방파제 안)', ratio: 1.5, dmax: 6 },
  gravel: { name: '자갈·혼합', ratio: 20, dmax: 30 },
  sand: { name: '백사장 (모래 해변)', ratio: 50, dmax: 30 },
  flat: { name: '갯벌', ratio: 200, dmax: 30 },
};
S.shore = 'rock'; S.autoShore = true;
const dSeg = (px, py, x1, y1, x2, y2) => { const vx = x2 - x1, vy = y2 - y1, L = vx * vx + vy * vy, t = L ? clamp(((px - x1) * vx + (py - y1) * vy) / L, 0, 1) : 0; return Math.hypot(px - x1 - t * vx, py - y1 - t * vy); };
// 점(메르카토르)에서 오픈스트리트맵 지형(종류 목록)까지의 땅 위 거리(m). 다각형 안이면 0
function osmDist(mx, my, cats, maxG) {
  const k = kAt(latOf(my)), R = maxG * k; let best = Infinity;
  for (const o of OSM.list) {
    if (!cats.includes(o.c) || mx < o.minx - R || mx > o.maxx + R || my < o.miny - R || my > o.maxy + R) continue;
    for (const r of o.R) {
      if (r.n === 1) { best = Math.min(best, Math.hypot(r.xs[0] - mx, r.ys[0] - my)); continue; }
      let inside = false;
      for (let i = 0, j = r.n - 1; i < r.n; j = i++) {
        const x1 = r.xs[j], y1 = r.ys[j], x2 = r.xs[i], y2 = r.ys[i];
        if (o.t === 2 && (y1 > my) !== (y2 > my) && mx < (x2 - x1) * (my - y1) / (y2 - y1) + x1) inside = !inside;
        best = Math.min(best, dSeg(mx, my, x1, y1, x2, y2));
      }
      if (inside) return 0;
    }
  }
  return best / k;
}
// 물 위 점이 구조물·육지로 거의 둘러싸였는가 (16방향 중 12방향 이상이 500 m 안에서 막힘 — 항 입구가 열려 있어도 내항으로 보도록)
function enclosed(mx, my) {
  const k = kAt(latOf(my)); let hit = 0;
  for (let a = 0; a < 16; a++) {
    const ux = Math.cos(a / 16 * Math.PI * 2), uy = Math.sin(a / 16 * Math.PI * 2);
    for (let d = 15; d <= 500; d += 15) if (inLand(mx + ux * d * k, my + uy * d * k)) { hit++; break; }
  }
  return hit >= 12;
}
function classifyShore(A, B) {
  // 단면선을 따라 육지→바다로 바뀌는 첫 지점(해안)과 그보다 30 m 바다 쪽 점을 찾는다
  const N = 200, at = f => [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f], Lg = Math.hypot(B[0] - A[0], B[1] - A[1]) / kAt(latOf(A[1]));
  let prev = inLand(...A), P = null, dirF = 1;
  for (let i = 1; i <= N; i++) { const f = i / N, l = inLand(...at(f)); if (l !== prev) { P = f; dirF = prev ? 1 : -1; break; } prev = l; }
  if (P == null) { if (prev) return null; P = 0; dirF = 1; }   // 해안을 지나지 않으면 A 쪽을 해안으로 본다
  const shore = at(P), sea = at(clamp(P + dirF * 30 / Math.max(Lg, 1), 0, 1));
  const sla = latOf(shore[1]), slo = lonOf(shore[0]); let rp = null, rd = Infinity;
  for (const p of POINTS) if (p.kind === 'rock') { const d = gdist(p, { lat: sla, lon: slo }) * 1000; if (d < rd) { rd = d; rp = p; } }
  // 갯바위 낚시 포인트(공공 자료) 바로 앞이면 그 자료를 믿는다. 이름이 「…백사장」인 곳은 백사장
  if (rd < 150) return /백사장|모래사장/.test(rp.name) && !/갯바위|바위/.test(rp.name) ? { key: 'sand', why: `「${rp.name}」 (갯바위 포인트 자료 이름)` } : { key: 'rock', why: `갯바위 포인트 「${rp.name}」 ${Math.round(rd)} m` };
  // 항: 오픈스트리트맵 방파제 자료가 빠진 항이 많아, 항·포구 목록(716곳)의 위치도 함께 본다
  const kS = kAt(latOf(sea[1])), sd = structDist(sea[0], sea[1], 300 * kS) / kS, sd2 = structDist(shore[0], shore[1], 80 * kS) / kS;
  let port = null, pd = Infinity; for (const p of PORTS) { const d = Math.hypot(p.mx - sea[0], p.my - sea[1]) / kS; if (d < pd) { pd = d; port = p; } }
  const enc = (sd < 250 || pd < 400) && enclosed(...sea);
  if (enc) return { key: 'inner', why: `둘러싸인 물${pd < 600 ? ` (${port.name} ${Math.round(pd)} m)` : ''}` };
  if (Math.min(sd, sd2) < 60) return { key: 'outer', why: `방파제·부두 ${Math.round(Math.min(sd, sd2))} m` };
  if (pd < 350) return { key: 'outer', why: `${port.name} ${Math.round(pd)} m, 트인 바다 쪽` };
  const b = osmDist(...shore, ['be'], 60); if (b < 60) return { key: 'sand', why: `오픈스트리트맵 해변 ${Math.round(b)} m` };
  const t = osmDist(...shore, ['tf'], 60); if (t < 60) return { key: 'flat', why: `오픈스트리트맵 갯벌 ${Math.round(t)} m` };
  const c = osmDist(...shore, ['cl'], 60); if (c < 60) return { key: 'cliff', why: `오픈스트리트맵 절벽 ${Math.round(c)} m` };
  const r = osmDist(...shore, ['rf', 'sh'], 80); if (r < 80) return { key: 'rock', why: `오픈스트리트맵 암초 ${Math.round(r)} m` };
  if (rd < 250) return { key: 'rock', why: `갯바위 포인트 「${rp.name}」 ${Math.round(rd)} m` };
  return null;
}
function setShore(key, why) {
  const t = SHORE[key]; if (!t) return;
  S.shore = key; S.ratio = t.ratio; S.dmax = t.dmax;
  $('slopeIn').value = key; $('dmaxIn').value = t.dmax; $('dmaxOut').textContent = t.dmax + ' m';
  setText('sKind', t.name + (why ? ' (자동)' : ''));
  $('shoreMsg').textContent = why ? `자동 판정: ${t.name} — ${why}` : '';
}
function autoShore() {
  if (!S.autoShore || !S.A || !S.B) return;
  const r = classifyShore(S.A, S.B);
  if (r) setShore(r.key, r.why);
  else { setText('sKind', SHORE[S.shore].name + ' (판정 못함, 그대로)'); $('shoreMsg').textContent = '자동 판정: 해안 종류를 알 수 있는 자료가 근처에 없어 지금 설정을 그대로 씁니다.'; }
}
