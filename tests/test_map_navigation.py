"""실 API 없이 실제 항구 자료의 명시적 이동·no-op 보정·실패 commit을 검사한다."""
import functools
import http.server
import json
import sys
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from p3_native_clock import fixed_date_script
from depth_probe import PROBE
from p3_baseline import CHECK

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-output/p3-navigation'
OUT.mkdir(parents=True, exist_ok=True)
html = (ROOT / 'index.html').read_text(encoding='utf-8')
probe = PROBE + CHECK + ''.join((ROOT / 'tests' / name).read_text(encoding='utf-8')
    for name in ['p3_provider_checks.js', 'p3_viewport_checks.js', 'p3_command_checks.js', 'p3_navigation_checks.js'])
pos = html.rindex('\n})();')
html = html[:pos] + probe + html[pos:]
http.server.SimpleHTTPRequestHandler.log_message = lambda *args: None
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
    functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width, height, dpr in [(390, 844, 1), (390, 844, 2), (1280, 900, 1.25), (1280, 900, 2)]:
            page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=dpr)
            errors = []
            page.on('console', lambda message: print(message.text, flush=True) if message.text.startswith('navigation progress') else None)
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**/*', lambda route: route.abort())
            page.route('**/index.html', lambda route: route.fulfill(content_type='text/html', body=html))
            page.add_init_script(fixed_date_script(json.loads((ROOT / 'data/meta.json').read_text(encoding='utf-8'))['generated']))
            page.goto(f'http://localhost:{server.server_port}/index.html', wait_until='domcontentloaded')
            page.wait_for_function('window.p3Ready?.()')
            result = page.evaluate('window.p3NavigationTest('+ ('{repeat:0}' if '--cases-only' in sys.argv else '{}') +')')
            # 관측소 fallback 안내가 남아 있어도 실제 탭 버튼을 누를 수 있어야 한다.
            for tab in ['today', 'map', 'tide', 'bite', 'log']:
                page.locator(f'#tabbar [data-tab="{tab}"]').click()
                assert page.locator('#v-' + tab).is_visible()
                if tab in ('today', 'map'):
                    page.wait_for_function('!naksigwangMapDiagnostic.lastNavigation().commandPending')
                page.wait_for_timeout(150)
                if (width, dpr) in [(390, 1), (1280, 1.25)]:
                    page.screenshot(path=str(OUT / f'{width}-{tab}.png'), full_page=True)
            assert not errors, errors
            results.append({'viewport': [width, height], 'dpr': dpr, **result, 'errors': errors})
            (OUT / ('cases-only.json' if '--cases-only' in sys.argv else 'results.json')).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
            print(f'{width}x{height} DPR {dpr}: navigation 통과 {result["counts"]}', flush=True)
            page.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
