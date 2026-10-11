"""실제 정적 타일의 대표점/동일 좌표 fallback 비교 및 브라우저 로딩 측정. API 호출 없음."""
import datetime as dt
import functools
import http.server
import json
from pathlib import Path
import subprocess
import sys
import threading
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests'))
from depth_probe import PROBE
from compare_khoa import distance

SCRIPT=r'''
window.auditState=()=>({tiles:[...OFFICIAL_DEPTH.cache.keys()],points:[...OFFICIAL_DEPTH.cache.values()].reduce((n,t)=>n+[...t.idx.values()].reduce((n,a)=>n+a.length,0),0),error:OFFICIAL_DEPTH.error});
window.auditEnter=async p=>{
  clearTimeout(OFFICIAL_DEPTH.timer);
  await depthPrepareAreas([[p.lon-.015,p.lat-.01,p.lon+.015,p.lat+.01]]);
  return window.auditState();
};
window.auditRepresentatives=async reps=>{
  const results=[];
  for(const p of reps){
    const k=kAt(p.lat),originalX=mxOf(p.lon),y=myOf(p.lat);
    let offset=0;while(offset<=2000&&inLand(originalX+offset*k,y))offset+=50;
    if(offset>2000){results.push({...p,error:'동쪽 2km 이내 바다 좌표 없음'});continue;}
    const samples=[];
    for(const extra of [0,500]){
      const x=originalX+(offset+extra)*k,lon=lonOf(x),lat=latOf(y);
      await window.auditEnter({lon,lat});
      const land=inLand(x,y),fallback=land?null:modelDepth(x,y,groundToCoast(x,y));
      const official=land?null:depthQuery(x,y),selected=official||fallback;
      const candidates=officialDepthCandidates('bada',x,y).filter(p=>p.sourceType==='khoa');
      const blocked=candidates.filter(p=>p.d>2*k&&crossesLand(x,y,p.mx,p.my));
      samples.push({lon,lat,eastOffsetM:offset+extra,land,loadedTiles:window.auditState().tiles,
        nearbyKhoaCount:candidates.length,blockedCandidates:blocked.length,khoaDepth:official?.sourceType==='khoa'?official.depth:null,
        fallbackDepth:fallback?.depth??null,difference:official?.sourceType==='khoa'?official.depth-fallback.depth:null,
        fallbackSource:fallback?.sourceType??null,fallbackDatum:fallback?.verticalDatum??null,
        selectedDepth:selected?.depth??null,source:selected?.source??null,sourceType:selected?.sourceType??null,
        confidence:selected?.confidence??null,datum:selected?.verticalDatum??null,nearestUsedSourceDistanceM:official?.distanceToSource??null,
        contributingSources:official?.contributingSources??[],detail:selected?depthDetails(selected):null});
    }
    results.push({...p,samples});
  }
  return results;
};
window.auditGridComparison=points=>points.map(p=>{
  const x=mxOf(p.lon),y=myOf(p.lat),land=inLand(x,y),r=land?null:modelDepth(x,y,groundToCoast(x,y));
  return {lon:p.lon,lat:p.lat,khoaDepth:p.depth,land,fallbackDepth:r?.depth??null,difference:r?p.depth-r.depth:null,
    source:'국립해양조사원 자연과학용 수심정보',datum:'평균해면하',fallbackSource:r?.sourceType??null,fallbackDatum:r?.verticalDatum??null,
    comparisonCoordinateDistanceM:0};
});
'''

