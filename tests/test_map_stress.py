"""실 API 없이 16개 화면·DPR의 유한 lifecycle 스트레스를 검사한다."""
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from p3_native_clock import fixed_date_script
from depth_probe import PROBE
from p3_baseline import CHECK

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-output/p3-stress'
OUT.mkdir(parents=True, exist_ok=True)
html = (ROOT / 'index.html').read_text(encoding='utf-8')
probe = PROBE + CHECK + ''.join((ROOT / 'tests' / name).read_text(encoding='utf-8')
                              for name in ['p3_provider_checks.js', 'p3_health_checks.js', 'p3_stress_checks.js'])
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
        for width, height in [(390, 844), (768, 1024), (1280, 900), (1920, 1080)]:
            for dpr in [1, 1.25, 1.5, 2]:
                page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=dpr)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                page.route('**/index.html', lambda route: route.fulfill(content_type='text/html', body=html))
                page.add_init_script(fixed_date_script(json.loads(
                    (ROOT / 'data/meta.json').read_text(encoding='utf-8'))['generated']))
                page.goto(f'http://localhost:{server.server_port}/index.html', wait_until='domcontentloaded')
                page.wait_for_function('window.depthProbeReady?.()')
                assert page.evaluate("requestAnimationFrame.toString().includes('[native code]') && performance.now.toString().includes('[native code]')"), "원본 RAF/performance 필요"
                tile = page.evaluate('window.p3HealthSetup()')
                stress = page.evaluate('window.p3StressTest()')
                assert not errors, errors
                results.append({'viewport': [width, height], 'dpr': dpr, 'stress': stress})
                (OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f'{width}×{height} DPR {dpr}: 스트레스 통과; hidden={stress["permanentHidden"]}; fallback={stress["fallbacks"]}', flush=True)
                page.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
