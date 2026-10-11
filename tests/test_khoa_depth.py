"""KHOA 앱 연결 mock 회귀. 합성 격자는 메모리 route로만 제공한다."""
from depth_probe import PROBE, run

SOURCE = '국립해양조사원 자연과학용 수심정보'


def routes(page):
    ds={'id':'khoa-test-only','sourceType':'khoa','source':SOURCE,'resolution':150,'verticalDatum':'평균해면하',
        'coverageBBox':[128.79,37.89,128.81,37.91],'estimated':True}
    manifest={'version':1,'datasets':[ds],'tiles':[{'file':'test-only.json','bbox':[128.79,37.89,128.81,37.91],'count':4,'bytes':500}]}
    points=[[lon,lat,10,0,None,False] for lon in (128.799,128.801) for lat in (37.899,37.901)]
    page.route('**/static/depth/manifest.json',lambda r:r.fulfill(json=manifest))
    page.route('**/static/depth/test-only.json',lambda r:r.fulfill(json={'version':1,'points':points}))


CHECKS=r'''
window.khoaTests=async()=>{
  const check=(v,m)=>{if(!v)throw Error(m);};
  await depthManifest();OFFICIAL_DEPTH.signature='';OFFICIAL_DEPTH.cache.clear();clearLayers();
  const land=inLand;inLand=()=>false;
  try{
    await depthPrepareAreas([[128.799,37.899,128.801,37.901]]);
    const x=mxOf(128.8),y=myOf(37.9),r=depthQuery(x,y);
    check(r?.sourceType==='khoa'&&r.depth===10,'KHOA가 fallback보다 우선');
    check(r.source==='국립해양조사원 자연과학용 수심정보'&&r.label===r.source,'기본 출처 표시');
    check(r.verticalDatum==='평균해면하'&&r.confidence==='중간'&&r.estimated&&r.interpolated,'격자/기준면/신뢰도 보존');
    check(r.confidenceReason.includes('원본 측심점'),'실측으로 오인하지 않음');
    const savedSEC=SEC;SEC={prof:{cast:[{m:50,q:{t:'bada',sourceType:'khoa',d:10}}],items:[],note:''}};renderSecInfo();
    check($('secInfo').textContent.includes('KHOA'),'캐스팅 수심 출처 보존');SEC=savedSEC;
    check(depthQuery(mxOf(128.799),myOf(37.899))?.depth===10,'원 격자점 값 유지');
    check(depthQuery(mxOf(128.8015),y)===null,'검색 반경 안이어도 껍질 밖 외삽 금지');
    check(depthQuery(mxOf(128.811),y)===null,'요청 bbox 밖 후보 금지');
    const tiles=[...OFFICIAL_DEPTH.cache.values()],points=tiles.flatMap(t=>[...t.idx.values()].flat());
    const bounds=points[0].coverageBBox;for(const p of points)p.coverageBBox=[128.8001,37.89,128.81,37.91];
    check(depthQuery(x,y)===null,'타일 bbox와 별개인 실제 요청 범위');
    for(const p of points)p.coverageBBox=bounds;
    const old=points[0].verticalDatum;points[0].verticalDatum='DL';points[0].depth=90;
    const isolated=depthQuery(x,y);check(!isolated||isolated.depth===10,'다른 기준면을 IDW에 합치지 않음');
    points[0].verticalDatum=old;points[0].depth=10;
    inLand=(mx,my)=>mx>x+20&&mx<x+40;
    check(depthQuery(x,y)===null,'육지 너머 점 제외 후 외삽 차단');inLand=()=>false;
    for(const scale of [.00001,.1,10]){V.s=scale;V.cx=x+1e7*scale;check(depthQuery(x,y)?.depth===10,'화면 독립');}
    addDepthPt('coastal',x,y,7,30,'연안 검사',2017,{verticalDatum:'DL'});
    check(depthQuery(x,y)?.sourceType==='coastal_official','기존 상위 공식 출처 우선순위 유지');
    clearLayers();await depthPrepareAreas([[126,33,126.01,33.01]]);check(!depthQuery(x,y),'지역 퇴거 fallback');
    return 'KHOA 출처·격자·우선순위·기준면·육지·범위·외삽·화면 독립 통과';
  }finally{inLand=land;}
};
'''

if __name__=='__main__':
    for width,height in [(390,844),(1280,900)]:
        print(width,run(PROBE+CHECKS,'window.khoaTests()',routes=routes,viewport={'width':width,'height':height}))
