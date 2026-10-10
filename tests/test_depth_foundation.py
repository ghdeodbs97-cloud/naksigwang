"""P2B 실제 엔진 회귀. 합성 수심은 메모리/임시 폴더에서만 사용한다."""
import json
from pathlib import Path
from depth_probe import run, PROBE

ASSERTIONS = r'''
window.depthTests = async () => {
  const check = (v, msg) => { if (!v) throw Error(msg); };
  const savedLand = inLand, savedLayers = { ...LAYERS }, savedCache = OFFICIAL_DEPTH.cache;
  const old = { ...V }, savedShore = S.shore, savedRatio = S.ratio, savedMax = S.dmax;
  const x = mxOf(128.6), y = myOf(38.2), k = kAt(38.2);
  try {
    clearLayers(); OFFICIAL_DEPTH.cache = new Map(); inLand = () => false;
    check(depthQuery(x, y) === null, '공식자료 없는 조회는 null');
    addDepthPt('bada', x, y, 150, 150, 'BADA 검사', 2024, { verticalDatum: 'MSL' });
    addDepthPt('chart', x, y, 40, 50, '해도 검사', 2020, { verticalDatum: 'DL' });
    addDepthPt('mof', x, y, 20, 50, '등심선 검사', 2019, { verticalDatum: 'DL', interpolated: true });
    addDepthPt('coastal', x, y, 8, 30, '연안 검사', 2017, { verticalDatum: 'DL' });
    let r = depthQuery(x, y);
    check(r.depth === 8 && r.sourceType === 'coastal_official', '공식 우선순위');
    for (const name of ['depth','sourceType','source','resolution','distanceToSource','interpolated','estimated','confidence','confidenceReason','verticalDatum','surveyYear','measurementCount']) check(name in r, '공통 속성 ' + name);
    check(!r.interpolated && !r.estimated && r.surveyYear === 2017, '원본 속성');
    delete LAYERS.coastal;
    r = depthQuery(x, y); check(r.sourceType === 'mof_contour' && r.interpolated, '등심선 출처');
    delete LAYERS.mof; check(depthQuery(x,y).sourceType === 'chart_public', '해도 fallback');
    delete LAYERS.chart; check(depthQuery(x,y).sourceType === 'bada', 'BADA fallback');
    clearLayers();
    addDepthPt('coastal', x + 10*k, y, 8, 30, '자료집', 2017, { verticalDatum:'DL' });
    addDepthPt('coastal', x - 15*k, y, 80, 30, '자료집', 2017, { verticalDatum:'MSL' });
    r = depthQuery(x,y); check(Math.abs(r.depth - 8) < 1e-8 && r.n === 1 && r.interpolated, '기준면을 섞지 않음');
    // 확대/중심 이동은 해안 차단 여부를 바꾸지 않아야 한다.
    clearLayers();
    addDepthPt('coastal', x + 30*k, y, 8, 30, '자료집', 2017);
    addDepthPt('bada', x - 30*k, y, 50, 150, 'BADA', 2024);
    inLand = (mx,my) => mx > x + 12*k && mx < x + 18*k;
    const values = [];
    for (const scale of [.00001, .1, 10]) {
      V.s = scale; V.cx = x + scale*1e7; V.cy = y;
      check(crossesLand(x,y,x+30*k,y), '화면 밖에서도 육지 차단');
      values.push(depthQuery(x,y));
    }
    check(values.every(q=>q.type==='bada' && q.depth===50), '화면과 무관한 동일 출처/수심');
    inLand = () => false;
    check(classifyShore([x,y],[x+500*k,y]) === null, '모두 바다 단면에 가짜 해안 없음');
    const prof = profileFeatures({cross:[],pts:[{s:0,land:false,r:{depth:8,type:'coastal'}},{s:500,land:false,r:{depth:8,type:'coastal'}}]});
    check(prof.cast.length === 0, '가짜 해안 기준 거리 없음');
    clearLayers();
    importDepthJSON({type:'Feature',geometry:{type:'Point',coordinates:[128.6,38.2]},properties:{depth:8,resolution:30,source:'검사',year:2016,verticalDatum:'DL'}},'coastal');
    saveDepth(); clearLayers(); loadDepth(); r = depthQuery(x,y);
    check(r.surveyYear === 2016 && r.verticalDatum === 'DL', '저장/복원시 연도와 기준면 보존');
    clearLayers();
    check(modelDepth(x,y,500).sourceType === 'model_estimate', '기준면 미확인 혼합 없음');
    check(estimateAt(50).estimated && !estimateAt(50).interpolated, '추정과 보간 분리');
    const originalManifest = OFFICIAL_DEPTH.manifest, originalInit = OFFICIAL_DEPTH.init;
    OFFICIAL_DEPTH.init = null; OFFICIAL_DEPTH.signature = '';
    const changed = await depthPrepareAreas([[128.59,38.19,128.61,38.21]]);
    check(changed && OFFICIAL_DEPTH.cache.size === 1, '지역만 로드');
    r = depthQuery(x,y); check(r && r.depth === 11 && r.surveyYear === 2015 && r.sourceType==='coastal_official', '정적 공식 연결점');
    check(!(await depthPrepareAreas([[128.59,38.19,128.61,38.21]])), '중복 요청 없음');
    await depthPrepareAreas([[126.0,34,126.01,34.01]]);
    check(OFFICIAL_DEPTH.cache.size === 0 && depthQuery(x,y) === null, '다른 지역 이동 시 메모리 해제');
    await depthPrepareAreas([[129,37,129.01,37.01]]);
    check(depthQuery(mxOf(129),myOf(37)) === null && OFFICIAL_DEPTH.error, '타일 실패 fallback');
    await depthPrepareAreas([[124,32,132,39]]);
    check(!OFFICIAL_DEPTH.cache.size, '전국 확대에서 대형 요청 없음');
    OFFICIAL_DEPTH.manifest = originalManifest; OFFICIAL_DEPTH.init = originalInit;
    return { checks: '우선순위·기준면·화면독립·모두바다·저장·provenance·지역로딩·퇴거·실패 fallback 통과' };
  } finally {
    clearLayers(); Object.assign(LAYERS,savedLayers); inLand = savedLand; Object.assign(V,old); OFFICIAL_DEPTH.cache = savedCache;
    S.shore=savedShore; S.ratio=savedRatio; S.dmax=savedMax;
  }
};
'''

