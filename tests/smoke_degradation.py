"""P0 브라우저 회귀: 선택 자료 실패와 두 화면 크기의 다섯 탭을 확인한다."""
import functools
import http.server
import os
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
http.server.SimpleHTTPRequestHandler.log_message = lambda *args: None
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
srv.RequestHandlerClass.log_message = lambda *args: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width, height in [(390, 844), (1280, 900)]:
            for degraded in [False, True]:
                page = browser.new_page(viewport={'width': width, 'height': height})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                if degraded:
                    for name in ['obs', 'wx', 'meta']:
                        page.route(f'**/data/{name}.json?*', lambda route: route.fulfill(status=503, body='unavailable'))
                page.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
                page.wait_for_function("document.querySelector('#stName').textContent.trim().length > 1")
                for tab in ['today', 'map', 'tide', 'bite', 'log']:
                    page.locator(f'#tabbar [data-tab="{tab}"]').click()
                    page.wait_for_timeout(400)
                    assert page.locator(f'#v-{tab}').is_visible(), tab
                    if os.environ.get('P0_SCREENSHOTS'):
                        out = Path(os.environ['P0_SCREENSHOTS'])
                        out.mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(out / f'{width}-{int(degraded)}-{tab}.png'))
                assert not errors, errors
                if degraded:
                    assert page.locator('#dataTime').inner_text() == '확인 불가'
                    assert '가능한 기능은 계속' in page.locator('body > p').inner_text()
                print(f'{width}×{height}, 선택 자료 실패={degraded}: 다섯 탭 통과')
                page.close()
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/data/tide.json?*', lambda route: route.fulfill(status=503, body='unavailable'))
        page.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
        page.wait_for_selector('body > p')
        assert '앱을 시작할 수 없습니다' in page.locator('body > p').inner_text()
        assert any('tide.json unavailable' in e for e in errors), errors
        browser.close()
finally:
    srv.shutdown()
    srv.server_close()
print('P0 브라우저 회귀: 통과')
