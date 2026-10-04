"""수집기 부분 실패가 운영 데이터를 깨뜨리지 않는지 확인한다."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('naksigwang_collect', ROOT / 'collector' / 'collect.py')
collect = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collect)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')


class CollectorResilienceTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name)
        self.old_out, self.old_pts, self.old_limit = collect.OUT, collect.PTS, collect.LIMIT
        self.old_ratio, self.old_log = collect.MIN_FRESH_RATIO, collect.LOG
        collect.OUT = self.out
        collect.PTS = {'obs': [['O1', '관측1'], ['O2', '관측2']], 'cells': [[1, 1], [2, 2]], 'tide': []}
        collect.LIMIT = 0
        collect.MIN_FRESH_RATIO = .90
        collect.LOG = {'errors': []}

    def tearDown(self):
        collect.OUT, collect.PTS, collect.LIMIT = self.old_out, self.old_pts, self.old_limit
        collect.MIN_FRESH_RATIO, collect.LOG = self.old_ratio, self.old_log
        self.tmp.cleanup()

    def test_obs_failed_station_uses_previous_value(self):
        write_json(self.out / 'obs.json', {
            'O1': {'name': 'old1', 'lat': 1, 'lon': 1},
            'O2': {'name': 'old2', 'lat': 2, 'lon': 2, 'sst': [11, '2026-10-04 00:00']},
        })

        def fake_get(url, params, tries=4):
            if params.get('obsCode') == 'O2':
                raise RuntimeError('temporary failure')
            return {'items': {'item': [{'lat': '1', 'lot': '1', 'obsrvnDt': '2026-10-04 12:00', 'wtem': '20'}]}}

        with patch.object(collect, 'get', fake_get):
            data, stats = collect.obs()
        self.assertEqual(stats, {'fresh': 1, 'fallback': 1, 'requested': 2})
        self.assertEqual(data['O2']['name'], 'old2')

    def test_wx_failed_cell_uses_previous_cell(self):
        today = collect.NOW.strftime('%Y%m%d')
        write_json(self.out / 'wx.json', {
            'base': 'OLD',
            'cells': {'1,1': {today + '00': [1, 1, 1]}, '2,2': {today + '00': [2, 2, 2]}},
        })

        def fake_get(url, params, tries=4):
            if params.get('nx') == 2:
                raise RuntimeError('temporary failure')
            return {
                'items': {'item': [{'category': 'WSD', 'fcstDate': today, 'fcstTime': '1200', 'fcstValue': '4.5'}]},
                'totalCount': 1,
            }

        with patch.object(collect, 'get', fake_get):
            data, stats = collect.wx()
        self.assertEqual(stats, {'fresh': 1, 'fallback': 1, 'requested': 2})
        self.assertEqual(data['cells']['2,2'], {today + '00': [2, 2, 2]})

    def test_low_fresh_ratio_keeps_previous_file(self):
        path = self.out / 'obs.json'
        write_json(path, {'OLD': {'name': 'keep', 'lat': 1, 'lon': 1}})
        before = path.read_text(encoding='utf-8')
        written = collect.save('obs.json', {'NEW': {}}, {'fresh': 1, 'fallback': 9, 'requested': 10})
        self.assertFalse(written)
        self.assertEqual(path.read_text(encoding='utf-8'), before)
        self.assertEqual(collect.LOG['obs.json']['status'], 'kept_previous_low_fresh_ratio')

    def test_limit_run_never_overwrites_production_file(self):
        path = self.out / 'wx.json'
        write_json(path, {'base': 'OLD', 'cells': {'1,1': {}}})
        before = path.read_text(encoding='utf-8')
        collect.LIMIT = 1
        written = collect.save('wx.json', {'base': 'NEW', 'cells': {}}, {'fresh': 1, 'fallback': 0, 'requested': 1})
        self.assertFalse(written)
        self.assertEqual(path.read_text(encoding='utf-8'), before)
        self.assertEqual(collect.LOG['wx.json']['status'], 'test_only_not_saved')

    def tide_doc(self):
        today = collect.NOW.strftime('%Y-%m-%d')
        yesterday = (collect.NOW - collect.dt.timedelta(days=1)).strftime('%Y-%m-%d')
        return {'from': today, 'lunar': {today: [8, 24, 0]}, 'st': {
            'T1': {'name': '조석1', 'lat': 35, 'lon': 129,
                   'days': {today: [['06:00', 100, 'H']], yesterday: [['06:00', 100, 'H']]}}}}

    def test_tide_failure_empty_and_malformed_fallback(self):
        old = self.tide_doc()
        write_json(self.out / 'tide.json', old)
        collect.PTS['tide'] = [['T1', '조석1']]
        for response in [RuntimeError('실패'), {'items': {'item': []}}, {'items': {'item': [{'lat': 'bad'}]}}]:
            with self.subTest(response=response), patch.object(collect, 'DAYS', 1), patch.object(collect, 'get') as get:
                if isinstance(response, Exception):
                    get.side_effect = response
                else:
                    get.return_value = response
                data, stats = collect.tide()
                self.assertEqual(stats, collect.stat(0, 2, 2))
                self.assertEqual(data['st'], old['st'])

    def test_tide_success_counts_station_dates(self):
        collect.PTS['tide'] = [['T1', '조석1']]
        def response(url, params):
            d = params['reqDate']
            return {'items': {'item': [{'lat': '35', 'lot': '129', 'predcDt': f'{d[:4]}-{d[4:6]}-{d[6:]} 06:00:00', 'predcTdlvVl': '100', 'extrSe': '1'}]}}
        with patch.object(collect, 'DAYS', 1), patch.object(collect, 'get', response):
            data, stats = collect.tide()
        self.assertEqual(stats, collect.stat(2, 0, 2))
        self.assertTrue(collect.valid_doc('tide.json', data))

    def test_atomic_replace_failure_preserves_bytes_and_cleans_temp(self):
        path = self.out / 'obs.json'
        path.write_bytes(b'original')
        with patch.object(collect.os, 'replace', side_effect=OSError('실패')):
            with self.assertRaises(OSError):
                collect.write_json_atomic(path, {'new': 1})
        self.assertEqual(path.read_bytes(), b'original')
        self.assertEqual(list(self.out.glob('*.tmp')), [])

    def test_atomic_serialization_failure_preserves_bytes(self):
        path = self.out / 'obs.json'
        path.write_bytes(b'original')
        with self.assertRaises(ValueError):
            collect.write_json_atomic(path, {'bad': float('nan')})
        self.assertEqual(path.read_bytes(), b'original')
        self.assertEqual(list(self.out.glob('*.tmp')), [])

    def test_ratio_boundary_and_fallback_saved(self):
        data = {'O1': {'name': '관측1', 'lat': 35, 'lon': 129}}
        write_json(self.out / 'obs.json', data)
        self.assertTrue(collect.save('obs.json', data, collect.stat(9, 1, 10)))
        self.assertEqual(collect.LOG['obs.json']['status'], 'merged_fallback')
        self.assertEqual(collect.LOG['obs.json']['error'], 0)

    def test_unrecoverable_hole_keeps_previous_even_above_ratio(self):
        path = self.out / 'obs.json'
        write_json(path, {'OLD': {'lat': 35, 'lon': 129}})
        before = path.read_bytes()
        self.assertFalse(collect.save('obs.json', {'NEW': {'lat': 35, 'lon': 129}}, collect.stat(99, 0, 100)))
        self.assertEqual(path.read_bytes(), before)

    def test_corrupt_previous_does_not_prevent_healthy_replacement(self):
        path = self.out / 'obs.json'
        path.write_text('{broken', encoding='utf-8')
        self.assertTrue(collect.save('obs.json', {'NEW': {'lat': 35, 'lon': 129}}, collect.stat(1, 0, 1)))
        self.assertIsNotNone(collect.read_prev('obs.json'))

    def test_no_previous_low_fresh_does_not_publish(self):
        self.assertFalse(collect.save('obs.json', {'NEW': {'lat': 35, 'lon': 129}}, collect.stat(1, 0, 10)))
        self.assertFalse((self.out / 'obs.json').exists())

    def test_limit_main_leaves_all_files_including_meta_untouched(self):
        for name in ['tide', 'obs', 'wx', 'meta']:
            (self.out / (name + '.json')).write_bytes(b'original')
        before = {p.name: p.read_bytes() for p in self.out.iterdir()}
        collect.LIMIT = 1
        collect.PTS['tide'] = [['T1', '조석1']]
        with patch.object(collect, 'KEY', 'test'), patch.object(collect, 'get', side_effect=RuntimeError('실패')):
            collect.main()
        self.assertEqual({p.name: p.read_bytes() for p in self.out.iterdir()}, before)

    def test_main_missing_required_tide_fails_and_writes_meta(self):
        with patch.object(collect, 'KEY', 'test'), patch.object(collect, 'get', side_effect=RuntimeError('실패')):
            with self.assertRaises(SystemExit) as error:
                collect.main()
        self.assertEqual(error.exception.code, 1)
        meta = json.loads((self.out / 'meta.json').read_text(encoding='utf-8'))
        for name in ['tide.json', 'obs.json', 'wx.json']:
            self.assertTrue({'fresh', 'fallback', 'requested', 'error', 'status'} <= meta[name].keys())

    def test_parsing_failure_in_obs_and_wx_falls_back(self):
        write_json(self.out / 'obs.json', {'O1': {'lat': 35, 'lon': 129}, 'O2': {'lat': 35, 'lon': 129}})
        write_json(self.out / 'wx.json', {'base': 'OLD', 'cells': {'1,1': {'2026100400': [1, 2, 3]}, '2,2': {'2026100400': [1, 2, 3]}}})
        with patch.object(collect, 'get', return_value={'items': {'item': [{'bad': True}]}}):
            for fn in [collect.obs, collect.wx]:
                data, stats = fn()
                self.assertEqual(stats, collect.stat(0, 2, 2))

    def test_wx_later_page_failure_discards_partial_response(self):
        write_json(self.out / 'wx.json', {'base': 'OLD', 'cells': {'1,1': {'2026100400': [1, 2, 3]}, '2,2': {'2026100400': [1, 2, 3]}}})
        def response(url, params):
            if params['pageNo'] == 2:
                raise RuntimeError('둘째 페이지 실패')
            return {'totalCount': 1001, 'items': {'item': [{'category': 'WSD', 'fcstDate': '20261004', 'fcstTime': '1200', 'fcstValue': '5'}]}}
        with patch.object(collect, 'get', response):
            data, stats = collect.wx()
        self.assertEqual(stats, collect.stat(0, 2, 2))


if __name__ == '__main__':
    unittest.main()
