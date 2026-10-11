"""연안 묶음 수집/발행 회귀. 합성 응답만 사용한다."""
import contextlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from test_khoa_fetch import BBOX, MOCK_KEY, Session, Response, envelope, item
from fetch_khoa import KhoaError
from fetch_khoa_batch import collect_jobs, write_json
from plan_east_khoa import bbox_id
import plan_east_khoa
from publish_khoa_coverage import publish


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'KHOA_SERVICE_KEY':MOCK_KEY});self.env.start();self.addCleanup(self.env.stop)
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.job={'id':bbox_id(BBOX),'bbox':BBOX,'region':'시험 연안','parentId':'east-01'}
        self.plan={'jobs':[self.job],'parents':[{'id':'east-01','region':'시험 연안','bbox':BBOX}]}
    def collect(self,reply,plan=None):
        session=Session(reply)
        with contextlib.redirect_stdout(io.StringIO()) as log:
            result=collect_jobs(plan or self.plan,self.root/'cache',session=session,retries=0)
        self.assertNotIn(MOCK_KEY,log.getvalue())
        return result,session
    def reply(self,p):
        start=(p['pageNo']-1)*300
        return Response(envelope([item(i) for i in range(start,min(start+300,301))],301,p['pageNo']))
    def test_page_cache_resume_after_partial_failure(self):
        first,_=self.collect(lambda p:self.reply(p) if p['pageNo']==1 else Response(envelope([],0,code='30',message=MOCK_KEY)))
        self.assertEqual(first['failedRegions'],1)
        second,session=self.collect(self.reply)
        self.assertEqual([c['params']['pageNo'] for c in session.calls],[2])
        self.assertEqual((second['callsThisRun'],second['callsTotal'],second['results'][0]['cachedPages']),(1,3,1))
        self.assertEqual(second['results'][0]['uniqueCount'],301)
    def test_complete_cache_no_calls_or_hash_changes(self):
        first,_=self.collect(self.reply)
        second,session=self.collect(lambda p:self.fail('완료 캐시는 호출하지 않아야 함'))
        self.assertEqual(session.calls,[])
        self.assertEqual(second['callsThisRun'],0)
        self.assertEqual(first['results'][0]['collectionSHA256'],second['results'][0]['collectionSHA256'])
    def test_cache_corruption_rejected_without_request(self):
        self.collect(self.reply)
        page=self.root/'cache'/self.job['id']/'pages/000001.json'
        doc=json.loads(page.read_text());doc['sha256']='bad';write_json(page,doc)
        result,session=self.collect(lambda p:self.fail('손상 캐시를 조용히 재호출하면 안 됨'))
        self.assertEqual((result['failedRegions'],len(session.calls)),(1,0))
    def test_budget_pending_is_reported(self):
        second={**self.job,'bbox':[128.8,37.8,128.9,38.0]};second['id']=bbox_id(second['bbox'])
        result,_=self.collect(lambda p:Response(envelope([],0)),{**self.plan,'jobs':[self.job,second],'maxRequestsThisRun':1})
        self.assertEqual((result['callsThisRun'],result['pendingJobs']),(1,1))
    def test_failure_does_not_destroy_other_regions(self):
        second={**self.job,'bbox':[128.8,37.8,128.9,38.0]};second['id']=bbox_id(second['bbox'])
        result,_=self.collect(lambda p:Response(envelope([],0,code='30')) if p['xmin']==128.7 else Response(envelope([],0)),{**self.plan,'jobs':[self.job,second]})
        self.assertEqual((result['completeRegions'],result['failedRegions']),(1,1))
        self.assertTrue((self.root/'cache'/second['id']/'collection.json').exists())
    def test_no_data_error_is_cached_without_synthetic_zero(self):
        self.collect(lambda p:Response(envelope([],0,code='03',message='NODATA_ERROR')))
        result,session=self.collect(lambda p:self.fail('NODATA_ERROR 중복 호출'))
        self.assertEqual((result['failedRegions'],result['callsThisRun'],session.calls),(1,0,[]))
        self.assertFalse((self.root/'cache'/self.job['id']/'collection.json').exists())
    def test_invalid_depth_preserves_all_raw_pages_without_publishing(self):
        def reply(p):
            start=(p['pageNo']-1)*300
            rows=[item(i) for i in range(start,min(start+300,601))]
            if p['pageNo']==1:rows[0]['dpwt']=-1
            return Response(envelope(rows,601,p['pageNo']))
        first,session=self.collect(reply)
        self.assertEqual((len(session.calls),first['results'][0]['preservedPages']),(3,3))
        second,session=self.collect(lambda p:self.fail('검증 실패 원본도 재사용'))
        self.assertEqual((second['callsThisRun'],len(session.calls)),(0,0))
        self.assertFalse((self.root/'cache'/self.job['id']/'collection.json').exists())
    def production(self):
        old=self.root/'old';old.mkdir()
        tile={'version':1,'points':[[128.8,37.8,8.0,0,None,False]]}
        write_json(old/'old.json',tile)
        write_json(old/'manifest.json',{'version':1,'datasets':[{'id':'old','sourceType':'khoa','verticalDatum':'평균해면하','estimated':True,'coverageBBox':BBOX}], 'tiles':[{'file':'old.json','bbox':BBOX,'count':1}]})
        return old
    def test_overlap_deduplication_and_original_tile_preservation(self):
        self.collect(self.reply);old=self.production()
        result=publish(old,self.plan,self.root/'cache',self.root/'release')
        self.assertEqual((result['originalPoints'],result['newPoints'],result['totalPoints'],result['deduplicated']),(1,300,301,1))
        self.assertEqual((old/'old.json').read_bytes(),(self.root/'release/old.json').read_bytes())
        ds=json.loads((self.root/'release/manifest.json').read_text(encoding='utf-8'))['datasets'][1]
        self.assertEqual((ds['coverageBoxes'],ds['verticalDatum']),([BBOX],'평균해면하'))
        self.assertEqual(len(ds['acquisitionHashes']),1)
        repeated=publish(self.root/'release',self.plan,self.root/'cache',self.root/'repeated')
        self.assertEqual(repeated['newPoints'],0)
        for path in (self.root/'release').rglob('*.json'):
            self.assertEqual(path.read_bytes(),(self.root/'repeated'/path.relative_to(self.root/'release')).read_bytes())
    def test_conflicting_depth_is_not_overwritten(self):
        self.collect(lambda p:Response(envelope([{**item(),'dpwt':99}],1)))
        old=self.production()
        with self.assertRaisesRegex(KhoaError,'충돌'):publish(old,self.plan,self.root/'cache',self.root/'release')
        self.assertFalse((self.root/'release').exists())
    def test_two_overlapping_acquisitions_are_deduplicated(self):
        second={**self.job,'bbox':[128.75,37.8,128.9,38.0]};second['id']=bbox_id(second['bbox'])
        plan={**self.plan,'jobs':[self.job,second]}
        self.collect(self.reply,plan)
        result=publish(self.production(),plan,self.root/'cache',self.root/'release')
        self.assertEqual((result['totalPoints'],result['deduplicated']),(301,302))
    def test_partial_publication_requires_explicit_option_and_reports_gaps(self):
        old=self.production()
        with self.assertRaisesRegex(KhoaError,'미완료'):publish(old,self.plan,self.root/'cache',self.root/'release')
        result=publish(old,self.plan,self.root/'cache',self.root/'release',allow_partial=True)
        self.assertEqual(result['unpublishedJobs'][0]['id'],self.job['id'])
        self.assertTrue(result['partial'])
    def test_next_plan_preserves_uncollected_coverage_holes(self):
        inventory={'ports':[{'name':'검사 항','lon':128.8,'lat':37.9}],
            'points':[{'name':'검사 해변','lon':128.8,'lat':37.9}],'osm':[]}
        manifest={'datasets':[{'id':'old','sourceType':'khoa','coverageBBox':BBOX,
            'coverageBoxes':[[128.7,37.8,128.79,38.0],[128.81,37.8,128.95,38.0]]}]}
        with patch.object(plan_east_khoa,'GROUPS',[('검사 권역',[('검사 항','검사 해변')])]):
            result=plan_east_khoa.plan(inventory,manifest)
        self.assertTrue(result['jobs'])
        self.assertTrue(any(j['bbox'][0]<=128.8<=j['bbox'][2] for j in result['jobs']))
        self.assertTrue(all(128.79<=j['bbox'][0]<j['bbox'][2]<=128.81 for j in result['jobs']))


if __name__=='__main__':unittest.main()
