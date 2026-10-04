// 19_overlay.js — 평면도 위 표시(단면선·핀)
/* ── 평면도 위 표시 ────────────────────────────────────── */
function drawUI() {
  const r = DPR(); uctx.setTransform(r, 0, 0, r, 0, 0); uctx.clearRect(0, 0, cw, ch);
  const A = S.drag ? S.drag.A : S.A, B = S.drag ? S.drag.B : S.B;
  if (A && B) {
    const [ax, ay] = toS(...A), [bx, by] = toS(...B);
    uctx.strokeStyle = 'rgba(255,184,77,.25)'; uctx.lineWidth = 7; uctx.beginPath(); uctx.moveTo(ax, ay); uctx.lineTo(bx, by); uctx.stroke();
    uctx.strokeStyle = '#ffb84d'; uctx.lineWidth = 2; uctx.stroke();
    uctx.font = '600 12px JetBrains Mono, monospace'; uctx.textBaseline = 'alphabetic';
    for (const [x, y, t] of [[ax, ay, 'A'], [bx, by, 'B']]) { uctx.fillStyle = '#ffb84d'; uctx.beginPath(); uctx.arc(x, y, 9, 0, 7); uctx.fill(); uctx.fillStyle = '#060f13'; uctx.fillText(t, x - 4, y + 4); }
    if (!S.drag && S.secHover != null) { const x = ax + (bx - ax) * S.secHover, y = ay + (by - ay) * S.secHover; uctx.strokeStyle = '#fff'; uctx.lineWidth = 2; uctx.beginPath(); uctx.arc(x, y, 6, 0, 7); uctx.stroke(); }
  }
  if (S.pin) {
    const [x, y] = toS(...S.pin);
    uctx.strokeStyle = '#ff7a6e'; uctx.lineWidth = 2; uctx.beginPath(); uctx.arc(x, y, 7, 0, 7); uctx.stroke();
    uctx.beginPath(); uctx.moveTo(x - 13, y); uctx.lineTo(x - 4, y); uctx.moveTo(x + 4, y); uctx.lineTo(x + 13, y); uctx.moveTo(x, y - 13); uctx.lineTo(x, y - 4); uctx.moveTo(x, y + 4); uctx.lineTo(x, y + 13); uctx.stroke();
  }
}
