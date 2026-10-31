"""V2.1 실제 날짜별 진단과 카드/두 화면 회귀. before는 변경 전 커밋을 읽는다."""
import datetime as dt,functools,http.server,json,sys,threading,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
mode=sys.argv[1] if len(sys.argv)>1 else 'after'
html=subprocess.check_output(['git','show','993805e67cb1c9aeb3a0faba4e2ad8193a7c3677:index.html'],cwd=ROOT).decode('utf-8') if mode=='before' else (ROOT/'index.html').read_text(encoding='utf-8')
probe=(ROOT/'tests/bite_v21_probe.js').read_text(encoding='utf-8')
assertions=(ROOT/'tests/bite_v21_assertions.js').read_text(encoding='utf-8').replace('/*LEGACY_V2_ASSERTIONS*/',(ROOT/'tests/bite_v2_assertions.js').read_text(encoding='utf-8')) if mode!='before' else ''
extra='' if mode=='before' else '\nwindow.v21Assertions=()=>{'+assertions+'\n};'
pos=html.rindex('\n})();');html=html[:pos]+extra+'\nwindow.v21Ready=()=>CR.ready&&!!GE;window.v21Run=async()=>{'+probe+'\n};'+html[pos:]
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
http.server.ThreadingHTTPServer.request_queue_size=128
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
clock=dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated'])
output=ROOT/'test-output/v21';output.mkdir(parents=True,exist_ok=True)
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();results=[]
  for width,height in ([(1280,900),(390,844)] if mode=='before' else [(390,844),(1280,900)]):
   page=browser.new_page(viewport={'width':width,'height':height});errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)));page.clock.set_fixed_time(clock)
   page.route('https://**/*',lambda r:r.abort());page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=html))
   page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.wait_for_function('window.v21Ready?.()')
   result=page.evaluate('v21Run()');assert not errors,errors
   if mode!='before':
    for point in result['points']:
     for day in point['days']:
      assert all(0<=r['habitatScore']<=100 and 0<=r['dynamicScore']<=100 and 0<=r['rawScore']<=99 and isinstance(r['score'],int) and 0<=r['confidence']<=100 for r in day)
    for tab in ['today','map','tide','bite','log']:
     page.locator(f'#tabbar [data-tab="{tab}"]').click();page.wait_for_timeout(150)
     assert page.locator(f'#v-{tab}').is_visible()
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
     page.screenshot(path=str(output/f'{width}-{tab}.png'))
    page.locator('#tabbar [data-tab="bite"]').click();page.locator('#fishGrid .fish').first.evaluate("el=>el.scrollIntoView({block:'center'})");page.wait_for_timeout(100);page.locator('#fishGrid .fish').first.screenshot(path=str(output/f'{width}-card.png'))
    assert page.locator('.habitatSummary').count()==page.locator('.catchSpotSummary').count()==page.locator('.biteScores').count()==39
    assert page.locator('.biteConfidence').count()==0
    assert '자료 신뢰도' not in page.locator('#fishGrid').inner_text()
    assert 'undefined' not in page.locator('#fishGrid').inner_text() and 'NaN' not in page.locator('#fishGrid').inner_text()
   results.append({'viewport':[width,height],**result});print(width,result['performance'],result.get('validations'),flush=True);page.close()
  browser.close()
 if len(results)>1:
  assert [[r['score'] for r in d] for p in results[0]['points'] for d in p['days']]==[[r['score'] for r in d] for p in results[1]['points'] for d in p['days']], '화면 크기와 무관한 동일 점수'
  results[1]={k:v for k,v in results[1].items() if k!='points'}
 (ROOT/f'tests/bite_v21_{mode}.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
finally:server.shutdown();server.server_close()
