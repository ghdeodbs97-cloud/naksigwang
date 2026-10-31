"""실 NAVER 어댑터를 통과하는 이동 pane 원점 회귀. 실 API/키를 사용하지 않는다."""
import functools
import http.server
import json
from pathlib import Path
import threading
import subprocess
import sys
from playwright.sync_api import sync_playwright
from p3_native_clock import fixed_date_script
from depth_probe import PROBE
from p3_baseline import CHECK
from p3_history import before_added

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-output/p3-pane'
OUT.mkdir(parents=True, exist_ok=True)
previous = '--previous' in sys.argv
previous_ref = before_added('tests/p3_pane_checks.js') if previous else None
html = subprocess.run(['git', 'show', previous_ref+':index.html'], capture_output=True, encoding='utf-8', check=True).stdout if previous else (ROOT / 'index.html').read_text(encoding='utf-8')
probe = PROBE + CHECK + ''.join((ROOT / 'tests' / name).read_text(encoding='utf-8') for name in ['p3_provider_checks.js', 'p3_pane_checks.js'])
pos = html.rindex('\n})();')
html = html[:pos] + probe + html[pos:]
http.server.SimpleHTTPRequestHandler.log_message = lambda *args: None
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
results = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width, height in ([(390, 844)] if previous else [(390, 844), (768, 1024), (1280, 900), (1920, 1080)]):
            for dpr in ([1] if previous else [1, 1.25, 1.5, 2]):
                page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=dpr)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('https://**/*', lambda route: route.abort())
                page.route('**/index.html', lambda route: route.fulfill(content_type='text/html', body=html))
                page.add_init_script(fixed_date_script(json.loads((ROOT / 'data/meta.json').read_text(encoding='utf-8'))['generated']))
                page.goto(f'http://localhost:{server.server_port}/index.html', wait_until='domcontentloaded')
                page.wait_for_function('window.p3Ready?.()')
                if previous:
                    try:
                        page.evaluate('p3PaneTest()')
                    except Exception as error:
                        assert '실제 adapter pane DOM 중심 정합' in str(error), str(error)
                        print('이전 '+previous_ref[:7]+' 실제 빌드의 pan 좌표 실패 재현: ' + str(error).splitlines()[0], flush=True)
                        page.close()
                        continue
                    raise AssertionError('이전 빌드에서 같은 pan 좌표 오류를 재현하지 못함')
                result = page.evaluate('p3PaneTest()')
                assert not errors, errors
                results.append({'viewport': [width, height], 'dpr': dpr, **result})
                (OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f'{width}x{height} DPR {dpr}: pane pass {result}', flush=True)
                page.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
