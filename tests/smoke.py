"""빠른 동작 확인: 저장소 폴더를 로컬 웹서버로 띄워 index.html을 열고, 오류 없이 주요 칸이 채워지는지 본다.
사용: pip install playwright && playwright install chromium && python tests/smoke.py"""
import functools, http.server, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8799), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
srv.RequestHandlerClass.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
CHECK = ['stName', 'dataTime', 'curDir', 'wxSst', 'dayEvents', 'biteSub']
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1300, 'height': 1000}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto('http://127.0.0.1:8799/index.html'); pg.wait_for_timeout(5000)
    vals = {i: pg.inner_text('#' + i) for i in CHECK}
    for k, v in vals.items(): print(f'{k:10s} {v[:70]!r}')
    empty = [k for k, v in vals.items() if v.strip() in ('', '—')]
    b.close()
if errs or empty:
    print('실패:', errs[:5], '비어 있는 칸:', empty); sys.exit(1)
print('통과')
