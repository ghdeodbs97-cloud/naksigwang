"""여러 지역의 합성 타일만으로 이동/퇴거/중복 요청/범위 차단을 검사한다."""
from depth_probe import PROBE, run
from test_khoa_depth import SOURCE

CENTERS=[(128.8,37.9),(129.4,36.5),(129.45,35.5)]

def routes(page):
    datasets=[];tiles=[]
    for i,(lon,lat) in enumerate(CENTERS):
        bbox=[lon-.01,lat-.01,lon+.01,lat+.01]
        datasets.append({'id':'synthetic-'+str(i),'sourceType':'khoa','source':SOURCE,'resolution':150,
            'verticalDatum':'평균해면하','estimated':True,'coverageBBox':bbox,'coverageBoxes':[bbox]})
        tiles.append({'file':f'synthetic-{i}.json','bbox':bbox,'count':4,'bytes':500})
        points=[[x,y,10+i,i,None,False] for x in (lon-.001,lon+.001) for y in (lat-.001,lat+.001)]
        page.route('**/static/depth/'+tiles[-1]['file'],lambda r,request,points=points:r.fulfill(json={'version':1,'points':points}))
    page.route('**/static/depth/manifest.json',lambda r:r.fulfill(json={'version':1,'datasets':datasets,'tiles':tiles}))

CHECKS=r'''
window.coverageTests=async()=>{
  const check=(v,m)=>{if(!v)throw Error(m);};
  await depthManifest();clearTimeout(OFFICIAL_DEPTH.timer);OFFICIAL_DEPTH.signature='';OFFICIAL_DEPTH.cache.clear();clearLayers();
  const land=inLand;inLand=()=>false;
  const originalFetch=window.fetch,counts={};
  window.fetch=(url,...args)=>{if(String(url).includes('synthetic-'))counts[url]=(counts[url]||0)+1;return originalFetch(url,...args);};
  const areas=[[128.799,37.899,128.801,37.901],[129.399,36.499,129.401,36.501],[129.449,35.499,129.451,35.501]];
  try{
    await Promise.all([depthPrepareAreas([areas[0]]),depthPrepareAreas([areas[0],areas[1]])]);
    check(OFFICIAL_DEPTH.cache.size===2,'진행 중 지역 이동의 최신 범위');
    check(Object.values(counts).every(n=>n===1),'중첩 요청 중복 fetch 방지');
    await depthPrepareAreas([areas[0],areas[1]]);
    check(Object.values(counts).every(n=>n===1),'같은 지역 재호출 없음');
    check(depthQuery(mxOf(128.8),myOf(37.9))?.sourceType==='khoa','첫 지역 KHOA');
    check(depthDetails(depthQuery(mxOf(128.8),myOf(37.9))).includes('가까운 자료점'),'상세 거리');
    await depthPrepareAreas([areas[2]]);
    check(OFFICIAL_DEPTH.cache.size===1&&OFFICIAL_DEPTH.cache.has('synthetic-2.json'),'먼 지역 이동 후 퇴거');
    check(!depthQuery(mxOf(128.8),myOf(37.9)),'퇴거 지역 fallback');
    const x=mxOf(129.45),y=myOf(35.5),q=depthQuery(x,y);
    check(q&&Math.abs(q.depth-12)<1e-9&&q.verticalDatum==='평균해면하','다른 지역 정상');
    const points=[...OFFICIAL_DEPTH.cache.values()].flatMap(t=>[...t.idx.values()].flat());
    const before=points[0].coverageBoxes;
    for(const p of points)p.coverageBoxes=[[129.44,35.49,129.4495,35.51],[129.4505,35.49,129.46,35.51]];
    check(!depthQuery(x,y),'부모 bbox 안의 미수집 구멍은 차단');
    for(const p of points)p.coverageBoxes=before;
    check(!depthQuery(mxOf(129.4515),y),'유효 점 볼록껍질 밖 차단');
    inLand=(mx,my)=>mx>x+20&&mx<x+40;
    check(!depthQuery(x,y),'육지 반대편 후보 제외');inLand=()=>false;
    await depthPrepareAreas([[126,33,126.01,33.01]]);
    check(OFFICIAL_DEPTH.cache.size===0&&OFFICIAL_DEPTH.pending.size===0,'KHOA 없는 지역은 메모리 퇴거');
    check(modelDepth(mxOf(126),myOf(33),30).estimated,'기존 모델 fallback');
    check(modelDepth(x,y,2000)?.depth!=null,'기존 GEBCO/model fallback');
    const limit=OFFICIAL_DEPTH.maxTiles;OFFICIAL_DEPTH.maxTiles=2;
    await depthPrepareAreas(areas);
    check(OFFICIAL_DEPTH.cache.size===0&&OFFICIAL_DEPTH.error.includes('확대'),'동시 로딩 예산 제한');
    OFFICIAL_DEPTH.maxTiles=limit;
    return {result:'다중 지역·lazy loading·퇴거·동시 중복 요청·수집 구멍·육지·외삽·fallback·로딩 예산 통과',requests:counts};
  }finally{inLand=land;window.fetch=originalFetch;}
};
'''

if __name__=='__main__':
    for width,height in [(390,844),(1280,900)]:
        print(width,run(PROBE+CHECKS,'window.coverageTests()',routes=routes,viewport={'width':width,'height':height}))
