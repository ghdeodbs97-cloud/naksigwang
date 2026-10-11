"""실제 수집 KHOA 점과 기존 앱 수심을 같은 좌표에서 비교한다. 수심 생성/배포 없음."""
import argparse
import json
import math
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tests'))
from depth_probe import PROBE, run
from fetch_khoa import KhoaError, SOURCE


def distance(a, b):
    lat1, lat2 = math.radians(a['lat']), math.radians(b['lat'])
    dlat, dlon = lat2-lat1, math.radians(b['lon']-a['lon'])
    v = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(v)))


def compare(paths, vertical_datum='unknown', datum_note='공식 기준면 원문 미확인', baseline_ref=None):
    datasets=[]
    for path in paths:
        doc=json.loads(path.read_text(encoding='utf-8'))
        if not doc.get('complete') or doc.get('probeOnly') or not doc.get('points'):
            raise KhoaError('완료된 실제 전체 수집 결과가 필요합니다: ' + path.name)
        datasets.append(doc)
    html = subprocess.check_output(['git','show',baseline_ref+':index.html'],cwd=ROOT).decode('utf-8') if baseline_ref else None
    def baseline_routes(page):
        # 기준 버전의 앱을 실행하되 현재 배포 KHOA 타일을 끼워 넣지 않는다.
        page.route('**/static/depth/manifest.json',lambda r:r.fulfill(json={'version':1,'datasets':[],'tiles':[]}))
    baseline=run(html_source=html,routes=baseline_routes)
    targets=[]
    for anchor in baseline:
        if anchor['name'] not in ('주문진','남애','아야진','속초','거진'):
            continue
        location={'lat':anchor['lat'],'lon':anchor['queryLon']}
        eligible=[doc for doc in datasets if doc['bbox'][0]<=location['lon']<=doc['bbox'][2] and doc['bbox'][1]<=location['lat']<=doc['bbox'][3]]
        if not eligible:
            continue
        nearest,doc=min(((p,doc) for doc in eligible for p in doc['points']),key=lambda pair:distance(location,pair[0]))
        targets.append({'name':anchor['name'],'anchor':location,'coordinate':nearest,'sourcePointDistanceM':distance(location,nearest),
                        'source':SOURCE,'datum':vertical_datum,'datumNote':datum_note,'fetchedAt':doc['fetchedAt']})
    # 비교 시 아직 정적 KHOA 타일을 로드하지 않는다. 동일 좌표의 기존 GEBCO/추정을 얻는다.
    script=PROBE+'\nwindow.khoaCompare=()=>{const targets='+json.dumps(targets,ensure_ascii=False)+''';return targets.map(t=>{
      const p=t.coordinate,x=mxOf(p.lon),y=myOf(p.lat);const land=inLand(x,y);
      const r=land?null:(depthQuery(x,y)||modelDepth(x,y,groundToCoast(x,y)));
      if(r?.sourceType==='khoa')throw Error('기존 수심 비교에 KHOA가 섞임');
      return {...t,land,khoaDepth:p.depth,existingDepth:r?.depth??null,difference:r?p.depth-r.depth:null,
        existingSource:r?.sourceType??null,existingDatum:r?.verticalDatum??null,comparisonCoordinateDistanceM:0};
    });};'''
    return run(script,'window.khoaCompare()',html_source=html,routes=baseline_routes)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('collections',nargs='+',type=Path)
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--vertical-datum',default='unknown')
    p.add_argument('--datum-note',default='공식 기준면 원문 미확인')
    p.add_argument('--baseline-ref',help='비교 기준 Git commit/ref. P2C 기준 main은 9143465')
    args=p.parse_args()
    results=compare(args.collections,args.vertical_datum,args.datum_note,args.baseline_ref)
    args.output.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'comparisonCount':len(results),'output':str(args.output)},ensure_ascii=False))
