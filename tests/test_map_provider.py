"""P3 HTTP 브라우저 회귀: 실제 NAVER API를 요청하지 않는다."""
import datetime as dt
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright
from depth_probe import PROBE, run
from p3_baseline import CHECK, compact

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-output'/'p3'
OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text(encoding='utf-8')
probe=PROBE+CHECK+''.join((ROOT/'tests'/name).read_text(encoding='utf-8') for name in ['p3_provider_checks.js','p3_viewport_checks.js','p3_command_checks.js'])
pos=html.rindex('\n})();')
html=html[:pos]+probe+html[pos:]
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8000),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=srv.serve_forever,daemon=True).start()
results=[]
try:
  with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for width,height in [(390,844),(768,1024),(1280,900),(1365,768),(1920,1080)]:
      for dpr in [1,1.25,1.5,2]:
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=dpr)
        errors=[];failed=[];depth_requests=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('requestfailed',lambda r:failed.append(r.url))
        page.on('request',lambda r:depth_requests.append(r.url) if '/static/depth/' in r.url else None)
        page.route('https://**/*',lambda r:r.abort())
        page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=html))
        page.clock.set_fixed_time(dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated']))
        page.goto('http://localhost:8000/index.html',wait_until='domcontentloaded')
        page.wait_for_function('window.p3Ready?.()')
        assert page.evaluate('window.p3Preference()')['mode']=='satellite','첫 진입 위성 기본값'
        assert page.evaluate('window.p3AdapterUnit()')
        result=page.evaluate('window.p3Test()')
        result['nativeDiagnostic']=page.evaluate('window.p3NativeTest()')
        if width==1280:
          result['continuousViewport']=page.evaluate('window.p3ViewportTest()')
          result['viewportCommands']=page.evaluate('window.p3CommandTest()')
        page.set_viewport_size({'width':width,'height':height-160});page.wait_for_function('window.p3SizeCheck()')
        assert page.evaluate('window.p3SizeCheck()'),'창 높이 변경 반영'
        page.set_viewport_size({'width':width,'height':height});page.wait_for_function('window.p3SizeCheck()')
        page.evaluate('window.p3WaitDepthQuiet()')
        count=len(depth_requests)
        page.evaluate('window.p3SwitchOnly()');page.wait_for_timeout(600)
        assert len(depth_requests)==count,'전환만으로 수심 요청 증가'
        for tab in ['today','map','tide','bite','log']:
          page.locator(f'#tabbar [data-tab="{tab}"]').click()
          page.wait_for_timeout(150)
          assert page.locator('#v-'+tab).is_visible()
          if tab in ('today','map'):
            assert page.evaluate("document.getElementById('sec').getContext('2d').getImageData(0,0,1,1).data[3]>0"),'탭/크기 변경 후 단면 Canvas 복구'
          assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
          if dpr==1 and width in (390,1280):page.screenshot(path=str(OUT/f'{width}-{tab}.png'),full_page=True)
        page.set_viewport_size({'width':height,'height':width})
        page.locator('#tabbar [data-tab="map"]').click();page.wait_for_timeout(350)
        assert page.evaluate("Math.abs(document.getElementById('providerMap').getBoundingClientRect().width-document.getElementById('base').getBoundingClientRect().width)<1")
        assert not errors,errors
        results.append({'viewport':[width,height],'dpr':dpr,**result,'errors':errors,'failedRequests':failed,'depthToggleFetches':len(depth_requests)-count})
        print(f'{width}x{height} DPR {dpr}: 통과',flush=True)
        page.close()
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=3)
    page.route('https://**/*',lambda r:r.abort());page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=html))
    page.goto('http://localhost:8000/index.html',wait_until='domcontentloaded');page.wait_for_function('window.p3Ready?.()')
    high=page.evaluate('window.p3NativeTest()');assert all(s['dpr']==3 and s['drawingDpr']==2 for s in high['samples'])
    results.append({'highDprNative':high});page.close()
    # SDK 실패와 timeout은 메모리 route로 재현한다. 실제 credential/요청 없음.
    for failure in ['404','429','offline','timeout','auth','map-init']:
      print('SDK 실패 검사:',failure,flush=True)
      page=browser.new_page();errors=[]
      page.on('pageerror',lambda e:errors.append(str(e)))
      page.route('https://**/*',lambda r:r.abort())
      body=html.replace('name="naver-map-key-id" content=""','name="naver-map-key-id" content="test-only"')
      page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=body))
      def fail(route):
        if failure in ('404','429'):route.fulfill(status=int(failure),body='')
        elif failure=='timeout':route.fulfill(content_type='application/javascript',body='/* SDK callback 미응답 */')
        elif failure=='map-init':route.fulfill(content_type='application/javascript',body='window.naver={maps:{LatLng:class{},MapTypeId:{SATELLITE:1},Map:class{constructor(){throw Error("fixture");}}}};window.naksigwangProviderReady()')
        elif failure=='auth':route.fulfill(content_type='application/javascript',body='window.navermap_authFailure()')
        else:route.abort()
      page.route('**/maps.js?*',fail)
      page.clock.set_fixed_time(dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated']))
      page.goto('http://localhost:8000/index.html',wait_until='domcontentloaded')
      page.wait_for_function('window.p3Ready?.()')
      if failure=='timeout':page.clock.fast_forward(13000)
      page.wait_for_function("document.getElementById('providerNotice').textContent.includes('불러오지 못해')",timeout=20000)
      expected={'404':'sdk-script-load-failed','429':'sdk-script-load-failed','offline':'sdk-script-load-failed','timeout':'sdk-script-timeout','auth':'auth-failed','map-init':'map-init-failed'}[failure]
      assert page.evaluate('naksigwangTileDiagnostic().lastFallbackReason')==expected,(failure,expected)
      assert page.evaluate('window.p3DepthSnapshot().length===8')
      assert not errors,errors
      results.append({'failure':failure,'passed':True})
      page.close()
    # 이전 개발 설정은 이관하고 v2에서 사용자가 고른 모드는 보존한다.
    for legacy,saved,expected in [('normal',None,'satellite'),('satellite',None,'satellite'),(None,'normal','normal'),(None,'hybrid','hybrid')]:
      page=browser.new_page();page.route('https://**/*',lambda r:r.abort());page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=html))
      page.add_init_script("""const legacy=%s,saved=%s;if(legacy)localStorage.setItem('naksigwang-map-mode',legacy);if(saved)localStorage.setItem('naksigwang-map-mode-v2',saved);"""%(json.dumps(legacy),json.dumps(saved)))
      page.goto('http://localhost:8000/index.html',wait_until='domcontentloaded');page.wait_for_function('window.p3Ready?.()');pref=page.evaluate('window.p3Preference()')
      assert pref['mode']==expected and pref['pressed']==expected and pref['legacy'] is None,pref
      results.append({'preference':expected,'legacy':legacy,'passed':True});page.close()
    # 공개 호스트에는 진단 함수나 native debug Marker를 만들지 않는다. 모든 자료는 로컬 route로 제공한다.
    from urllib.parse import urlparse
    import mimetypes
    page=browser.new_page();page.route('https://**/*',lambda r:r.abort())
    def production(route):
      name=urlparse(route.request.url).path.lstrip('/') or 'index.html'
      if name=='index.html':route.fulfill(content_type='text/html',body=html)
      else:route.fulfill(path=str(ROOT/name),content_type=mimetypes.guess_type(name)[0] or 'application/octet-stream')
    page.route('http://production.example/**',production);page.goto('http://production.example/index.html',wait_until='domcontentloaded');page.wait_for_function('window.p3Ready?.()')
    assert page.evaluate("typeof window.naksigwangMapDiagnostic==='undefined' && typeof window.naksigwangPerfDiagnostic==='undefined' && typeof window.naksigwangTileDiagnostic==='undefined' && !document.querySelector('[data-naksigwang-native-probe]')")
    results.append({'productionDebugAbsent':True,'passed':True});page.close()
    browser.close()
finally:
  srv.shutdown();srv.server_close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
baseline=json.loads((ROOT/'tests/p3_baseline.json').read_text(encoding='utf-8'))
def no_fonts(page):page.route('https://**/*',lambda r:r.abort())
current=compact(run(PROBE+CHECK,'window.p3Baseline()',routes=no_fonts))
assert current==baseline,'main 수심·단면 baseline 변경'
print('P3 통과: 어댑터, 20 viewport/DPR 조합, 여섯 SDK 실패, 수심·단면 baseline 동일')
