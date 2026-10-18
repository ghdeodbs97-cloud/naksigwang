"""실 API 없이 타일 오류 허용·12초 이벤트 누락·offline/API 복구를 검사한다."""
import datetime as dt
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from depth_probe import PROBE
from p3_baseline import CHECK

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-output/p3-health'
OUT.mkdir(parents=True, exist_ok=True)
html = (ROOT / 'index.html').read_text(encoding='utf-8')
probe = PROBE + CHECK + ''.join((ROOT / 'tests' / name).read_text(encoding='utf-8')
                              for name in ['p3_provider_checks.js', 'p3_health_checks.js', 'p3_settle_checks.js'])
pos = html.rindex('\n})();')
html = html[:pos] + probe + html[pos:]
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0),
    functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width, height in [(390, 844), (1280, 900), (1920, 1080)]:
            for dpr in [1, 2]:
                page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=dpr)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                page.route('**/index.html', lambda route: route.fulfill(content_type='text/html', body=html))
                page.clock.set_fixed_time(dt.datetime.fromisoformat(json.loads(
                    (ROOT / 'data/meta.json').read_text(encoding='utf-8'))['generated']))
                page.goto(f'http://localhost:{server.server_port}/index.html', wait_until='domcontentloaded')
                page.wait_for_function('window.depthProbeReady?.()')
                tile = page.evaluate('window.p3HealthSetup()')
                mode_start = page.evaluate('window.p3HealthModeStart()')
                assert mode_start['timerArmed'] and mode_start['loaded'], mode_start
                page.clock.fast_forward(12050)
                mode = page.evaluate('window.p3HealthModeFinish()')
                settle = page.evaluate('window.p3SettleTest()')
                fatal = page.evaluate('window.p3HealthFatal()')
                assert not errors, errors
                results.append({'viewport': [width, height], 'dpr': dpr, 'tile': tile,
                                'mode': mode, 'settle': settle, 'fatal': fatal})
                (OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f'{width}×{height} DPR {dpr}: 타일 허용/12초 누락/offline·projection 복구 통과', flush=True)
                page.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
