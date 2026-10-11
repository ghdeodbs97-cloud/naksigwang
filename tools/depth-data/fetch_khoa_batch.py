"""작은 bbox 묶음을 페이지 캐시로 재개한다. 성공 영역 보존, 실 API는 명시적 CLI에서만."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import sys

from fetch_khoa import Client, KhoaError, ENDPOINT, SOURCE, SOURCE_URL, validate_bbox, integer
from plan_east_khoa import bbox_id


def write_json(path, value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    temp.replace(path)


class CachedClient(Client):
    def __init__(self,folder,*,budget=None,**kwargs):
        super().__init__(**kwargs)
        self.folder=folder;self.folder.mkdir(parents=True,exist_ok=True)
        self.budget=budget if budget is not None else {'used':0,'limit':1000}
        self.cached_pages=0
        self.expected_total=None;self.expected_pages=None
        state=folder/'state.json'
        self.state=json.loads(state.read_text(encoding='utf-8')) if state.exists() else {'callsTotal':0}
        # 명시적인 NODATA_ERROR도 원본에서 재사용한다. 매 재개 때 같은 bbox를 재호출하지 않는다.
        self.no_data=None
        for path in sorted((folder/'attempts').glob('*.json')):
            response=json.loads(path.read_text(encoding='utf-8'))
            try:
                root=json.loads(response['text']);root=root.get('response',root)
                if str(root['header']['resultCode'])=='03':self.no_data=response['pageNo']
            except (ValueError,KeyError,TypeError):pass

    def page(self,bbox,page_no,rows):
        if self.no_data==page_no:raise KhoaError('API resultCode=03 resultMsg=NODATA_ERROR (보존한 응답 재사용)')
        signature={'endpoint':ENDPOINT,'bbox':bbox,'pageNo':page_no,'numOfRows':rows,'version':1}
        cache=self.folder/'pages'/f'{page_no:06d}.json'
        if cache.exists():
            doc=json.loads(cache.read_text(encoding='utf-8'))
            text=doc['text']
            if doc['request']!=signature or hashlib.sha256(text.encode()).hexdigest()!=doc['sha256']:
                raise KhoaError('페이지 캐시 요청/hash 불일치: 자동 재호출하지 않고 검수 필요')
            root=json.loads(text);root=root.get('response',root)
            if str(root['header']['resultCode'])!='00':raise KhoaError('정상 응답이 아닌 페이지 캐시')
            if not getattr(self,'validating',False):self.cached_pages+=1
            return root['body']
        if self.budget['used']+self.retries+1>self.budget['limit']:
            raise KhoaError('이번 실행 호출 상한 도달; 캐시를 보존하고 중단')
        before=self.calls;response_start=len(self.responses)
        try:
            body=super().page(bbox,page_no,rows)
            text=self.responses[-1]['text']
            write_json(cache,{'request':signature,'text':text,'sha256':hashlib.sha256(text.encode()).hexdigest()})
            return body
        finally:
            count=self.calls-before;self.budget['used']+=count
            old=self.state['callsTotal'];self.state['callsTotal']+=count
            for i,response in enumerate(self.responses[response_start:],1):
                write_json(self.folder/'attempts'/f'{old+i:06d}.json',response)
            write_json(self.folder/'state.json',self.state)

    def collect(self,bbox,rows=300):
        # 값 검증에서 중단돼도 해당 bbox의 원본 페이지는 모두 확보한다. 음수는 발행하지 않는다.
        first=self.page(bbox,1,rows)
        self.expected_total=integer(first.get('totalCount'),'totalCount')
        self.expected_pages=max(1,(self.expected_total+rows-1)//rows)
        if self.expected_pages>100000:raise KhoaError('과도한 페이지 수로 수집 중단')
        for page in range(2,self.expected_pages+1):self.page(bbox,page,rows)
        self.validating=True
        try:return super().collect(bbox,rows)
        finally:self.validating=False


def collect_jobs(plan,cache_root,*,session=None,retries=3):
    budget={'used':0,'limit':plan.get('maxRequestsThisRun',1000)}
    results=[]
    for job in plan['jobs']:
        bbox=validate_bbox(job['bbox']);identity=bbox_id(bbox)
        if identity!=job['id']:raise KhoaError('계획 bbox ID 불일치')
        client=CachedClient(cache_root/identity,budget=budget,session=session,retries=retries,backoff=1)
        try:
            doc=client.collect(bbox,rows=300)
            path=cache_root/identity/'collection.json'
            if not path.exists():
                write_json(path,{**doc,'source':SOURCE,'sourceURL':SOURCE_URL,'endpoint':ENDPOINT,
                    'fetchedAt':dt.datetime.now(dt.timezone.utc).isoformat()})
            else:
                old=json.loads(path.read_text(encoding='utf-8'))
                if old.get('points')!=doc['points'] or old.get('bbox')!=bbox or old.get('complete') is not True:
                    raise KhoaError('전체 수집 캐시 불일치: 기존 원본을 덮어쓰지 않음')
            result={k:v for k,v in doc.items() if k!='points'}
            result.update({'id':identity,'region':job['region'],'parentId':job['parentId'],
                'callsThisRun':client.calls,'callsTotal':client.state['callsTotal'],'cachedPages':client.cached_pages,
                'retriesTotal':client.state['callsTotal']-doc['pages'],'collectionSHA256':hashlib.sha256(path.read_bytes()).hexdigest()})
        except KhoaError as error:
            result={'id':identity,'region':job['region'],'bbox':bbox,'complete':False,'error':client.redact(str(error)),
                'callsThisRun':client.calls,'callsTotal':client.state['callsTotal'],'cachedPages':client.cached_pages,
                'totalCount':client.expected_total,'expectedPages':client.expected_pages,
                'preservedPages':len(list((client.folder/'pages').glob('*.json')))}
        results.append(result)
        summary={'results':results,'callsThisRun':budget['used'],'callsTotal':sum(r['callsTotal'] for r in results),
            'completeRegions':sum(r['complete'] for r in results),'failedRegions':sum(not r['complete'] for r in results),
            'pendingJobs':len(plan['jobs'])-len(results)}
        write_json(cache_root/'batch.json',summary)
        print(json.dumps(result,ensure_ascii=False),flush=True)
        if budget['used']+retries+1>budget['limit']:break
    return summary


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('plan',type=Path);p.add_argument('--cache',type=Path,required=True)
    a=p.parse_args()
    try:
        result=collect_jobs(json.loads(a.plan.read_text(encoding='utf-8')),a.cache)
    except KhoaError as e:
        print(str(e),file=sys.stderr);raise SystemExit(1)
    except Exception:
        print('묶음 수집 처리 오류. 상세 예외/URL은 인증정보 보호를 위해 출력하지 않습니다.',file=sys.stderr);raise SystemExit(1)
    print(json.dumps({k:v for k,v in result.items() if k!='results'},ensure_ascii=False))
    raise SystemExit(1 if result['failedRegions'] or result['pendingJobs'] else 0)
