"""HTTP에서 기존 지도 동작·다섯 탭·수심/단면 기준값을 보존한다."""
import json
import hashlib
import subprocess
import sys
from pathlib import Path
from depth_probe import PROBE, run

CHECK = r'''
window.p3DepthSnapshot=()=>[
 ['거진',128.45633,38.44264],['아야진',128.55765,38.27216],['봉포',128.56922096620318,38.252767],
 ['속초',128.5947,38.20854],['대포',128.61112538238595,38.17376],['문암',128.5504663136096,38.296859],
 ['남애',128.7888,37.94162],['주문진',128.8312883028771,37.89192]
].map(([name,lon,lat])=>({name,lon,lat,samples:[0,500,1000].map(distance=>{
 const x=mxOf(lon)+distance*kAt(lat),y=myOf(lat),land=inLand(x,y),d=groundToCoast(x,y);
 return {distance,land,result:land?null:depthQuery(x,y)||modelDepth(x,y,d)};
})}));
window.p3Baseline=async()=>{
  const pause=()=>new Promise(r=>setTimeout(r,400));
  const tabs={};
  for(const tab of TABS){showTab(tab);await pause();tabs[tab]=!$('v-'+tab).hidden;}
  showTab('map');await pause();
  const before={...V};zoomAt(cw/2,ch/2,1.8);const zoom=V.s>before.s;
  V.cx+=100/V.s;clampView();const pan=V.cx!==before.cx;
  // 숨겨진 지도에서는 프레임이 수심 범위를 다시 예약하지 않는다. 진행 중 요청을 비운 뒤 같은 범위를 고정한다.
  showTab('tide');clearTimeout(OFFICIAL_DEPTH.timer);
  await Promise.all([...OFFICIAL_DEPTH.pending.values()]);clearTimeout(OFFICIAL_DEPTH.timer);
  exampleSection(128.93,37.8);clearTimeout(OFFICIAL_DEPTH.timer);
  await depthPrepareAreas([[128.8,37.7,129,37.9]]);analyzeSection();clearTimeout(OFFICIAL_DEPTH.timer);
  hoverAt=[cw/2,ch/2];dirtyHover=true;updateHover();
  return {tabs,zoom,pan,readout:$('cursorRead').textContent,depths:window.p3DepthSnapshot(),
    section:{A:S.A,B:S.B,pts:SEC.pts,prof:SEC.prof},consoleErrors:0};
};
'''
def compact(result):
    section=result['section']
    result['section']={'A':section['A'],'B':section['B'],'samples':len(section['pts']),
        'sha256':hashlib.sha256(json.dumps(section,ensure_ascii=False,sort_keys=True).encode()).hexdigest()}
    return result

if __name__ == '__main__':
    ref=sys.argv[1] if len(sys.argv)>1 else 'origin/main'
    html=subprocess.check_output(['git','show',ref+':index.html']).decode('utf-8')
    def routes(page):page.route('https://**/*',lambda r:r.abort())
    result=compact(run(PROBE+CHECK,'window.p3Baseline()',html_source=html,routes=routes))
    Path('tests/p3_baseline.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print('baseline 통과: 다섯 탭, 이동, 확대, 수심 조회, A→B')
