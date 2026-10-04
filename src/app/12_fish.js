// 12_fish.js — 대상어 정보와 물고기 그림
/* ── 대상어 ───────────────────────────────────────────── */
// season: 10월 시즌 점수(0~1), reg: [동해, 남해, 서해, 제주] 출현 점수, cur: 물살 선호(1=물때 영향 큼)
const FISH = [
  { n: '감성돔', season: .9, reg: [.6, 1, .8, 1], cur: 1, f: { h: .44, top: '#5f6b74', bot: '#dfe3e6', tail: 'fork', spiny: 1 } },
  { n: '볼락', season: .5, reg: [.8, 1, .6, .6], cur: .4, f: { h: .36, top: '#7a4a3a', bot: '#c99a7c', tail: 'cut', mott: 1, eye: 1.4, spiny: 1 } },
  { n: '벵에돔', season: .7, reg: [.3, 1, .1, 1], cur: .8, f: { h: .42, top: '#26343a', bot: '#55666d', tail: 'fork' } },
  { n: '농어', season: .75, reg: [.8, 1, 1, .8], cur: .9, f: { h: .27, top: '#56645f', bot: '#e3e8e6', tail: 'fork', mouth: 1.4, spiny: 1 } },
  { n: '우럭', season: .7, reg: [.8, .8, 1, .3], cur: .4, f: { h: .34, top: '#4a3c32', bot: '#8a7a6a', tail: 'round', mott: 1, mouth: 1.4, spiny: 1 } },
  { n: '광어', season: .7, reg: [.7, .8, 1, .6], cur: .6, f: { flat: 1, top: '#6b5a40', bot: '#8a7656', mott: 1 } },
  { n: '노래미', season: .6, reg: [1, .8, .9, .4], cur: .4, f: { h: .26, top: '#6b5a3a', bot: '#b8a580', tail: 'cut', mott: 1, longD: 1 } },
  { n: '삼치', season: .9, reg: [.6, 1, 1, .8], cur: .8, f: { h: .2, top: '#33648f', bot: '#e6edf2', tail: 'deep', spots: '#1d3550' } },
  { n: '고등어', season: .8, reg: [1, 1, .6, 1], cur: .7, f: { h: .24, top: '#2f6f6a', bot: '#e8eeee', tail: 'deep', wavy: 1 } },
  { n: '참돔', season: .7, reg: [.4, 1, .6, 1], cur: 1, f: { h: .42, top: '#d4566a', bot: '#f2c2c6', tail: 'fork', dots: '#7fd0ff', spiny: 1 } },
  { n: '잿방어', season: .5, reg: [.2, .6, .1, 1], cur: .9, f: { h: .36, top: '#7f7663', bot: '#d9d2c2', tail: 'deep', band: 1 } },
  { n: '부시리', season: .8, reg: [.6, .9, .2, 1], cur: 1, f: { h: .26, top: '#2c6a80', bot: '#e9eef0', tail: 'deep', yline: 1 } },
  { n: '대구', season: .1, reg: [.8, .6, .3, .1], cur: .5, f: { h: .3, top: '#857560', bot: '#e3dbcc', tail: 'cut', mott: 1, mouth: 1.3, barbel: 1 } },
  { n: '숭어', season: .5, reg: [.8, 1, 1, .6], cur: .6, f: { h: .25, top: '#5f7586', bot: '#e5eaee', tail: 'fork', lines: 1 } },
  { n: '전갱이', season: .8, reg: [.8, 1, .6, 1], cur: .7, f: { h: .3, top: '#5f8282', bot: '#e9eeee', tail: 'deep', scute: 1 } },
  { n: '돌돔', season: .6, reg: [.4, 1, .1, 1], cur: .9, f: { h: .44, top: '#c9ccc6', bot: '#eeefe9', tail: 'fork', bars: 7, spiny: 1 } },
  { n: '백조기', season: .6, reg: [0, .4, 1, .2], cur: .7, f: { h: .28, top: '#b9bdb6', bot: '#eef0ec', tail: 'round' } },
  { n: '전어', season: .9, reg: [.5, 1, 1, .4], cur: .6, f: { h: .32, top: '#3a6a7e', bot: '#e8eef0', tail: 'fork', gspot: 1 } },
];
const REG_IDX = { '동해': 0, '남해': 1, '서해': 2, '제주': 3 };
/* ── 물고기 일러스트 (SVG) ──────────────────────────── */
function fishSVG(f, id) {
  const W = 120, Hh = 64, cy = 32;
  if (f.flat) {
    let s = `<svg viewBox="0 0 ${W} ${Hh}" aria-hidden="true"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f.top}"/><stop offset="1" stop-color="${f.bot}"/></linearGradient></defs>`;
    s += `<ellipse cx="56" cy="${cy}" rx="44" ry="21" fill="none" stroke="${f.top}" stroke-width="6" stroke-dasharray="2 2" opacity=".7"/>`;
    s += `<path d="M14 ${cy} C 20 8, 92 8, 100 ${cy} C 92 56, 20 56, 14 ${cy} Z" fill="url(#g${id})"/>`;
    s += `<path d="M100 ${cy} L116 ${cy - 10} L116 ${cy + 10} Z" fill="${f.top}"/>`;
    for (let i = 0; i < 9; i++) s += `<circle cx="${30 + (i * 37) % 60}" cy="${cy - 10 + (i * 13) % 22}" r="${2 + (i % 3)}" fill="#3b301f" opacity=".45"/>`;
    s += `<circle cx="24" cy="${cy - 7}" r="3.2" fill="#f4f1e8"/><circle cx="24" cy="${cy - 7}" r="1.6" fill="#111"/><circle cx="30" cy="${cy - 11}" r="3" fill="#f4f1e8"/><circle cx="30" cy="${cy - 11}" r="1.5" fill="#111"/>`;
    return s + '</svg>';
  }
  const h = f.h * 100, x0 = 8, x1 = 90, top = cy - h / 2, bot = cy + h / 2;
  let s = `<svg viewBox="0 0 ${W} ${Hh}" aria-hidden="true"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${f.top}"/><stop offset=".55" stop-color="${f.top}" stop-opacity=".85"/><stop offset="1" stop-color="${f.bot}"/></linearGradient><clipPath id="c${id}"><path d="M${x0} ${cy + 2} C ${x0 + 10} ${top - 2}, ${x1 - 26} ${top}, ${x1} ${cy - h * .12} L ${x1} ${cy + h * .12} C ${x1 - 26} ${bot}, ${x0 + 12} ${bot + 1}, ${x0} ${cy + 2} Z"/></clipPath></defs>`;
  // 꼬리
  const tt = f.tail, th = Math.max(10, h * .9);
  if (tt === 'fork') s += `<path d="M${x1 - 2} ${cy} L${x1 + 22} ${cy - th / 2} L${x1 + 14} ${cy} L${x1 + 22} ${cy + th / 2} Z" fill="${f.top}"/>`;
  else if (tt === 'deep') s += `<path d="M${x1 - 2} ${cy} L${x1 + 24} ${cy - th * .75} L${x1 + 10} ${cy} L${x1 + 24} ${cy + th * .75} Z" fill="${f.top}"/>`;
  else if (tt === 'round') s += `<path d="M${x1 - 2} ${cy - 3} C ${x1 + 22} ${cy - th / 2}, ${x1 + 22} ${cy + th / 2}, ${x1 - 2} ${cy + 3} Z" fill="${f.top}"/>`;
  else s += `<path d="M${x1 - 2} ${cy - 3} L${x1 + 18} ${cy - th / 2} L${x1 + 18} ${cy + th / 2} L${x1 - 2} ${cy + 3} Z" fill="${f.top}"/>`;
  // 등지느러미
  if (f.longD) s += `<path d="M${x0 + 24} ${top + 3} Q ${x0 + 50} ${top - 9}, ${x1 - 8} ${cy - h * .2} L ${x1 - 10} ${cy - h * .12} Z" fill="${f.top}" opacity=".9"/>`;
  else if (f.spiny) s += `<path d="M${x0 + 26} ${top + 2} L${x0 + 32} ${top - 9} L${x0 + 38} ${top - 2} L${x0 + 44} ${top - 10} L${x0 + 50} ${top - 2} L${x0 + 56} ${top - 8} L${x0 + 66} ${top + 3} Z" fill="${f.top}"/>`;
  else s += `<path d="M${x0 + 34} ${top + 2} L${x0 + 46} ${top - 8} L${x0 + 56} ${top + 2} Z" fill="${f.top}"/>`;
  s += `<path d="M${x0 + 46} ${bot - 2} L${x0 + 54} ${bot + 6} L${x0 + 60} ${bot - 1} Z" fill="${f.top}" opacity=".85"/>`;
  // 몸통
  s += `<path d="M${x0} ${cy + 2} C ${x0 + 10} ${top - 2}, ${x1 - 26} ${top}, ${x1} ${cy - h * .12} L ${x1} ${cy + h * .12} C ${x1 - 26} ${bot}, ${x0 + 12} ${bot + 1}, ${x0} ${cy + 2} Z" fill="url(#g${id})"/>`;
  let pat = '';
  if (f.bars) for (let i = 0; i < f.bars; i++) pat += `<rect x="${x0 + 14 + i * 10}" y="${top - 4}" width="5" height="${h + 8}" fill="#1c1f22" opacity=".85"/>`;
  if (f.mott) for (let i = 0; i < 12; i++) pat += `<circle cx="${x0 + 16 + (i * 29) % 64}" cy="${top + 4 + (i * 11) % (h * .7)}" r="${2.4 + (i % 3)}" fill="#1d150f" opacity=".35"/>`;
  if (f.spots) for (let i = 0; i < 14; i++) pat += `<circle cx="${x0 + 18 + i * 4.6}" cy="${cy - 2 + ((i % 2) ? 3 : -2)}" r="1.6" fill="${f.spots}"/>`;
  if (f.dots) for (let i = 0; i < 12; i++) pat += `<circle cx="${x0 + 16 + (i * 23) % 62}" cy="${top + 5 + (i * 7) % (h * .5)}" r="1.3" fill="${f.dots}"/>`;
  if (f.wavy) for (let i = 0; i < 6; i++) pat += `<path d="M${x0 + 20 + i * 10} ${top + 1} q 3 6 0 ${h * .3}" stroke="#123" stroke-width="1.6" fill="none" opacity=".7"/>`;
  if (f.yline) pat += `<rect x="${x0 + 4}" y="${cy - 1.6}" width="${x1 - x0}" height="3.2" fill="#f2c94c" opacity=".9"/>`;
  if (f.lines) for (let i = 0; i < 4; i++) pat += `<rect x="${x0 + 8}" y="${top + 4 + i * h / 6}" width="${x1 - x0}" height="1" fill="#2c3a44" opacity=".5"/>`;
  if (f.scute) pat += `<path d="M${x0 + 30} ${cy - 2} Q ${x0 + 56} ${cy + 4}, ${x1} ${cy}" stroke="#c9d6d6" stroke-width="2" fill="none" stroke-dasharray="2 1.5"/>`;
  if (f.band) pat += `<path d="M${x0 + 2} ${cy - 4} L${x0 + 22} ${top + 2}" stroke="#3a3328" stroke-width="3" opacity=".8"/>`;
  if (f.gspot) pat += `<circle cx="${x0 + 26}" cy="${cy - 3}" r="2.6" fill="#122" />`;
  s += `<g clip-path="url(#c${id})">${pat}</g>`;
  // 아가미, 눈, 입
  s += `<path d="M${x0 + 20} ${top + h * .22} Q ${x0 + 25} ${cy + 2}, ${x0 + 20} ${bot - h * .18}" stroke="#000" stroke-opacity=".25" stroke-width="1.3" fill="none"/>`;
  const er = 3 * (f.eye || 1);
  s += `<circle cx="${x0 + 11}" cy="${cy - h * .14}" r="${er}" fill="#f6f4ee"/><circle cx="${x0 + 11.5}" cy="${cy - h * .14}" r="${er * .5}" fill="#111"/>`;
  s += `<path d="M${x0 - 1} ${cy + 2} l ${6 * (f.mouth || 1)} 1.5" stroke="#000" stroke-opacity=".4" stroke-width="1.2"/>`;
  if (f.barbel) s += `<path d="M${x0 + 3} ${cy + 5} q 0 6 -3 8" stroke="${f.top}" stroke-width="1.2" fill="none"/>`;
  return s + '</svg>';
}
