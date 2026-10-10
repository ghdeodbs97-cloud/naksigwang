"""P0 브라우저 회귀: 보존 상태, 빈 자료, 조석 날짜 누락과 다섯 탭을 확인한다."""
import copy
import datetime as dt
import functools
import http.server
import json
import os
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = {n: json.loads((ROOT / 'data' / (n + '.json')).read_text(encoding='utf-8')) for n in ['tide', 'obs', 'wx', 'meta']}
CLOCK = dt.datetime.fromisoformat(FIXTURE['meta']['generated'])
http.server.SimpleHTTPRequestHandler.log_message = lambda *args: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT)))
threading.Thread(target=srv.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        cases = ['normal', 'all', 'obs', 'wx', 'meta', 'empty_obs', 'empty_wx', 'merged', 'kept', 'incomplete', 'old_meta', 'old_base', 'partial_station', 'one_day', 'yesterday', 'tide']
        for width, height in [(390, 844), (1280, 900)]:
            for case in cases:
                if width == 1280 and case not in ['normal', 'all', 'kept']:
                    continue
                data = copy.deepcopy(FIXTURE)
                if case == 'empty_obs':
                    data['obs'] = {}
                if case == 'empty_wx':
                    data['wx']['cells'] = {}
                if case in ['merged', 'kept', 'incomplete']:
                    status = {'merged': 'merged_fallback', 'kept': 'kept_previous_low_fresh_ratio', 'incomplete': 'kept_previous_incomplete'}[case]
                    data['meta']['wx.json'] = {'status': status}
                if case == 'old_meta':
                    data['meta']['generated'] = (CLOCK - dt.timedelta(days=3)).isoformat()
                if case == 'old_base':
                    data['wx']['bases'] = {key: (CLOCK - dt.timedelta(days=2)).strftime('%Y%m%d%H%M') for key in data['wx']['cells']}
                if case == 'partial_station':
                    # 한 지점의 날짜 하나만 빠진 경우 정상 지점으로 계속 시작한다.
                    del next(iter(data['tide']['st'].values()))['days'][next(iter(data['tide']['lunar']))]
                if case in ['one_day', 'yesterday']:
                    day = (CLOCK - dt.timedelta(days=1 if case == 'yesterday' else 0)).strftime('%Y-%m-%d')
                    data['tide']['from'] = day
                    data['tide']['lunar'] = {day: [8, 24, 0]}
                    for station in data['tide']['st'].values():
                        station['days'] = {day: [['06:00', 100, 'H'], ['12:00', 0, 'L']]}
                page = browser.new_page(viewport={'width': width, 'height': height})
                page.clock.set_fixed_time(CLOCK)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                for name, doc in data.items():
                    def respond(route, request, name=name, doc=doc):
                        if case == name or (case == 'all' and name != 'tide'):
                            route.fulfill(status=503, body='unavailable')
                        else:
                            route.fulfill(content_type='application/json', body=json.dumps(doc))
                    page.route(f'**/data/{name}.json?*', respond)
                page.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
                if case in ['tide', 'yesterday']:
                    page.wait_for_function("document.body.textContent.includes('앱을 시작할 수 없습니다')")
                    page.wait_for_timeout(100)
                    assert errors and all('tide.json unavailable' in e for e in errors), errors
                    page.close()
                    print(f'{width}×{height} {case}: 명확한 필수 자료 안내 통과')
                    continue
                page.wait_for_function("document.querySelector('#tabbar [aria-current=page]') !== null")
                for tab in ['today', 'map', 'tide', 'bite', 'log']:
                    page.locator(f'#tabbar [data-tab="{tab}"]').click()
                    page.wait_for_timeout(150)
                    assert page.locator(f'#v-{tab}').is_visible(), tab
                    if os.environ.get('P0_SCREENSHOTS') and case in ['normal', 'all', 'kept']:
                        out = Path(os.environ['P0_SCREENSHOTS'])
                        out.mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(out / f'{width}-{case}-{tab}.png'))
                assert not errors, (case, errors)
                notices = ' '.join(page.locator('body > p').all_text_contents())
                text = page.locator('#dataTime').inner_text()
                if case in ['all', 'meta']:
                    assert text == '확인 불가', text
                if case in ['obs', 'empty_obs', 'all']:
                    assert '수온·관측' in notices
                    assert '최근 관측 없음' in page.locator('#wxSst').inner_text()
                if case in ['wx', 'empty_wx', 'all']:
                    assert '기상' in notices
                    assert '자료 없음' in page.locator('#wxWave').inner_text()
                if case == 'merged':
                    assert '일부 이전 자료 사용' in text
                if case in ['kept', 'incomplete', 'old_meta']:
                    assert '이전 자료 사용 중' in text and '수집 실행' in text
                if case == 'old_base':
                    assert '이전 발표' in page.locator('#wxSlot').inner_text()
                    assert '이전 자료 사용' in notices
                if case == 'partial_station':
                    assert '조석 지점' in notices
                print(f'{width}×{height} {case}: 다섯 탭 통과')
                page.close()
        browser.close()
finally:
    srv.shutdown()
    srv.server_close()
print('P0 브라우저 회귀: 통과')
