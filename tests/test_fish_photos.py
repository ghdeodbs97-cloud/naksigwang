"""사진 경로·실제 디코딩·실패 대체·미설정 모델·기존 점수와 두 화면의 다섯 탭 검사."""
import datetime as dt
import functools
import http.server
import json
from pathlib import Path
import subprocess
import threading
from playwright.sync_api import sync_playwright
from p3_history import before_added

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'test-output/fish'
OUT.mkdir(parents=True, exist_ok=True)
clock = dt.datetime.fromisoformat(json.loads((ROOT / 'data/meta.json').read_text(encoding='utf-8'))['generated'])
current = (ROOT / 'index.html').read_text(encoding='utf-8')
try:
    baseline_ref = before_added('tests/test_fish_photos.py')
except RuntimeError:
    baseline_ref = 'HEAD'  # 처음 커밋하기 전의 로컬 검증
baseline = subprocess.check_output(['git', 'show', baseline_ref+':index.html']).decode('utf-8')
probe = '''
window.fishTestReady = () => CR.ready;
window.fishTestCatalog = () => FISH.map(f => ({n:f.n, image:f.image, status:f.modelStatus, aliasOf:f.aliasOf, season:f.season, reg:f.reg, cur:f.cur}));
window.fishTestScores = () => FISH.slice(0,18).map(f => ({n:f.n, hours:Array.from({length:24}, (_,h) => biteEvalAt(f,POINTS[S.pt],STATIONS[S.st],S.day,h))}));
window.fishTestMissing = () => fishPicture({n:'사진 없음',f:FISH[0].f},'missing');
window.fishTestUnscored = () => FISH.slice(18).every(f => biteEvalAt(f,null,null,0,0).score === null && biteAt(f,null,null,0,0) === null && myF(f,null).f === null);
'''
def inject(html):
    pos = html.rindex('\n})();')
    return html[:pos] + probe + html[pos:]

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
http.server.SimpleHTTPRequestHandler.log_message = lambda *args: None
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/index.html'
results = []
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for width, height in [(390,844), (1280,900)]:
            context = browser.new_context(viewport={'width':width,'height':height})
            old = context.new_page()
            old.clock.set_fixed_time(clock)
            old.route('https://**/*', lambda r:r.abort())
            old.route('**/index.html', lambda r:r.fulfill(content_type='text/html', body=inject(baseline)))
            old.goto(url)
            old.wait_for_function('window.fishTestReady?.()')
            previous = old.evaluate('fishTestScores()')
            previous_today = old.locator('#tdBest .nm').all_text_contents()
            old.close()
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda e:errors.append(str(e)))
            page.clock.set_fixed_time(clock)
            page.route('https://**/*', lambda r:r.abort())
            page.route('**/index.html', lambda r:r.fulfill(content_type='text/html', body=inject(current)))
            page.goto(url)
            page.wait_for_function('window.fishTestReady?.()')
            assert page.evaluate('fishTestScores()') == previous, '기존 18개×24시간 점수·요인·출처 보존'
            assert page.locator('#tdBest .nm').all_text_contents() == previous_today
            catalog = page.evaluate('fishTestCatalog()')
            assert len(catalog) == len({f['n'] for f in catalog}) == 39
            assert sum(f['n']=='볼락' for f in catalog) == 1
            assert page.evaluate('fishTestUnscored()')
            assert all(f.get('status')=='provisional' and f['season'] is None and f['reg'] is None and f['cur'] is None for f in catalog[18:])
            assert next(f for f in catalog if f['n']=='조피볼락')['aliasOf']=='우럭'
            assert {f['image'] for f in catalog} == {str(p.relative_to(ROOT)).replace('\\','/') for p in (ROOT/'static/fish').glob('*.webp')}
            for f in catalog:
                content = (ROOT/f['image']).read_bytes()
                assert content[:4]==b'RIFF' and content[8:12]==b'WEBP', f
            assert page.locator('#fishGrid .fish').count()==39
            assert page.locator('#fishGrid .provisional').count()==21
            assert page.locator('#fishGrid .provisional .spark').count()==0
            assert page.locator('#fishGrid .provisional .fp b').all_text_contents()==['—']*21
            assert page.locator('#logSpecies option').count()==41
            assert page.locator('#basisTable tr').count()==40
            assert 'undefined' not in page.locator('#fishGrid').inner_text()
            assert 'NaN' not in page.locator('#basisTable').inner_text()
            for tab in ['today','map','tide','bite','log']:
                page.locator(f'#tabbar [data-tab="{tab}"]').click()
                page.wait_for_timeout(300)
                assert page.locator(f'#v-{tab}').is_visible()
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'), tab
                if tab in ['today','bite']:
                    selector = '#tdBest' if tab=='today' else '#fishGrid'
                    page.wait_for_function('selector => [...document.querySelectorAll(selector+" img")].every(i=>i.complete && i.naturalWidth>0)',arg=selector)
                    assert page.locator(selector+' img').evaluate_all('(imgs)=>imgs.every(i=>getComputedStyle(i).objectFit==="contain" && i.getBoundingClientRect().width>0 && i.getBoundingClientRect().height>0 && i.getBoundingClientRect().right<=i.closest(".pic").getBoundingClientRect().right+1)')
                page.screenshot(path=str(OUT/f'{width}-{tab}.png'),full_page=True)
                if tab=='bite':
                    page.locator('.provisional').first.scroll_into_view_if_needed()
                    page.screenshot(path=str(OUT/f'{width}-new.png'))
                    page.evaluate('scrollTo(0,0)')
            assert '<svg' in page.evaluate('fishTestMissing()')
            page.route('**/static/fish/*.webp',lambda r:r.abort())
            page.reload()
            page.wait_for_function('window.fishTestReady?.()')
            page.locator('#tabbar [data-tab="bite"]').click()
            failed = page.locator('#fishGrid img[src="static/fish/gamseongdom.webp"]')
            failed.wait_for(state='hidden')
            fallback = failed.locator('..').locator('.fishPhotoFallback')
            assert fallback.is_visible() and fallback.locator('svg').count()==1
            assert page.locator('#fishGrid .fishPhotoFallback:visible').count()==39, '신규 어종의 일반 대체 그림도 표시'
            page.locator('#tabbar [data-tab="today"]').click()
            assert page.locator('#tdBest .fishPhotoFallback:visible').count()==4, '오늘 추천도 같은 실패 대체 경로'
            assert not errors, errors
            results.append({'viewport':[width,height],'existing':18,'provisional':21,'photosLoaded':39,'existingScoreHoursUnchanged':432,'tabs':5,'fallback':'passed'})
            context.close()
        browser.close()
finally:
    server.shutdown()
    server.server_close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False))
print('어종 사진·미설정 모델·기존 점수·다섯 탭 통과')
