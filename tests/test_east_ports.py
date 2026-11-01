"""동해 세부 항구: 주요 항 선택·근접 항 분리·중복/공항 제외·모바일 검색 회귀."""
import datetime as dt,functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
out=ROOT/'test-output/east-ports';out.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text(encoding='utf-8');pos=html.rindex('\n})();')
probe="""
window.eastReady=()=>CR.ready;
window.eastCheck=()=>{
 const check=(v,m)=>{if(!v)throw Error(m);};
 const major=['주문진항','속초항','묵호항','동해항','삼척항','옥계항','후포항','구룡포항','강구항','포항구항','포항영일신항만'];
 const port=n=>POINTS.find(p=>p.region==='동해'&&p.kind!=='rock'&&p.name===n);
 for(const name of major){const p=port(name);check(!!p,'주요 항 누락 '+name);const f=findPlace(name);check(f?.pt&&f.p===p,'검색이 별도 항구로 연결 '+name);check(document.querySelector('#stSel option[value="'+POINTS.indexOf(p)+'"]'),'선택 목록 '+name);check(!inBan(p.lat,p.lon),'제한 구역 제외 '+name);check(stationDetailAllowed(p,700),'주요 항 광역 지도 표시 '+name);}
 check(!!port('도동항')&&!port('도동선착장'),'같은 항과 선착장은 항 이름 우선');
 check(gdist(port('속초항'),port('동명항'))<5&&port('속초항')!==port('동명항'),'5km 안 다른 항 분리');
 check(!POINTS.some(p=>p.kind!=='rock'&&/공항|호텔/.test(p.name)),'공항·호텔 오인 제외');
 const east=POINTS.filter(p=>p.region==='동해'&&p.kind!=='rock');
 check(!east.some((p,i)=>east.slice(i+1).some(q=>eastPortName(p.name)===eastPortName(q.name)&&gdist(p,q)<1)),'같은 항/선착장 중복 없음');
 const before=POINTS.map(p=>[p.name,p.lat,p.lon,p.kind]);buildPoints();check(JSON.stringify(before)===JSON.stringify(POINTS.map(p=>[p.name,p.lat,p.lon,p.kind])),'반복 구성 안정성');
 const twins=POINTS.filter(p=>p.name==='후진항');check(twins.length===2&&twins[0].optionLabel!==twins[1].optionLabel,'동명 항구의 예보지점 표기');
 for(const p of twins)check(findPlace(p.optionLabel)?.p===p,'동명 항구 구분 검색');
 return {eastPorts:east.length,total:POINTS.length,major:major.map(name=>{const p=port(name),st=STATIONS[p.st],wx=wxAt(st,TODAY_IDX,kstHour(),p);return {name,lat:p.lat,lon:p.lon,source:p.portSource,station:st.name,wind:wx?.sp??null,wave:wx?.wave??null};})};
};
window.eastNoWeatherIndex=()=>POINTS.findIndex(p=>p.region==='동해'&&!wxCell(p.lat,p.lon));
window.eastSnapshot=()=>POINTS.map(p=>({name:p.name,lat:p.lat,lon:p.lon,region:p.region,kind:p.kind||'port',grid:kmaGrid(p.lat,p.lon)}));
"""
html=html[:pos]+probe+html[pos:]
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
http.server.ThreadingHTTPServer.request_queue_size=128
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=srv.serve_forever,daemon=True).start()
clock=dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated'])
results=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  for width,height in [(390,844),(1280,900)]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.clock.set_fixed_time(clock);page.route('https://**/*',lambda r:r.abort());page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=html))
   page.goto(f'http://127.0.0.1:{srv.server_port}/index.html');page.wait_for_function('window.eastReady?.()');result=page.evaluate('eastCheck()')
   page.locator('#tabbar [data-tab="map"]').click();page.locator('#coordIn').fill('주문진항');page.locator('#coordForm button').click()
   page.wait_for_function("document.querySelector('#stName').textContent==='주문진항'")
   assert '개별 선택 포인트가 없어' not in page.locator('#coordMsg').inner_text()
   page.screenshot(path=str(out/f'{width}-jumunjin-map.png'))
   for tab in ['today','map','tide','bite','log']:
    page.locator(f'#tabbar [data-tab="{tab}"]').click();page.wait_for_timeout(150)
    assert page.locator('#v-'+tab).is_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    page.screenshot(path=str(out/f'{width}-{tab}.png'))
   page.locator('#tabbar [data-tab="tide"]').click();page.locator('.pointDetails>summary').click();assert 'OpenStreetMap' in page.locator('#ptInfo').inner_text()
   missing=page.evaluate('eastNoWeatherIndex()')
   if missing>=0:
    page.locator('#stSel').select_option(str(missing));page.wait_for_timeout(200)
    assert '예보 격자 자료 없음' in page.locator('#wxSlot').inner_text()
   assert not errors,errors
   results.append({'viewport':[width,height],**result,'points':page.evaluate('eastSnapshot()')});page.close()
  browser.close()
finally:srv.shutdown();srv.server_close()
cells={tuple(c) for c in json.loads((ROOT/'collector/points.json').read_text(encoding='utf-8'))['cells']}
assert all(tuple(p['grid']) in cells for r in results for p in r['points'] if p['region']=='동해' and p['kind']=='port'),'동해 항구의 기상 수집 대상 누락'
(out/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('동해 주요 항·근접 항 분리·중복 제외·검색·다섯 탭 통과',[(r['viewport'],r['eastPorts']) for r in results])
