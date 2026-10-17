"""실 API 없이 3 화면 × 4 DPR의 이동 성능·Canvas 가시성 회귀."""
import datetime as dt
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from depth_probe import PROBE
from p3_baseline import CHECK

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-output/p3-performance'
OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text(encoding='utf-8')
probe=PROBE+CHECK+''.join((ROOT/'tests'/n).read_text(encoding='utf-8') for n in ['p3_provider_checks.js','p3_viewport_checks.js','p3_path_checks.js','p3_perf_checks.js'])
pos=html.rindex('\n})();');html=html[:pos]+probe+html[pos:]
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=srv.serve_forever,daemon=True).start()
results=[]
try:
  with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for w,h in [(390,844),(1280,900),(1920,1080)]:
      for dpr in [1,1.25,1.5,2]:
        page=browser.new_page(viewport={'width':w,'height':h},device_scale_factor=dpr);errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('https://**/*',lambda r:r.abort())
        page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=html))
        page.clock.set_fixed_time(dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated']))
        page.goto(f'http://localhost:{srv.server_port}/index.html',wait_until='domcontentloaded')
        page.wait_for_function('window.depthProbeReady?.()')
        result=page.evaluate('window.p3PerfTest()');assert not errors,errors
        results.append({'viewport':[w,h],'dpr':dpr,**result})
        (OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'{w}x{h} DPR {dpr}: 통과; moving heavy={result["movingHeavy"]}; marker={result["maxMarkerErrorPx"]:.3f}px; A/B={result["maxABErrorPx"]:.3f}px',flush=True)
        page.close()
    browser.close()
finally:srv.shutdown()
