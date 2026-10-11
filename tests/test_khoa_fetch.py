"""KHOA API mock 회귀. 실서비스 키/네트워크/production 자료를 사용하지 않는다."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/depth-data'))
import fetch_khoa as khoa
from convert_khoa import convert_collection

BBOX = [128.7, 37.8, 128.95, 38.0]
MOCK_KEY = 'mock-only-key+/='  # 테스트 전용 문자열. 실서비스 인증정보 아님.


def item(i=0):
    return {'lat': str(37.8 + i * 0.000001), 'lot': '128.8', 'dpwt': str(8 + i % 10)}


def envelope(items, total, page=1, rows=300, code='00', message='NORMAL_SERVICE'):
    return {'response': {'header': {'resultCode': code, 'resultMsg': message},
                         'body': {'totalCount': total, 'pageNo': page, 'numOfRows': rows, 'items': {'item': items}}}}


class Response:
    def __init__(self, doc, status=200):
        self.text = json.dumps(doc)
        self.status_code = status


class Session:
    def __init__(self, callback):
        self.callback = callback
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(kwargs)
        return self.callback(kwargs['params'])


class KhoaTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'KHOA_SERVICE_KEY': MOCK_KEY})
        self.env.start()
        self.addCleanup(self.env.stop)

    def client(self, callback, **kw):
        return khoa.Client(session=Session(callback), sleep=lambda _: None, **kw)

    def test_11018_last_page(self):
        def reply(p):
            start = (p['pageNo'] - 1) * 300
            return Response(envelope([item(i) for i in range(start, min(start + 300, 11018))], 11018, p['pageNo']))
        c = self.client(reply)
        r = c.collect(BBOX)
        self.assertEqual((r['calls'], r['pages'], r['receivedCount'], r['uniqueCount']), (37, 37, 11018, 11018))
        self.assertTrue(r['complete'])
        self.assertEqual(len(khoa.items_of(json.loads(c.responses[-1]['text'])['response']['body'])), 218)

    def test_300_boundary(self):
        c = self.client(lambda p: Response(envelope([item(i) for i in range(300)], 300)))
        self.assertEqual(c.collect(BBOX)['calls'], 1)

    def test_probe_is_one_request_and_allows_north_38(self):
        c = self.client(lambda p: Response(envelope([{'lat':38.27,'lot':128.56,'dpwt':12}]*10, 50, rows=10)))
        r = c.collect([128.545,38.260,128.580,38.285], rows=10, probe=True)
        self.assertEqual((c.calls,r['classification'],r['complete']), (1,'A',False))

    def test_singleton_and_lot_mapping(self):
        c = self.client(lambda p: Response(envelope(item(), 1)))
        point = c.collect(BBOX)['points'][0]
        self.assertEqual(point, {'lat':37.8,'lon':128.8,'depth':8.0})
        self.assertIn('lot', json.loads(c.responses[0]['text'])['response']['body']['items']['item'])

    def test_empty(self):
        for items in [[], '', None]:
            c = self.client(lambda p: Response(envelope(items,0)))
            r = c.collect(BBOX)
            self.assertEqual((r['classification'],r['uniqueCount'],r['calls']), ('B',0,1))

    def test_duplicate_coordinates(self):
        c = self.client(lambda p: Response(envelope([item(),item()],2)))
        r = c.collect(BBOX)
        self.assertEqual((r['receivedCount'],r['uniqueCount'],r['duplicates']), (2,1,1))
        c = self.client(lambda p: Response(envelope([item(),{**item(),'dpwt':99}],2)))
        with self.assertRaisesRegex(khoa.KhoaError,'서로 다른 수심'):
            c.collect(BBOX)

    def test_error_and_no_key_leak(self):
        c = self.client(lambda p: Response(envelope([],0,code='30',message='serviceKey=' + MOCK_KEY)))
        with self.assertRaises(khoa.KhoaError) as caught:
            c.collect(BBOX)
        self.assertIn('resultCode=30',str(caught.exception))
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)/'raw'
            khoa.save_result(out,c,{'error':str(caught.exception)})
            saved = ''.join(p.read_text(encoding='utf-8') for p in out.rglob('*') if p.is_file())
            self.assertNotIn(MOCK_KEY,saved)
            self.assertNotIn(MOCK_KEY,str(caught.exception))

    def test_network_error_redaction_and_backoff(self):
        delays=[]
        def error(p):
            raise khoa.requests.Timeout('https://example.invalid?serviceKey=' + MOCK_KEY)
        c = khoa.Client(session=Session(error),sleep=delays.append,backoff=2,retries=2)
        with self.assertRaises(khoa.KhoaError) as caught:
            c.collect(BBOX)
        self.assertEqual((c.calls,delays),(3,[2,4]))
        self.assertNotIn(MOCK_KEY,str(caught.exception))

    def test_missing_key(self):
        with patch.dict(os.environ,{'KHOA_SERVICE_KEY':''}):
            with self.assertRaisesRegex(khoa.KhoaError,'호출 0회'):
                khoa.Client()

    def test_cli_error_logs_do_not_expose_key(self):
        session=Session(lambda p:Response(envelope([],0,code='30',message='serviceKey='+MOCK_KEY)))
        with tempfile.TemporaryDirectory() as tmp:
            stdout,stderr=io.StringIO(),io.StringIO()
            argv=['fetch_khoa.py','--bbox',*map(str,BBOX),'--output',str(Path(tmp)/'raw')]
            with patch.object(sys,'argv',argv), patch.object(khoa.requests,'Session',return_value=session), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                self.assertEqual(khoa.main(),1)
            self.assertNotIn(MOCK_KEY,stdout.getvalue()+stderr.getvalue())
            self.assertIn('resultCode=30',stderr.getvalue())

    def test_latitude_rejection_is_explicit(self):
        session=Session(lambda p:Response(envelope([],0,code='10',message='위도 허용 범위 초과')))
        with tempfile.TemporaryDirectory() as tmp:
            stderr=io.StringIO()
            argv=['fetch_khoa.py','--bbox',*map(str,BBOX),'--output',str(Path(tmp)/'raw')]
            with patch.object(sys,'argv',argv), patch.object(khoa.requests,'Session',return_value=session), contextlib.redirect_stderr(stderr):
                self.assertEqual(khoa.main(),1)
            self.assertEqual(json.loads(stderr.getvalue())['classification'],'C')

    def test_encoded_key_once(self):
        with patch.dict(os.environ,{'KHOA_SERVICE_KEY':khoa.quote(MOCK_KEY,safe='')}):
            c=self.client(lambda p:Response(envelope([],0)))
            c.collect(BBOX)
            p=c.session.calls[0]['params']
            prepared=khoa.requests.Request('GET',khoa.ENDPOINT,params=p).prepare()
            self.assertEqual(parse_qs(urlsplit(prepared.url).query)['serviceKey'],[MOCK_KEY])
            self.assertEqual(p['type'],'json')

    def test_response_secret_variants_redacted(self):
        c=self.client(lambda p:Response(envelope([],0)))
        for secret in [MOCK_KEY,khoa.quote(MOCK_KEY,safe=''),khoa.quote(MOCK_KEY,safe='').lower(),MOCK_KEY.replace('/',r'\/')]:
            self.assertNotIn(secret,c.redact('echo='+secret))
        self.assertNotIn('unrelated-secret',c.redact('"serviceKey": "unrelated-secret"'))

    def test_numeric_validation(self):
        for value in ['',None,True,'NaN','Infinity',-1,'bad']:
            c=self.client(lambda p:Response(envelope({**item(),'dpwt':value},1)))
            with self.subTest(value=value), self.assertRaises(khoa.KhoaError):
                c.collect(BBOX)

    def test_incomplete_or_changing_total_rejected(self):
        c=self.client(lambda p:Response(envelope([],1)))
        with self.assertRaisesRegex(khoa.KhoaError,'페이지 건수'):
            c.collect(BBOX)
        c=self.client(lambda p:Response(envelope([item(p['pageNo'])],2 if p['pageNo']==1 else 3,p['pageNo'],rows=1)))
        with self.assertRaisesRegex(khoa.KhoaError,'totalCount 변경'):
            c.collect(BBOX,rows=1)

    def test_http_retry_and_redirect_not_followed(self):
        replies=iter([Response({},503),Response(envelope([],0))])
        c=self.client(lambda p:next(replies))
        self.assertEqual(c.collect(BBOX)['calls'],2)
        self.assertFalse(c.session.calls[0]['allow_redirects'])
        c=self.client(lambda p:Response({},302))
        with self.assertRaisesRegex(khoa.KhoaError,'HTTP 302'):
            c.collect(BBOX)

    def test_bbox_and_page_limit(self):
        c=self.client(lambda p:Response(envelope([],0)))
        for bbox, rows in [([128,37,130,38],300),(BBOX,301),(BBOX,0)]:
            with self.assertRaises(khoa.KhoaError):
                c.collect(bbox,rows)
        self.assertEqual(c.calls,0)

    def test_conversion_preserves_datum_and_coverage(self):
        c=self.client(lambda p:Response(envelope([item(),item(1)],2)))
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            khoa.save_result(root/'raw',c,c.collect(BBOX))
            m=convert_collection(root/'raw/collection.json',root/'tiles','khoa-test-only','평균해면하','테스트 전용 기준면 원문')
            self.assertEqual(m['datasets'][0]['sourceType'],'khoa')
            self.assertEqual(m['datasets'][0]['verticalDatum'],'평균해면하')
            self.assertEqual(m['datasets'][0]['coverageBBox'],BBOX)
            self.assertTrue(m['datasets'][0]['estimated'])
            self.assertEqual(m['provenance']['fieldMapping']['lot'],'lon')
            points=[p for t in m['tiles'] for p in json.loads((root/'tiles'/t['file']).read_text())['points']]
            self.assertEqual(points[0][:3],[128.8,37.8,8])
            self.assertIsNone(points[0][4])


if __name__ == '__main__':
    unittest.main()
