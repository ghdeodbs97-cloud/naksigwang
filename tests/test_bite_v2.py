"""입질 V2: 실제 앱의 환경·39종 행렬·가상 방향 검사와 두 화면의 갱신 성능."""
import datetime as dt
import functools
import http.server
import json
import statistics
import subprocess
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASELINE = 'd60d6d79c495e6975b31b1ed2325ce39be248053'
mode = sys.argv[1] if len(sys.argv) > 1 else 'after'
probe = (ROOT/'tests/bite_v2_probe.js').read_text(encoding='utf-8')
if mode != 'before':
    checks = (ROOT/'tests/bite_v2_assertions.js').read_text(encoding='utf-8')
    probe = probe.replace('return {sharedCurveCalls,', 'const validation=(()=>{'+checks+'})(); return {validation,sharedCurveCalls,')
html = subprocess.check_output(['git', 'show', BASELINE+':index.html'], cwd=ROOT).decode('utf-8') if mode == 'before' else (ROOT/'index.html').read_text(encoding='utf-8')
pos = html.rindex('\n})();')
html = html[:pos]+'\nwindow.v2Ready=()=>CR.ready && !!GE; window.v2Run=async()=>{'+probe+'\n};'+html[pos:]
clock = dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated'])
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()

def validate(result):
    if mode == 'before':
        return
    assert result['numericSpecies'] == 39
    assert result['validation']['checks'] >= 318
    assert result['sharedCurveCalls'] == 39*24
    for point in result['points']:
        matrix = {row['name']:row['curve'] for row in point['matrix']}
        assert all(isinstance(v, (int,float)) and 0 <= v <= 99 for curve in matrix.values() for v in curve)
        assert matrix['우럭'] == matrix['조피볼락']
        for a,b in [('우럭','광어'),('삼치','붕장어'),('방어','무늬오징어')]:
            assert statistics.correlation(matrix[a], matrix[b]) < .95, (point['name'],a,b)
        environment = point['environment']
        assert not environment['land'] or environment['depth'] is None
        assert environment['surface']['state']=='water' or environment['depth'] is None
        assert all(s['sourceType'] != 'model_estimate' for s in environment['samples'])
        assert len(point['highCorrelation']) < point['pairCount']*.8
    assert len({','.join(p['top10']) for p in result['points']}) >= 3
    assert result['highCorrelationFraction'] < .8, '전체 곡선이 같은 모양으로 수렴'

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        samples = []
        for width,height in [(1280,900),(390,844)]:
            page = browser.new_page(viewport={'width':width,'height':height})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.clock.set_fixed_time(clock)
            page.route('https://**/*', lambda r:r.abort())
            page.route('**/index.html', lambda r:r.fulfill(content_type='text/html',body=html))
            page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
            page.wait_for_function('window.v2Ready?.()')
            result = page.evaluate('v2Run()')
            assert not errors, errors
            validate(result)
            samples.append(result)
            print(width, {k:v for k,v in result.items() if k not in ('points','validation')}, flush=True)
            page.close()
        browser.close()
    (ROOT/'test-output/bite_v2_viewport_debug.json').write_text(json.dumps(samples,ensure_ascii=False,indent=2),encoding='utf-8')
    assert [(p['name'],p['matrix']) for p in samples[0]['points']] == [(p['name'],p['matrix']) for p in samples[1]['points']], '화면 크기에 따른 점수 변화 금지'
    result = samples[0]
    result['performanceByViewport'] = {label:{k:v for k,v in r.items() if k not in ('points','validation')} for label,r in zip(['1280x900','390x844'], samples)}
    result['mobileChecks'] = samples[1].get('validation',{}).get('checks',0)
    (ROOT/f'tests/bite_v2_{mode}.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
finally:
    server.shutdown()
    server.server_close()
