"""화면 밀도·7일 예보·단위·관측/모델 구분·실패 복구를 실 API 없이 검사한다."""
import datetime as dt
import functools
import http.server
import json
import subprocess
import threading
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-output/tide-weather'
OUT.mkdir(parents=True,exist_ok=True)
CLOCK=dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated'])
DAY=CLOCK.date().isoformat()
HTML=(ROOT/'index.html').read_text(encoding='utf-8')
BASE=subprocess.check_output(['git','show','origin/main:index.html'],cwd=ROOT).decode('utf-8')
PROBE='''
window.weatherTest={ready:()=>CR.ready, state:()=>({status:WEEK_FORECAST.cache.get(weekPointKey(POINTS[S.pt]))?.status,day:S.day,today:TODAY_IDX,days:NDAYS,cache:WEEK_FORECAST.cache.size}),
 point:()=>({lat:POINTS[S.pt].lat,lon:POINTS[S.pt].lon}),day:i=>setDay(TODAY_IDX+i),hour:h=>{S.t=h;RENDER.readKey='';},
 condition:(day=0)=>tideWeatherAt(STATIONS[S.st],POINTS[S.pt],TODAY_IDX+day,S.t),
 parser:(r,kind)=>{try{const p=POINTS[S.pt];return {ok:true,first:[...parseWeekForecast(r,kind,p).rows.values()][0]};}catch(e){return {ok:false};}},
 khoa:()=>{const c=CR.st.find(c=>crntAt(c,12)),p={lat:c.lat,lon:c.lon};return tideWeatherAt(STATIONS[S.st],p,S.day,12).current;},
 kmaHumidity:v=>{const p=POINTS[S.pt],key=kmaGrid(p.lat,p.lon).join(','),date=dateAdd(DAY0,S.day).replaceAll('-',''),hour=String(Math.floor(S.t)).padStart(2,'0');WXG.cells[key]??={};WXG.cells[key][date+hour]=[90,3.6,.8,v];WX_CELL.clear();RENDER.readKey='';},
 acceptWx:d=>validBootData('wx',d),scores:()=>FISH.map(f=>biteAt(f,POINTS[S.pt],STATIONS[S.st],S.day,S.t)),
 fallback:()=>{const e=WEEK_FORECAST.cache.get(weekPointKey(POINTS[S.pt]));if(e)e.sea=null;WEEK_FORECAST.revision++;RENDER.readKey='';},
 missingCompression:()=>{CR.ready=false;CR.err='압축 해제 미지원';RENDER.readKey='';}
};
'''

def injected(source):
    pos=source.rindex('\n})();')
    return source[:pos]+PROBE+source[pos:]

def fixture(kind,lat,lon,day=DAY):
    fields={'air':{'wind_speed_10m':3.6,'wind_direction_10m':90,'relative_humidity_2m':67},
            'sea':{'wave_height':.8,'sea_surface_temperature':19.5,'ocean_current_velocity':3.6,'ocean_current_direction':270}}[kind]
    units={'wind_speed_10m':'m/s','wind_direction_10m':'°','relative_humidity_2m':'%', 'wave_height':'m','sea_surface_temperature':'°C','ocean_current_velocity':'km/h','ocean_current_direction':'°'}
    times=[(dt.datetime.fromisoformat(day)+dt.timedelta(hours=i)).strftime('%Y-%m-%dT%H:00') for i in range(168)]
    return {'latitude':lat,'longitude':lon,'utc_offset_seconds':32400,'hourly_units':{k:units[k] for k in fields},'hourly':{'time':times,**{k:[v]*168 for k,v in fields.items()}}}

http.server.SimpleHTTPRequestHandler.log_message=lambda *args:None
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/index.html'
results=[]

def setup(page,html,mode='ok',clock=CLOCK):
    calls=[]
    def route(r):
        u=urlsplit(r.request.url)
        if u.hostname in ('api.open-meteo.com','marine-api.open-meteo.com'):
            q=parse_qs(u.query);assert q['forecast_days']==['7'] and q['timezone']==['Asia/Seoul']
            kind='air' if u.hostname=='api.open-meteo.com' else 'sea';calls.append(kind)
            if mode=='fail':return r.abort()
            data=fixture(kind,float(q['latitude'][0]),float(q['longitude'][0]),clock.date().isoformat())
            if mode=='null' and kind=='sea':data['hourly']={k:([None]*168 if k!='time' else v) for k,v in data['hourly'].items()}
            return r.fulfill(status=200,content_type='application/json',body=json.dumps(data))
        if u.hostname=='127.0.0.1':
            if u.path=='/index.html':return r.fulfill(status=200,content_type='text/html',body=html)
            return r.continue_()
        return r.abort()
    page.route('**/*',route)
    page.clock.set_fixed_time(clock)
    page.goto(URL)
    page.wait_for_function("document.querySelectorAll('#fishGrid .fish').length===39")
    return calls