def routes(page):
    # 검사 전용 fixture이며 static/에는 쓰지 않는다.
    dataset = {'id': 'test-only', 'sourceType': 'coastal_official', 'source': '검사 전용', 'resolution': 30, 'verticalDatum': 'DL', 'surveyYear': None}
    manifest = {'version': 1, 'datasets': [dataset], 'tiles': [
        {'file': 'east.json', 'bbox': [128.5,38.1,128.7,38.3], 'count': 1, 'bytes': 200},
        {'file': 'fail.json', 'bbox': [129,37,129.1,37.1], 'count': 1, 'bytes': 200},
        {'file': 'jeju.json', 'bbox': [126,33,126.1,33.1], 'count': 1, 'bytes': 200}]}
    page.route('**/static/depth/manifest.json', lambda r: r.fulfill(json=manifest))
    page.route('**/static/depth/east.json', lambda r: r.fulfill(json={'version':1,'points':[[128.6,38.2,11,0,2015,False]]}))
    page.route('**/static/depth/fail.json', lambda r: r.fulfill(status=503, body='unavailable'))
    page.route('**/static/depth/jeju.json', lambda r: (_ for _ in ()).throw(AssertionError('제주 자료 요청 금지')))

if __name__ == '__main__':
    for width,height in [(390,844),(1280,900)]:
        print(width, run(PROBE + ASSERTIONS, 'window.depthTests()', routes=routes, viewport={'width':width,'height':height}))
    def failed_manifest(page):
        page.route('**/static/depth/manifest.json',lambda r:r.fulfill(status=503,body='unavailable'))
    print(run(PROBE+'window.failedDepth=async()=>{await depthManifest();if(OFFICIAL_DEPTH.cache.size||!OFFICIAL_DEPTH.error)throw Error("manifest fallback");return "목록 실패에도 시작 통과";};','window.failedDepth()',routes=failed_manifest))
