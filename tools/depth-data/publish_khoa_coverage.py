"""기존 타일은 그대로 복사하고 신규 KHOA 좌표만 추가하는 검수용 발행기."""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil
import tempfile

from fetch_khoa import KhoaError, SOURCE, SOURCE_URL, point_of


def publish(existing,plan,cache,output,*,allow_partial=False):
    if output.exists():raise KhoaError('새 출력 폴더를 지정하세요')
    missing=[{'id':j['id'],'region':j['region'],'bbox':j['bbox']} for j in plan['jobs'] if not (cache/j['id']/'collection.json').exists()]
    if missing and not allow_partial:raise KhoaError('미완료 bbox가 있습니다. 실패 내역 검수 후 --allow-partial로 성공 영역만 발행하세요')
    manifest=json.loads((existing/'manifest.json').read_text(encoding='utf-8'))
    seen={};original={};tile_rows={};regions={};acquisitions=[]
    for tile in manifest['tiles']:
        path=existing/tile['file'];data=path.read_bytes();original[tile['file']]=hashlib.sha256(data).hexdigest()
        for row in json.loads(data)['points']:
            ds=manifest['datasets'][row[3]]
            if ds['sourceType']!='khoa':continue
            key=(row[0],row[1],ds['verticalDatum'])
            if key in seen:raise KhoaError('기존 production 중복 좌표: 검수 필요')
            seen[key]=row[2]
    before=len(seen);parents={p['id']:p for p in plan['parents']};parent_data={};duplicate=0
    for job in plan['jobs']:
        path=cache/job['id']/'collection.json'
        if not path.exists():continue
        doc=json.loads(path.read_text(encoding='utf-8'))
        if not doc.get('complete') or doc.get('probeOnly') or doc['bbox']!=job['bbox'] or doc['receivedCount']!=doc['totalCount'] or len(doc['points'])!=doc['uniqueCount'] or doc['uniqueCount']+doc['duplicates']!=doc['receivedCount']:
            raise KhoaError('미완료/불일치 수집 결과는 발행하지 않습니다')
        entry={'bbox':doc['bbox'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'fetchedAt':doc['fetchedAt'],
            'receivedCount':doc['receivedCount'],'requestId':job['id'],'parentId':job['parentId']}
        acquisitions.append(entry)
        parent_data.setdefault(job['parentId'],[]).append((job,doc))
    for parent_id,collections in parent_data.items():
        parent=parents[parent_id];dataset=len(manifest['datasets']);new=[];coverage=[];hashes=[]
        for job,doc in collections:
            coverage.append(job['bbox']);hashes.append(next(a['sha256'] for a in acquisitions if a['requestId']==job['id']))
            for q in doc['points']:
                q=point_of({'lat':q['lat'],'lot':q['lon'],'dpwt':q['depth']},job['bbox'])
                key=(q['lon'],q['lat'],'평균해면하')
                if key in seen:
                    if seen[key]!=q['depth']:raise KhoaError('겹친 좌표의 수심 충돌: 기존 값을 덮어쓰지 않음')
                    duplicate+=1;continue
                seen[key]=q['depth'];new.append([q['lon'],q['lat'],q['depth'],dataset,None,False])
        regions[parent['region']]=regions.get(parent['region'],0)+len(new)
        if not new:continue
        dsid='khoa-east-20261011-'+parent_id
        template=next(d for d in manifest['datasets'] if d['sourceType']=='khoa')
        ds={**copy.deepcopy(template),'id':dsid,'datasetId':dsid,'coverageBBox':parent['bbox'],'coverageBoxes':coverage,
            'acquisitionBBoxes':coverage,'acquisitionHashes':hashes,'region':parent['region']}
        manifest['datasets'].append(ds)
        for row in new:tile_rows.setdefault((math.floor(row[0]*10),math.floor(row[1]*10)),[]).append(row)
    output.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staging=Path(tmp)/'release';shutil.copytree(existing,staging)
        for (x,y),rows in sorted(tile_rows.items()):
            rows.sort(key=lambda r:(r[0],r[1]))
            def write(rows,part):
                data=json.dumps({'version':1,'points':rows},ensure_ascii=False,separators=(',',':')).encode()
                if len(rows)>12000 or len(data)>1024*1024:
                    mid=len(rows)//2;write(rows[:mid],part+'a');write(rows[mid:],part+'b');return
                digest=hashlib.sha256(data).hexdigest()[:12];name=f'east/{x}_{y}_{part}_{digest}.json'
                (staging/'east').mkdir(exist_ok=True);(staging/name).write_bytes(data)
                manifest['tiles'].append({'file':name,'bbox':[x/10,y/10,(x+1)/10,(y+1)/10],'count':len(rows),'bytes':len(data)})
            write(rows,'0')
        provenance=manifest.get('provenance',[])
        if not isinstance(provenance,list):provenance=[provenance]
        if tile_rows:
            manifest['provenance']=provenance+[{'sourceType':'khoa','source':SOURCE,'verticalDatum':'평균해면하',
                'operation':'기존 타일 보존 + 신규 동일 좌표 제거','acquisitions':acquisitions,'newRegionPoints':regions,
                'originalPoints':before,'newPoints':len(seen)-before,'totalPoints':len(seen),'duplicatePointsRemoved':duplicate}]
        data=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode() if tile_rows else (existing/'manifest.json').read_bytes()
        if len(data)>1024*1024:raise KhoaError('manifest 크기 초과')
        (staging/'manifest.json').write_bytes(data)
        for name,digest in original.items():
            if hashlib.sha256((staging/name).read_bytes()).hexdigest()!=digest:raise KhoaError('기존 타일 내용 변경')
        shutil.move(str(staging),str(output))
    return {'originalPoints':before,'newPoints':len(seen)-before,'totalPoints':len(seen),'deduplicated':duplicate,
        'completeJobs':len(plan['jobs'])-len(missing),'unpublishedJobs':missing,'partial':bool(missing),
        'newRegionPoints':regions,'tiles':len(manifest['tiles']),'manifestBytes':len(data),
        'productionBytes':sum(p.stat().st_size for p in output.rglob('*') if p.is_file()),'preservedTileHashes':original}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--existing',type=Path,default=Path('static/depth'));p.add_argument('--plan',type=Path,required=True);p.add_argument('--cache',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--report',type=Path,required=True)
    p.add_argument('--allow-partial',action='store_true',help='실패 bbox를 제외하고 성공 영역만 발행 (보고서에 누락을 기록)')
    a=p.parse_args();r=publish(a.existing,json.loads(a.plan.read_text(encoding='utf-8')),a.cache,a.output,allow_partial=a.allow_partial)
    a.report.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(r,ensure_ascii=False))