try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch()
  before=browser.new_page(viewport={'width':390,'height':844})
  setup(before,BASE)
  before.locator('[data-tab="bite"]').click()
  old_columns=before.locator('#fishGrid').evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")
  assert old_columns==2,'수정 전 한 줄 두 카드 재현'
  assert before.locator('#wxHumidity').count()==0,'수정 전 습도 표시 없음'
  before.close()
  for width,height in [(390,844),(1280,900),(320,740)]:
   page=browser.new_page(viewport={'width':width,'height':height});errors=[]
   page.on('pageerror',lambda e:errors.append(str(e)))
   calls=setup(page,injected(HTML))
   page.wait_for_function("weatherTest.state().status==='ready' && weatherTest.ready()")
   original_scores=page.evaluate('weatherTest.scores()')
   assert page.locator('#tdBest .pc').count()==4
   assert all('입질 확률' in x and '점' not in x for x in page.locator('#tdBest .pc').all_text_contents())
   for tab in ['today','map','tide','bite','log']:
    page.locator(f'[data-tab="{tab}"]').click();page.wait_for_timeout(120)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'{width} {tab} 가로 넘침'
    page.screenshot(path=str(OUT/f'{width}-{tab}.png'),full_page=False)
   page.locator('[data-tab="bite"]').click()
   columns=page.locator('#fishGrid').evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length")
   assert columns==(6 if width>=900 else 4),(width,columns)
   tops=page.locator('#fishGrid .fish').evaluate_all('es=>es.slice(0,4).map(e=>e.getBoundingClientRect().top)')
   assert max(tops)-min(tops)<1
   page.locator('.fish .cardDetails summary').first.click()
   page.locator('.fish').first.locator('.fishEcology').wait_for(state='visible')
   page.locator('.fish .cardDetails summary').first.click()
   page.locator('[data-tab="tide"]').click()
   assert page.locator('#weekWeatherBody tr').count()==7
   assert '67' in page.locator('#wxHumidity').inner_text()
   assert '해류 모델' in page.locator('#crNow').inner_text()
   c=page.evaluate('weatherTest.condition()');assert abs(c['current']['value']-1)<1e-10,'km/h → m/s'
   assert page.evaluate('weatherTest.khoa().source').startswith('KHOA'),'근거리 KHOA 우선'
   count=len(calls)
   for day in range(7):
    page.evaluate('(i)=>weatherTest.day(i)',day);page.wait_for_timeout(80)
    assert page.locator('#wxHumidity').inner_text()=='67 %'
    assert '자료 없음' not in page.locator('#wxWind').inner_text()
    assert '자료 없음' not in page.locator('#wxWave').inner_text()
    if day:
     assert page.locator('#wxSstLabel').inner_text()=='수온 예측'
     assert page.locator('#wxSst').inner_text()=='19.5 ℃','현재 관측을 미래에 복사하지 않음'
   assert len(calls)==count,'날짜·시각 변경으로 추가 fetch 없음'
   page.evaluate('weatherTest.day(0)')
   assert page.evaluate('weatherTest.scores()')==original_scores,'보완 모델이 기존 입질 계산을 바꾸지 않음'
   page.evaluate('weatherTest.kmaHumidity(45)');page.wait_for_timeout(80)
   assert page.locator('#wxHumidity').inner_text()=='45 %','기상청 습도 우선'
   doc={'base':'202611010800','cells':{'1,1':{'2026110100':[90,3.6,.8,45]}}}
   assert page.evaluate('(d)=>weatherTest.acceptWx(d)',doc),'새 4항목 기상 파일 초기 로드 허용'
   point=page.evaluate('weatherTest.point()')
   valid=fixture('sea',point['lat'],point['lon'])
   assert page.evaluate('(r)=>weatherTest.parser(r,"sea").first.ocean_current_velocity',valid)==1
   zero=fixture('sea',point['lat'],point['lon']);zero['hourly']['ocean_current_velocity']=[0]*168
   assert page.evaluate('(r)=>weatherTest.parser(r,"sea").first.ocean_current_velocity',zero)==0,'유효한 0 유속 유지'
   valid['hourly_units']['ocean_current_velocity']='mph'
   assert not page.evaluate('(r)=>weatherTest.parser(r,"sea").ok',valid),'미지원 유속 단위 거부'
   valid['hourly_units']['ocean_current_velocity']='km/h';valid['utc_offset_seconds']=0
   assert not page.evaluate('(r)=>weatherTest.parser(r,"sea").ok',valid),'UTC 자료를 KST로 오해하지 않음'
   p=fixture('sea',0,0)
   assert not page.evaluate('(r)=>weatherTest.parser(r,"sea").ok',p),'잘못된 격자 거부'
   page.evaluate('weatherTest.missingCompression()');page.wait_for_timeout(80)
   assert '해류 모델' in page.locator('#crNow').inner_text(),'압축 미지원이어도 모델 표시'
   assert not errors,errors
   results.append({'viewport':[width,height],'oldColumns':old_columns,'newColumns':columns,'days':7,'requests':len(calls),'tabs':5,'errors':errors})
   page.close()
  late=browser.new_page(viewport={'width':390,'height':844})
  setup(late,injected(HTML),clock=CLOCK+dt.timedelta(days=1))
  late.wait_for_function("weatherTest.state().status==='ready'")
  late.locator('[data-tab="tide"]').click()
  late.wait_for_function("document.querySelectorAll('#weekWeatherBody tr').length===7")
  assert late.locator('#dayStrip button').count()==7,'갱신 전 어제 자료여도 오늘부터 7일'
  assert late.evaluate('weatherTest.state().days-weatherTest.state().today')==7
  late.close()
  for mode in ['fail','null']:
   page=browser.new_page(viewport={'width':390,'height':844})
   setup(page,injected(HTML),mode)
   page.wait_for_function("weatherTest.state().status!=='loading' && weatherTest.ready()")
   page.locator('[data-tab="tide"]').click()
   page.evaluate('weatherTest.day(6)');page.wait_for_timeout(100)
   assert page.locator('#wxSst').inner_text()=='자료 없음'
   assert '0.0 kn' not in page.locator('#crNow').inner_text(),'결측을 0 유속으로 표시하지 않음'
   if mode=='fail':
    page.evaluate('weatherTest.day(0)');page.wait_for_timeout(80)
    assert '자료 없음' not in page.locator('#wxWind').inner_text(),'보완 API 실패 시 KMA 유지'
   page.close()
  browser.close()
finally:
 server.shutdown();server.server_close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False));print('화면 밀도·7일 예보·관측/모델·단위·실패 복구 통과')
