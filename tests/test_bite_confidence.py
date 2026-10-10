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
html = html[:pos] + '\nwindow.__p1Ready = () => CR.ready; window.__p1Run = () => {' + assertions + '\n};\n' + html[pos:]
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
            assert not errors, errors
            print(f'{width}×{height}: P1 {result["checks"]}개 조건 검사 및 다섯 탭 통과')
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
