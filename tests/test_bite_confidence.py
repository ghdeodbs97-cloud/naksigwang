"""P1: 실제 앱·동해 5곳 비교와 결정성/누락/신뢰도, 두 화면 크기의 5개 탭.
P1_OUTPUT 환경변수를 지정하면 JSON 보고서와 화면을 그 폴더에 저장한다.
"""
import datetime as dt
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
clock = dt.datetime.fromisoformat(json.loads((ROOT / 'data/meta.json').read_text(encoding='utf-8'))['generated'])
assertions = (ROOT / 'tests/p1_assertions.js').read_text(encoding='utf-8')
html = (ROOT / 'index.html').read_text(encoding='utf-8')
pos = html.rindex('\n})();')
refresh_probe = r'''
// 같은 선택 시각에서 실제 시계만 이동한다. 운영 자료 대신 페이지 메모리의 만료 경계를 구성한다.
let refreshCalls = 0;
window.__p1ExpirySetup = () => {
  const p = POINTS.find(p => sstForLocation(p));
  if (!p) throw new Error('만료 검사에 유효 수온 포인트 필요');
  S.pt = POINTS.indexOf(p); S.st = p.st; S.t = 9.5; S.playing = false;
  const boundary = Date.now() - 24 * 36e5 + 30000;
  const stamp = new Date(boundary + 9 * 36e5).toISOString().slice(0, 16);
  for (const o of Object.values(OBS)) if (o.sst) o.sst[1] = stamp.replace('T', ' ');
  META.generated = new Date(boundary).toISOString(); META.degraded = false;
  for (const name of ['obs', 'wx', 'tide']) META[name + '.json'] = { status: 'ok' };
  WXG.base = stamp.replace(/[-:T]/g, '');
  for (const k in WXG.bases) WXG.bases[k] = WXG.base;
  SST_C.clear();
  const original = renderBite;
  renderBite = () => { refreshCalls++; original(); };
  renderBite();
};
window.__p1ExpirySnapshot = () => {
  const p = POINTS[S.pt], st = STATIONS[S.st];
  const evaluations = FISH.map(f => ({ name: f.n, ev: biteEvalAt(f, p, st, S.day, Math.floor(S.t)) }));
  const cards = [...$('fishGrid').children];
  return { calls: refreshCalls, t: S.t, evaluations, matches: evaluations.every(({ name, ev }) => {
    const card = cards.find(c => c.querySelector('.fn').firstChild.textContent === name);
    return card.querySelector('.fp b').textContent === ev.score + '점'
      && card.querySelector('.biteConfidence').textContent === '자료 신뢰도 ' + ev.confidenceLevel
      && card.querySelector('.biteReasons').textContent === biteReasons(ev);
  }) };
};
'''
html = html[:pos] + '\nwindow.__p1Ready = () => CR.ready; window.__p1Run = () => {' + assertions + '\n};\n' + refresh_probe + html[pos:]
out = Path(os.environ['P1_OUTPUT']) if os.environ.get('P1_OUTPUT') else None
if out:
    out.mkdir(parents=True, exist_ok=True)
http.server.SimpleHTTPRequestHandler.log_message = lambda *args: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width, height in [(390, 844), (1280, 900)]:
            page = browser.new_page(viewport={'width': width, 'height': height})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.clock.set_fixed_time(clock)
            page.route('**/index.html', lambda route: route.fulfill(content_type='text/html', body=html))
            page.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
            page.wait_for_function('window.__p1Ready?.()')
            result = page.evaluate('window.__p1Run()')
            for tab in ['today', 'map', 'tide', 'bite', 'log']:
                page.locator(f'#tabbar [data-tab="{tab}"]').click()
                page.wait_for_timeout(200)
                assert page.locator(f'#v-{tab}').is_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), tab
                if out:
                    page.screenshot(path=str(out / f'{width}-{tab}.png'), full_page=True)
            assert '%' not in page.locator('#fishGrid').inner_text()
            assert '%' not in page.locator('#tdBest').inner_text()
            assert '%' not in page.locator('.lvKey').inner_text()
            assert page.locator('.biteConfidence').count() == 18
            assert all(page.locator('.biteReasons').all_text_contents())
            page.evaluate('window.__p1ExpirySetup()')
            before = page.evaluate('window.__p1ExpirySnapshot()')
            assert before['matches']
            assert any(e['ev']['sources']['temperature']['observation'] for e in before['evaluations'])
            page.wait_for_timeout(250)
            assert page.evaluate('window.__p1ExpirySnapshot().calls') == before['calls'], '프레임마다 재계산 금지'
            page.clock.set_fixed_time(clock + dt.timedelta(seconds=61))
            page.wait_for_function('window.__p1ExpirySnapshot().calls > 1')
            after = page.evaluate('window.__p1ExpirySnapshot()')
            assert after['t'] == before['t'] == 9.5, '선택 시간 변경 없이 자동 갱신'
            assert after['matches'], '만료 후 카드 점수·신뢰도·이유가 새 계산과 일치'
            for old, new in zip(before['evaluations'], after['evaluations']):
                ev = new['ev']
                assert ev['sources']['temperature']['observation'] is None
                assert ev['sources']['temperature']['stale'] and ev['sources']['weather']['stale']
                assert ev['confidence'] < old['ev']['confidence']
                if ev['score']:
                    assert next(f for f in ev['factors'] if f['key'] == 'temperature')['effect'] == 0
            page.wait_for_timeout(250)
            assert page.evaluate('window.__p1ExpirySnapshot().calls') == after['calls'], '같은 분에서 중복 갱신 금지'
            # 시계 역행·절전 후 복귀도 다음 프레임에서 반영한다.
            page.clock.set_fixed_time(clock)
            page.wait_for_function('window.__p1ExpirySnapshot().calls > 2')
            assert page.evaluate('window.__p1ExpirySnapshot().matches')
            assert not errors, errors
            print(f'{width}×{height}: P1 {result["checks"]}개 조건 검사·자료 만료 자동 갱신·다섯 탭 통과')
            if width == 390:
                print(json.dumps(result, ensure_ascii=False, indent=2))
                if out:
                    (out / 'comparison.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            page.close()
        browser.close()
finally:
    srv.shutdown()
    srv.server_close()
print('P1 통과')
