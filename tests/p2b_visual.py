"""모바일·PC 다섯 탭 및 실제 지도 위치조회/A→B 입력 화면 기록."""
import datetime as dt
import functools
import http.server
import json
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'test-output/p2b-ui';OUT.mkdir(parents=True,exist_ok=True)
http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
threading.Thread(target=srv.serve_forever,daemon=True).start()
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch()
        for width,height in [(390,844),(1280,900)]:
            page=browser.new_page(viewport={'width':width,'height':height});errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.clock.set_fixed_time(dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated']))
            page.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
            page.wait_for_function("document.querySelector('#tabbar [aria-current=page]') !== null")
            for tab in ['today','map','tide','bite','log']:
                page.locator(f'#tabbar [data-tab="{tab}"]').click();page.wait_for_timeout(350)
                assert page.locator(f'#v-{tab}').is_visible()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
                page.screenshot(path=str(OUT/f'{width}-{tab}.png'))
            page.locator('#tabbar [data-tab="map"]').click()
            page.locator('#coordIn').fill('38.44264,128.45633')
            page.locator('#coordIn').press('Enter');page.wait_for_timeout(500)
            page.locator('#ui').scroll_into_view_if_needed()
            box=page.locator('#ui').bounding_box()
            page.mouse.move(box['x']+box['width']*.5,box['y']+box['height']*.5)
            page.wait_for_timeout(250)
            assert '수심' in page.locator('#depthRead').inner_text()
            assert '조사연도' in page.locator('#depthDetail').text_content()
            # 실제 pointer 입력으로 새 A→B를 긋는다.
            page.locator('#mLine').click();page.locator('#ui').scroll_into_view_if_needed()
            box=page.locator('#ui').bounding_box()
            page.mouse.move(box['x']+box['width']*.3,box['y']+box['height']*.4)
            page.mouse.down();page.mouse.move(box['x']+box['width']*.7,box['y']+box['height']*.6,steps=8);page.mouse.up()
            page.wait_for_timeout(350)
            assert page.locator('#sLen').inner_text() not in ('—','0 m')
            page.locator('#sec').scroll_into_view_if_needed()
            page.screenshot(path=str(OUT/f'{width}-section.png'))
            assert not errors,errors
            page.close();print(width,'다섯 탭·위치조회·A→B 입력 통과')
        browser.close()
finally:srv.shutdown()
