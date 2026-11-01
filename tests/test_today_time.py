"""오늘 시간 선택: 마우스/터치/키보드·예보 시각·현재 복귀·수온 관측·재계산 회귀."""
import datetime as dt,functools,http.server,json,threading
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-output/today-time';OUT.mkdir(parents=True,exist_ok=True)
html=(ROOT/'index.html').read_text(encoding='utf-8');pos=html.rindex('\n})();')
probe="""
window.todayReady=()=>CR.ready&&!!TD;
window.todayPoint=name=>POINTS.findIndex(p=>p.name===name);
window.todaySnapshot=()=>{const p=POINTS[S.pt],st=STATIONS[p.st],day=Math.min(TODAY_IDX,st.days.length-1),h=todayHour(),r=tideAt(st,day*24+h),wx=wxAt(st,day,h,p),fu=flowU(st,p,day,day*24+h),sw=sstFor(p),u=r.rate/st.maxRate;return {name:p.name,h,day,stateDay:S.day,stateHour:S.t,manual:todaySelectedHour,label:$('todayTimeLabel').textContent,slider:+$('todayTime').value,tideCm:Math.round(r.cm),mul:$('tdMul').textContent,wind:$('tdWind').textContent,wave:$('tdWave').textContent,sst:$('tdSst').textContent,current:$('tdCur').textContent,expected:{wind:wx?.sp??null,wave:wx?.wave??null,sst:sw?.[0]??null,sourceDate:sw?.[1]??null,real:fu.real,current:fu.real?(fu.r.sp*KN<.2?'물돌이 무렵':dirName16(fu.r.dir)+'쪽 '+(fu.r.sp*KN).toFixed(1)+' kn'):Math.round(Math.abs(u)*100)+'%'},recommendations:$('tdBest').textContent};};
window.todayCountStart=()=>{window.todayCounts={eval:0,recommendations:0};const ev=biteEvalAt,rt=renderToday;biteEvalAt=(...a)=>{window.todayCounts.eval++;return ev(...a);};renderToday=(...a)=>{window.todayCounts.recommendations++;return rt(...a);};};
window.todaySyntheticWeather=()=>{const p=POINTS[S.pt],key=kmaGrid(p.lat,p.lon).join(','),date=dateAdd(DAY0,TODAY_IDX).replaceAll('-','');window.todaySavedWeather={cells:WXG.cells,contexts:BITE_CONTEXTS};WXG.cells={[key]:{[date+'06']:[90,2,.3],[date+'18']:[270,8,1.8]}};WX_CELL.clear();BITE_CONTEXTS=null;};
window.todayRestoreWeather=()=>{WXG.cells=window.todaySavedWeather.cells;WX_CELL.clear();BITE_CONTEXTS=window.todaySavedWeather.contexts;selectTodayHour(18);};
"""
html=html[:pos]+probe+html[pos:]
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
http.server.ThreadingHTTPServer.request_queue_size=128
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=srv.serve_forever,daemon=True).start()
clock=dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated'])+dt.timedelta(hours=12)
results=[]
def set_minute(page,value):
 page.locator('#todayTime').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
 page.wait_for_timeout(60)
 return page.evaluate('todaySnapshot()')
def check_row(r):
 assert r['stateDay']==r['day'] and abs(r['stateHour']-r['h'])<1e-7,r
 assert str(r['tideCm'])+' cm' in r['mul'],r
 for key,suffix in [('wind',' m/s'),('wave',' m')]:
  value=r['expected'][key]
  assert ('예보 없음' in r[key]) if value is None else f'{value:.1f}'+suffix in r[key],r
 assert r['expected']['current'] in r['current'],r
 if r['expected']['sst'] is not None:assert f"{r['expected']['sst']:.1f} ℃" in r['sst'] and r['expected']['sourceDate'] in r['sst']
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  for width,height in [(390,844),(1280,900)]:
   page=browser.new_page(viewport={'width':width,'height':height},has_touch=width==390);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.clock.install(time=clock)
   page.route('https://**/*',lambda r:r.abort());page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=html));page.goto(f'http://127.0.0.1:{srv.server_port}/index.html#today');page.wait_for_function('window.todayReady?.()')
   rows=[]
   for point in ['주문진항','격포항']:
    page.locator('#stSel').select_option(str(page.evaluate('todayPoint',point)))
    for minute in [0,360,720,1080,1439]:
     r=set_minute(page,minute);check_row(r);assert r['slider']==minute;rows.append(r)
    assert len({r['mul'] for r in rows if r['name']==point})>1
    assert len({r['current'] for r in rows if r['name']==point})>1
   page.evaluate('todaySyntheticWeather()');a=set_minute(page,360);b=set_minute(page,1080);check_row(a);check_row(b)
   assert a['wind']!=b['wind'] and a['wave']!=b['wave'] and a['sst']==b['sst'];page.evaluate('todayRestoreWeather()')
   page.locator('#todayTime').focus();page.keyboard.press('Home');assert page.evaluate('todaySnapshot().slider')==0
   page.keyboard.press('ArrowRight');assert page.evaluate('todaySnapshot().slider')==1
   page.keyboard.press('End');assert page.evaluate('todaySnapshot().slider')==1439
   box=page.locator('#todayChart').bounding_box();page.mouse.move(box['x']+box['width']*.25,box['y']+70);page.mouse.down();page.mouse.move(box['x']+box['width']*.75,box['y']+70,steps=12);page.mouse.up();r=page.evaluate('todaySnapshot()');assert r['slider']==1080
   if width==390:
    cdp=page.context.new_cdp_session(page);x=box['x']+box['width']*.25;y=box['y']+70
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':box['x']+box['width']*.5,'y':y}]});cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});assert page.evaluate('todaySnapshot().slider')==720
   set_minute(page,1080);page.clock.fast_forward(61000);assert page.evaluate('todaySnapshot().slider')==1080
   page.locator('#tabbar [data-tab="tide"]').click();page.locator('#dayStrip button').nth(1).click();page.locator('#tabbar [data-tab="today"]').click();assert page.evaluate('(()=>{const s=todaySnapshot();return s.stateDay===s.day;})()')
   page.wait_for_timeout(100);page.evaluate('todayCountStart()');set_minute(page,300)
   for i in range(20):set_minute(page,300+i)
   counts=page.evaluate('window.todayCounts');assert counts=={'eval':0,'recommendations':0},counts
   page.locator('#todayNow').click();page.wait_for_timeout(100);r=page.evaluate('todaySnapshot()');assert r['manual'] is None and r['label'].startswith('지금 ')
   page.clock.fast_forward(61000);check_row(page.evaluate('todaySnapshot()'))
   set_minute(page,1080);page.screenshot(path=str(OUT/f'{width}-selected.png'),full_page=False)
   for tab in ['today','map','tide','bite','log']:
    page.locator(f'#tabbar [data-tab="{tab}"]').click();page.wait_for_timeout(100);assert page.locator('#v-'+tab).is_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/f'{width}-{tab}.png'))
   assert not errors,errors
   results.append({'viewport':[width,height],'rows':rows,'scrubCounts':counts,'touch':width==390,'passed':True});page.close()
  browser.close()
finally:srv.shutdown();srv.server_close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print('오늘 시간 선택·예보 일치·수온 관측 유지·지금 복귀·입력 방식·재계산 방지·다섯 탭 통과')
