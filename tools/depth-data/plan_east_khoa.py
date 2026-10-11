"""저장소 실제 낚시 좌표로 작은 연안 bbox를 계획한다. API 호출 없음."""
import argparse
import hashlib
import json
import math
from pathlib import Path

GROUPS = [
 ('거진·대진',[('대진항','화진포해수욕장'),('거진항','반암해수욕장')]),
 ('아야진·봉포',[('아야진항','봉포해변')]),
 ('속초·대포',[('속초항','속초해수욕장'),('대포항','외옹치해변')]),
 ('양양·낙산',[('수산항','낙산해수욕장')]),
 ('남애',[('남애항','남애항 남측 갯바위')]),
 ('주문진',[('주문진항','주문진해수욕장')]),
 ('강릉·안목·사천',[('강릉항','안목해수욕장'),('사천진항','사천해변')]),
 ('정동진',[('안인항','정동진해변')]),
 ('묵호·동해',[('동해항','한섬해수욕장'),('어달리항 남측 갯바위','어달해수욕장')]),
 ('삼척',[('삼척항','삼척해수욕장')]),
 ('울진·후포',[('죽변항','봉평해수욕장'),('후포항 동쪽 갓바위','후포해수욕장')]),
 ('영덕',[('축산항','고래불해수욕장'),('강구항','오포3리해수욕장')]),
 ('포항',[('포항구항','영일대 해수욕장'),('대보항','석병방파제 갯바위'),('구룡포항','구룡포해변')]),
 ('경주 감포',[('감포항','오류고아라해변')]),
 ('울산 동해안',[('정자항','주전몽돌해변'),('방어진항','일산해수욕장 (Ilsan beach)')]),
]


def bbox_id(bbox):
    return hashlib.sha256(json.dumps(bbox,separators=(',',':')).encode()).hexdigest()[:16]


def subtract(box, cut):
    w,s,e,n=box;a,b,c,d=cut
    x0,y0,x1,y1=max(w,a),max(s,b),min(e,c),min(n,d)
    if x0>=x1 or y0>=y1:return [box]
    return [r for r in ([w,s,x0,n],[x1,s,e,n],[x0,s,x1,y0],[x0,y1,x1,n]) if r[0]<r[2] and r[1]<r[3]]


def area_km2(b):
    return (b[2]-b[0])*111.32*math.cos(math.radians((b[1]+b[3])/2))*(b[3]-b[1])*111.32


def plan(inventory, manifest):
    existing=[{'id':d['id'],'bbox':b} for d in manifest['datasets'] if d['sourceType']=='khoa' for b in d.get('coverageBoxes',[d['coverageBBox']])]
    covered=[d['bbox'] for d in existing]
    parents=[];jobs=[];representatives=[]
    def pick(name):
        for group in ('ports','points','osm'):
            values=[p for p in inventory[group] if p['name']==name and p['lon']<130 and p['lat']>=35.3]
            if name=='대진항':values=[p for p in values if p['lat']>38]
            if values:
                p=values[0];return {'name':name,'lat':p['lat'],'lon':p['lon'],'origin':group}
        raise ValueError('저장소 좌표 없음: '+name)
    for region,pairs in GROUPS:
        for pair in pairs:
            anchors=[pick(name) for name in pair]
            parent_id='east-'+str(len(parents)+1).zfill(2)
            box=[round(min(p['lon'] for p in anchors)-.012,5),round(min(p['lat'] for p in anchors)-.018,5),
                 round(max(p['lon'] for p in anchors)+.060,5),round(max(p['lat'] for p in anchors)+.018,5)]
            fragments=[box]
            overlaps=[]
            for old in existing:
                if len(subtract(box,old['bbox']))!=1 or subtract(box,old['bbox'])!=[box]:overlaps.append(old['id'])
            for cut in covered:fragments=[r for b in fragments for r in subtract(b,cut)]
            fragments=[[round(v,5) for v in b] for b in fragments if area_km2(b)>.0001]
            parent={'id':parent_id,'region':region,'bbox':box,'anchors':anchors,'existingOverlaps':overlaps,'requestIds':[]}
            for box2 in fragments:
                job={'id':bbox_id(box2),'parentId':parent_id,'region':region,'bbox':box2,'areaKm2':area_km2(box2),
                     'maxGridPoints':math.ceil(area_km2(box2)/.0225)}
                job['maxPages']=math.ceil(job['maxGridPoints']/300)
                jobs.append(job);parent['requestIds'].append(job['id'])
            covered.append(box);parents.append(parent)
            for i,p in enumerate(anchors):representatives.append({**p,'region':region,'parentId':parent_id,'kind':'항구·방파제 근처' if i==0 else '해변·갯바위 근처'})
    return {'version':1,'baseMain':'f8533cb','existing':existing,'parents':parents,'jobs':jobs,'representatives':representatives,
            'policy':'실제 낚시 좌표 주변 서쪽 0.012도·동쪽 0.060도·남북 0.018도 여유. 기존/앞선 bbox를 차감. 원 좌표 정밀도/수심 유지.',
            'maxRequestsThisRun':1000,'dailyQuotaNote':'공식 기본 개발 한도 10,000회 중 이 작업 상한 1,000회. 다른 사용량은 알 수 없음.'}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('inventory',type=Path);p.add_argument('--manifest',type=Path,default=Path('static/depth/manifest.json'));p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();result=plan(json.loads(a.inventory.read_text(encoding='utf-8')),json.loads(a.manifest.read_text(encoding='utf-8')))
    a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'parents':len(result['parents']),'requests':len(result['jobs']),'maxPoints':sum(j['maxGridPoints'] for j in result['jobs']),'maxPages':sum(j['maxPages'] for j in result['jobs'])},ensure_ascii=False))