def audit(plan,baseline_ref='f8533cb'):
    current=(ROOT/'static/depth/manifest.json').read_bytes()
    manifest=json.loads(current)
    baseline=subprocess.check_output(['git','show',baseline_ref+':static/depth/manifest.json'],cwd=ROOT)
    old_html=subprocess.check_output(['git','show',baseline_ref+':index.html'],cwd=ROOT).decode()
    original_html=(ROOT/'index.html').read_text(encoding='utf-8')
    html_bytes={'baseline':len(old_html.encode()),'expanded':len(original_html.encode())}
    pos=old_html.rindex('\n})();');old_html=old_html[:pos]+'\n'+PROBE+SCRIPT+old_html[pos:]
    html=original_html;pos=html.rindex('\n})();')
    html=html[:pos]+'\n'+PROBE+SCRIPT+html[pos:]
    all_points=[{'lon':r[0],'lat':r[1],'depth':r[2]} for tile in manifest['tiles'] for r in json.loads((ROOT/'static/depth'/tile['file']).read_bytes())['points']]
    http.server.SimpleHTTPRequestHandler.log_message=lambda *a:None
    srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    metrics=[];comparisons=None
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch()
            for width,height in [(390,844),(1280,900)]:
                for version in ('baseline','expanded'):
                    page=browser.new_page(viewport={'width':width,'height':height});requests=[];resources=[];errors=[]
                    page.on('pageerror',lambda e:errors.append(str(e)))
                    page.on('request',lambda r:requests.append(r.url.split('/static/depth/')[-1]) if '/static/depth/' in r.url else None)
                    page.on('request',lambda r:resources.append(unquote(urlsplit(r.url).path).lstrip('/')) if urlsplit(r.url).hostname=='127.0.0.1' else None)
                    page.clock.set_fixed_time(dt.datetime.fromisoformat(json.loads((ROOT/'data/meta.json').read_text(encoding='utf-8'))['generated']))
                    body=old_html if version=='baseline' else html
                    page.route('**/index.html',lambda r:r.fulfill(content_type='text/html',body=body))
                    if version=='baseline':page.route('**/static/depth/manifest.json',lambda r:r.fulfill(content_type='application/json',body=baseline))
                    page.goto(f'http://127.0.0.1:{srv.server_port}/index.html')
                    page.wait_for_function('document.querySelector("#tabbar [aria-current=page]")!==null')
                    page.wait_for_timeout(1500)
                    cdp=page.context.new_cdp_session(page)
                    def heap():
                        cdp.send('HeapProfiler.collectGarbage');return cdp.send('Runtime.getHeapUsage')['usedSize']
                    initial=list(requests);initial_heap=heap()
                    m={'viewport':[width,height],'version':version,'initialDepthRequests':initial,
                       'initialDepthBytes':sum(len(baseline if version=='baseline' else current) if f=='manifest.json' else (ROOT/'static/depth'/f).stat().st_size for f in initial),
                       'initialHTMLBytes':html_bytes[version],'initialJSHeapBytes':initial_heap}
                    m['initialResources']=list(resources)
                    m['initialResourceBytes']=sum(html_bytes[version] if f=='index.html' else len(baseline if version=='baseline' else current) if f=='static/depth/manifest.json' else (ROOT/f).stat().st_size for f in resources if f=='index.html' or (ROOT/f).is_file())
                    if version=='expanded':
                        page.wait_for_function('window.depthProbeReady?.()')
                        clear=page.evaluate('window.auditEnter({lon:126,lat:33})');assert clear['points']==0,clear
                        rows=page.evaluate('window.auditRepresentatives',plan['representatives'])
                        if comparisons is None:
                            for row in rows:
                                for sample in row.get('samples',[]):
                                    nearest=min(all_points,key=lambda p:distance(sample,p))
                                    sample['nearestGridPoint']=nearest
                                    sample['nearestKhoaDistanceM']=distance(sample,nearest)
                                    sample['nearestGridComparison']=page.evaluate('window.auditGridComparison',[nearest])[0]
                            comparisons=rows
                        region_metrics=[];seen=set()
                        for rep in plan['representatives']:
                            if rep['region'] in seen:continue
                            seen.add(rep['region']);before=len(requests)
                            state=page.evaluate('window.auditEnter',rep)
                            after=len(requests);again=page.evaluate('window.auditEnter',rep)
                            assert len(requests)==after,'동일 영역 중복 요청'
                            assert len(state['tiles'])<=12 and state['points']<=60000,state
                            region_metrics.append({'region':rep['region'],'tiles':len(state['tiles']),'points':state['points'],
                                'residentJSONBytes':sum((ROOT/'static/depth'/f).stat().st_size for f in state['tiles']),
                                'newRequests':after-before,'repeatRequests':len(requests)-after,'jsHeapBytes':heap()})
                        final=page.evaluate('window.auditEnter({lon:126,lat:33})');assert not final['tiles'],final
                        m.update({'regions':region_metrics,'afterEvictionJSHeapBytes':heap(),'evictedTiles':final['tiles'],
                            'maxRegionHeapGrowthBytes':max(r['jsHeapBytes'] for r in region_metrics)-initial_heap})
                        # Chromium JS heap 측정이다. 실제 휴대폰 프로세스 전체 메모리와 구분한다.
                        assert m['maxRegionHeapGrowthBytes']<24*1024*1024,m
                    assert not errors,errors
                    metrics.append(m);page.close()
            browser.close()
    finally:srv.shutdown()
    return {'baseMain':baseline_ref,'method':'Chromium 로컬 HTTP, 무압축 JSON bytes, GC 후 JS heap. 실기기 RSS/네트워크 압축 크기 아님.',
        'representatives':comparisons,'performance':metrics}

if __name__=='__main__':
    result=audit(json.loads((ROOT/'tests/p2c2_plan.json').read_text(encoding='utf-8')))
    (ROOT/'tests/p2c2_validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'representatives':len(result['representatives']),'measurements':len(result['performance'])}))
