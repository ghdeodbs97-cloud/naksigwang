"""실제 저장소 좌표에서 수심 기준값/변경값을 기록한다 (운영 자료는 수정하지 않음)."""
import datetime as dt
import functools
import http.server
import json
from pathlib import Path
import sys
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PROBE = r'''
window.depthProbeReady = () => !!GE;
window.depthProbe = () => {
  const names = ['거진', '아야진', '봉포', '속초', '대포', '문암', '남애', '주문진'];
  return names.map(name => {
    let p = POINTS.find(p => p.name.includes(name) && p.lat > 37.7 && p.lon > 128) || PORTS.find(p => p.name.includes(name) && p.lat > 37.7 && p.lon > 128);
    if (!p) {
      const o = OSM.list.find(o => o.name === name + '항');
      if (o) p = { name: o.name + ' (OSM 첫 좌표)', lon: lonOf(o.R[0].xs[0]), lat: latOf(o.R[0].ys[0]) };
    }
    if (!p) throw Error('저장소 좌표 없음: ' + name);
    const mx = mxOf(p.lon), my = myOf(p.lat), k = kAt(p.lat);
    // 항 중심이 육지면 동쪽으로 50 m씩 이동해 첫 바다를 사용한다. 동일 규칙으로 재현.
    let offset = 0; while (offset <= 2000 && inLand(mx + offset * k, my)) offset += 50;
    if (offset > 2000) throw Error('바다 좌표 없음: ' + name);
    const x = mx + offset * k, dg = groundToCoast(x, my);
    const r = depthQuery(x, my) || modelDepth(x, my, dg);
    return {name, point: p.name, lat: p.lat, lon: p.lon, eastOffsetM: offset,
      queryLon: lonOf(x), coastDistanceM: dg, depth: r.depth, type: r.type,
      source: r.label, sourceType: r.sourceType || null, estimated: r.estimated ?? (r.type === 'est' || !!r.mix),
      eastSamples: [500,1000].map(distance => {
        const sx=x+distance*k, sdg=groundToCoast(sx,my), q=depthQuery(sx,my)||modelDepth(sx,my,sdg);
        return {distance,lon:lonOf(sx),land:inLand(sx,my),depth:q.depth,type:q.type,mix:!!q.mix};
      })};
  });
};
'''

def run(probe=PROBE, action='window.depthProbe()', routes=None, html_source=None, viewport=None):
    html = html_source if html_source is not None else (ROOT / 'index.html').read_text(encoding='utf-8')
    pos = html.rindex('\n})();')
    html = html[:pos] + '\n' + probe + html[pos:]
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport=viewport or {'width': 390, 'height': 844})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            clock = json.loads((ROOT / 'data/meta.json').read_text(encoding='utf-8'))['generated']
            page.clock.set_fixed_time(dt.datetime.fromisoformat(clock))
            page.route('**/index.html', lambda route: route.fulfill(content_type='text/html', body=html))
            if routes:
                routes(page)
            page.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
            page.wait_for_function('window.depthProbeReady?.()')
            result = page.evaluate(action)
            assert not errors, errors
            browser.close()
            return result
    finally:
        srv.shutdown()

if __name__ == '__main__':
    html_source = subprocess.check_output(['git','show',sys.argv[2]+':index.html'], cwd=ROOT).decode('utf-8') if len(sys.argv)>2 else None
    result = run(html_source=html_source)
    Path(sys.argv[1]).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
