"""공개/로컬 origin의 SDK 로드 진단과 두 화면의 어종 카드 표시를 실 API 없이 검사한다."""
import datetime as dt
import json
import mimetypes
from pathlib import Path
import subprocess
from urllib.parse import urlsplit, unquote, parse_qs
from playwright.sync_api import sync_playwright
from p3_history import before_added

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-output/pages-map-bite'
OUT.mkdir(parents=True,exist_ok=True)
clock=dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated'])
html=(ROOT/'index.html').read_text(encoding='utf-8')
KEY='fixture-naver-key-not-real'
try:base=before_added('tests/test_pages_map_bite_ui.py')
except RuntimeError:base='HEAD'
old_html=subprocess.check_output(['git','show',base+':index.html'],cwd=ROOT).decode('utf-8')

def routes(page, source, origin, mode='missing'):
    requests=[]
    def route(request):
        parts=urlsplit(request.request.url)
        if parts.hostname=='oapi.map.naver.com':
            assert parts.path=='/openapi/v3/maps.js'
            args=parse_qs(parts.query)
            assert args['ncpKeyId']==[KEY] and args['callback']==['naksigwangProviderReady']
            requests.append('sdk-request')
            if mode=='network':return request.abort()
            body={
                'success':"if(typeof naksigwangProviderReady!=='function'||typeof navermap_authFailure!=='function')throw Error('callback order');window.naver={maps:{Map:function(){}}};naksigwangProviderReady();",
                'local':'window.naver={maps:{Map:function(){}}};naksigwangProviderReady();',
                'callback-before-sync':'window.naver={maps:{}};naksigwangProviderReady();window.naver.maps.Map=function(){};',
                'callback-before-microtask':'window.naver={maps:{}};naksigwangProviderReady();queueMicrotask(()=>window.naver.maps.Map=function(){});',
                'callback-before-task':'window.naver={maps:{}};naksigwangProviderReady();setTimeout(()=>window.naver.maps.Map=function(){},50);',
                'callback-before-delayed':'window.naver={maps:{}};naksigwangProviderReady();setTimeout(()=>window.naver.maps.Map=function(){},1000);',
                'auth-during-wait':'window.naver={maps:{}};naksigwangProviderReady();setTimeout(()=>navermap_authFailure(),30);setTimeout(()=>window.naver.maps.Map=function(){},100);',
                'local-race-microtask':'window.naver={maps:{}};naksigwangProviderReady();queueMicrotask(()=>window.naver.maps.Map=function(){});',
                'local-race-task':'window.naver={maps:{}};naksigwangProviderReady();setTimeout(()=>window.naver.maps.Map=function(){},50);',
                'api-too-late':'window.naver={maps:{}};naksigwangProviderReady();setTimeout(()=>window.naver.maps.Map=function(){},3500);',
                'auth':'navermap_authFailure();',
                'no-callback':'window.naver={maps:{Map:function(){}}};',
                'api-missing':'window.naver={maps:{}};naksigwangProviderReady();',
                'init-failed':'window.naver={maps:{Map:function(){}}};naksigwangProviderReady();'
            }[mode]
            return request.fulfill(content_type='application/javascript',body=body)
        if parts.netloc!=urlsplit(origin).netloc:return request.abort()
        path=unquote(parts.path)
        if path.startswith('/naksigwang/'):path=path[len('/naksigwang/'):]
        path=path.lstrip('/') or 'index.html'
        if path=='index.html':return request.fulfill(content_type='text/html',body=source)
        target=(ROOT/path).resolve()
        if ROOT not in target.parents or not target.is_file():return request.fulfill(status=404)
        request.fulfill(path=str(target),content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
    page.route('**/*',route)
    return requests

# SDK 로드 경계만 검사하는 대역. 좌표/그리기 계약은 기존 provider suite에서 검사한다.
loader_probe='''
window.__pagesInitCalls=0;
NaverMapAdapter.prototype.init=function(){window.__pagesTabAtInit=TAB;window.__pagesHostAtInit=stage.parentNode.id;window.__pagesInitCalls++;if(window.__pagesInitFail)throw Error('fixture private details');};
NaverMapAdapter.prototype.onTilesLoaded=function(){};
NaverMapAdapter.prototype.onViewportReady=function(){};
NaverMapAdapter.prototype.setMode=function(){};
NaverMapAdapter.prototype.resize=function(){};
NaverMapAdapter.prototype.setInteraction=function(){};
providerApplyView=()=>Promise.resolve({ok:true});providerSync=()=>false;
'''
def loader_html(mode):
    source=html
    if mode not in ['missing','preloaded'] and not mode.startswith('local'):
        source=source.replace('name="naver-map-key-id" content=""','name="naver-map-key-id" content="'+KEY+'"',1)
    pos=source.index('// 23_main.js')
    return source[:pos]+loader_probe+source[pos:]

ui_probe='''
window.pagesUiReady=()=>CR.ready&&!!GE;
window.pagesUiScores=()=>FISH.map(f=>({name:f.n,hours:Array.from({length:24},(_,h)=>biteEvalAt(f,POINTS[S.pt],STATIONS[S.st],S.day,h))}));
window.pagesUiHours=()=>{S.day=TODAY_IDX;return [0,8,12,23].map(biteBestTime);};
window.pagesUiCards=()=>FISH.map(f=>{const values=Array.from({length:24},(_,h)=>biteAt(f,POINTS[S.pt],STATIONS[S.st],S.day,h));return {name:f.n,score:values[Math.floor(S.t)],best:values.indexOf(Math.max(...values)),peak:Math.max(...values)};});
'''
def ui_html(source):
    pos=source.rindex('\n})();')
    return source[:pos]+ui_probe+source[pos:]

results=[]
with sync_playwright() as pw:
    browser=pw.chromium.launch()
    for mode in ['missing','success','local','auth','network','no-callback','api-missing','init-failed','preloaded','callback-before-sync','callback-before-microtask','callback-before-task','callback-before-delayed','auth-during-wait','local-race-microtask','local-race-task','api-too-late']:
        page=browser.new_page()
        page.clock.install(time=clock)
        origin='http://localhost:8080' if mode.startswith('local') else 'https://ghdeodbs97-cloud.github.io'
        messages=[];errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.on('console',lambda message:messages.append([arg.json_value() for arg in message.args]) if message.text.startswith('[낚시광 NAVER 로드]') else None)
        if mode.startswith('local'):page.add_init_script("localStorage.setItem('naksigwang-naver-key-id',"+json.dumps(KEY)+")")
        if mode=='preloaded':page.add_init_script('window.naver={maps:{Map:function(){}}};')
        if mode=='init-failed':page.add_init_script('window.__pagesInitFail=true;')
        requests=routes(page,loader_html(mode),origin,mode)
        page.goto(origin+('/index.html' if mode=='local' else '/naksigwang/'),wait_until='domcontentloaded')
        page.wait_for_function('window.naksigwangMapLoadDiagnostic && window.naksigwangMapLoadDiagnostic().status!=="not-started"')
        if mode=='no-callback':
            page.wait_for_function('naksigwangMapLoadDiagnostic().scriptLoaded')
            page.clock.fast_forward(13000)
        if mode=='api-missing':
            page.wait_for_function('naksigwangMapLoadDiagnostic().callbackReceived')
            page.clock.fast_forward(3100)
        if mode=='auth-during-wait':
            page.wait_for_function('naksigwangMapLoadDiagnostic().callbackReceived')
            page.clock.fast_forward(150)
            result=page.evaluate('naksigwangMapLoadDiagnostic()')
            assert result['status']=='auth-failed' and result['providerFailed'] and page.evaluate('__pagesInitCalls')==0
            results.append({'case':mode,'status':result['status'],'redacted':True});page.close();continue
        if mode=='api-too-late':
            page.wait_for_function('naksigwangMapLoadDiagnostic().callbackReceived')
            page.clock.fast_forward(3100)
            assert page.evaluate('naksigwangMapLoadDiagnostic().status')=='api-missing'
            page.clock.fast_forward(500)
            result=page.evaluate('naksigwangMapLoadDiagnostic()')
            assert result['apiReady'] and result['providerFailed'] and result['status']=='api-missing' and page.evaluate('__pagesInitCalls')==0
            results.append({'case':mode,'status':result['status'],'redacted':True});page.close();continue
        if mode.startswith('callback-before-') or mode.startswith('local-race-'):
            page.wait_for_function('naksigwangMapLoadDiagnostic().callbackReceived')
            page.clock.fast_forward(1100)
            page.wait_for_function('["initialized","api-missing","auth-failed"].includes(naksigwangMapLoadDiagnostic().status)')
            result=page.evaluate('naksigwangMapLoadDiagnostic()')
            assert result['status']=='initialized', f'{mode}: callback 뒤 Map 공개 race: {result["status"]}'
            assert result['apiReady'] and result['initStatus']=='ready' and not result['providerFailed'] and page.evaluate('__pagesInitCalls')==1
            assert KEY not in json.dumps(result) and KEY not in json.dumps(messages)
            if mode.startswith('local-race-'):
                assert result['keySource']=='local-storage'
                assert page.evaluate("localStorage.getItem('naksigwang-naver-key-id')")==KEY
            page.close()
            results.append({'case':mode,'status':result['status'],'redacted':True})
            continue
        expected={'missing':'configuration-missing','success':'initialized','local':'initialized','auth':'auth-failed','network':'script-error','no-callback':'timeout','api-missing':'api-missing','init-failed':'init-failed','preloaded':'initialized'}[mode]
        page.wait_for_function('(expected)=>naksigwangMapLoadDiagnostic().status===expected',arg=expected)
        result=page.evaluate('naksigwangMapLoadDiagnostic()')
        assert result['origin']==origin and result['authFailure']==(mode=='auth')
        assert len(requests)==(0 if mode in ['missing','preloaded'] else 1)
        if mode in ['success','local','preloaded']:
            assert result['apiReady'] and result['initStatus']=='ready'
            assert page.evaluate('__pagesInitCalls')==1
            assert page.evaluate('__pagesTabAtInit')=='today' and page.evaluate('__pagesHostAtInit')=='tdMapSlot', '탭 배치 완료 후 SDK 초기화'
        if mode=='local':assert result['keySource']=='local-storage'
        if mode=='success':assert result['keySource']=='meta' and result['callbackReceived'] and result['scriptLoaded']
        if mode=='no-callback':assert result['reason']=='callback-timeout'
        if mode=='api-missing':assert not result['apiReady'] and result['callbackReceived']
        if mode=='api-missing':assert result['reason']=='map-constructor-timeout' and result['apiWaitMs']>=3000
        assert result['apiWaitChecks']<=121, '준비 확인 횟수에도 유한 상한 적용'
        assert KEY not in json.dumps(result) and KEY not in json.dumps(messages), '앱 진단/콘솔에 ID 노출 금지'
        assert 'fixture private details' not in json.dumps(messages), '원본 SDK 예외를 기록하지 않음'
        assert not errors,errors
        results.append({'case':mode,'status':result['status'],'origin':origin,'redacted':True})
        page.close()
    for width,height in [(390,844),(1280,900)]:
        old=browser.new_page(viewport={'width':width,'height':height});old.clock.set_fixed_time(clock)
        routes(old,ui_html(old_html),'http://localhost:8080')
        old.goto('http://localhost:8080/index.html');old.wait_for_function('window.pagesUiReady?.()')
        baseline=old.evaluate('pagesUiScores()');old.close()
        page=browser.new_page(viewport={'width':width,'height':height});page.clock.set_fixed_time(clock)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        routes(page,ui_html(html),'http://localhost:8080')
        page.goto('http://localhost:8080/index.html');page.wait_for_function('window.pagesUiReady?.()')
        assert page.evaluate('pagesUiScores()')==baseline,'39종×24시간 점수/기여/출처 불변'
        assert page.evaluate('pagesUiHours()')==['오늘 베스트: 오전 12시','오늘 베스트: 오전 8시','오늘 베스트: 오후 12시','오늘 베스트: 오후 11시']
        for tab in ['today','map','tide','bite','log']:
            page.locator(f'#tabbar [data-tab="{tab}"]').click();page.wait_for_timeout(250)
            assert page.locator(f'#v-{tab}').is_visible()
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),tab
            page.screenshot(path=str(OUT/f'{width}-{tab}.png'))
        page.locator('#tabbar [data-tab="bite"]').click()
        assert page.locator('#fishGrid .fp b').all_text_contents()==['입질 확률']*39
        assert page.locator('#fishGrid .scoreProgress').count()==39
        cards=page.locator('#fishGrid .fish')
        scores=page.evaluate('pagesUiCards()')
        for value in scores:
            # 이름의 부분 일치(참문어/피문어 등)를 피하고 첫 텍스트로 정확히 선택한다.
            card=next(cards.nth(i) for i in range(cards.count()) if cards.nth(i).locator('.fn').evaluate('el=>el.firstChild.textContent')==value['name'])
            assert card.locator('.scoreValue').inner_text()==f'조건점수 {value["score"]}점'
            assert card.locator('.scoreProgress').get_attribute('aria-valuenow')==str(value['score'])
            assert '최고 ' not in card.locator('.bestH').inner_text() and '점' not in card.locator('.bestH').inner_text()
            assert card.locator('.bestH').get_attribute('title')==f'이 시간 조건점수 {value["peak"]}점'
        cards.first.evaluate('el=>el.scrollIntoView({block:"center"})');cards.first.screenshot(path=str(OUT/f'{width}-card.png'))
        assert not errors,errors
        results.append({'viewport':[width,height],'cards':39,'scoreHoursUnchanged':936,'tabs':5})
        page.close()
    browser.close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False))
print(f'공개/로컬 SDK 로드{sum("case" in r for r in results)}종·진단 비노출·카드 UX/점수 보존 통과')
