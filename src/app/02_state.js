// 02_state.js — 화면 상태(S)와 추정 수심 식
/* ── 조석, 조류 (모식) ─────────────────────────────────── */
const PERIOD = 12.42, HW = 3.0;
const S = { mapStyle: 'terrain', st: 0, day: 0, t: new Date(Date.now() + 9 * 36e5).getUTCHours() + .5, range: 1.6, hs: .5, layers: { port: true, rock: true, flow: true }, ratio: 8, dmax: 30, playing: false, mode: 'line', A: null, B: null, drag: null, secHover: null, pin: null };
const depthAt = dG => S.dmax * (1 - Math.exp(-dG / (S.dmax * S.ratio)));
