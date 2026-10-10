"""변환기의 실제 CRS 변환과 메타 보존/잘못된 입력 거절. 임시 자료만 사용."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from argparse import Namespace

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('depth_convert', ROOT / 'tools/depth-data/convert.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)

class ConverterTests(unittest.TestCase):
    def args(self, source, output, **kw):
        data = dict(input=source, output=output, crs='EPSG:4326', encoding='utf-8', geometry_field=None,
            depth_field='depth', depth_z=False, elevation=False, year_field='year', survey_year=None,
            datum_field=None, vertical_datum='DL', source='검사 출처', source_field=None, dataset_id='test-only',
            source_type='coastal_official', resolution=30, license='test-only', source_url='https://example.invalid')
        return Namespace(**{**data, **kw})

    def test_projected_point_metadata(self):
        from pyproj import Transformer
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp); x,y = Transformer.from_crs(4326,5179,always_xy=True).transform(128.6,38.2)
            (p/'in.json').write_text(json.dumps({'type':'Feature','geometry':{'type':'Point','coordinates':[x,y]},'properties':{'depth':11.25,'year':2016}}),encoding='utf-8')
            m = converter.convert(self.args(p/'in.json',p/'out',crs='EPSG:5179'))
            point = json.loads((p/'out'/m['tiles'][0]['file']).read_text(encoding='utf-8'))['points'][0]
            self.assertAlmostEqual(point[0],128.6,places=8); self.assertAlmostEqual(point[1],38.2,places=8)
            self.assertEqual(point[2:], [11.25,0,2016,False])
            self.assertEqual(m['datasets'][0]['verticalDatum'],'DL')
            self.assertEqual(m['datasets'][0]['resolution'],30)

    def test_missing_depth_is_rejected_without_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p/'in.csv').write_text('id,geometry\n1,POINT (128.6 38.2)\n',encoding='utf-8')
            with self.assertRaises(KeyError):
                converter.convert(self.args(p/'in.csv',p/'out',geometry_field='geometry'))
            self.assertFalse((p/'out').exists())

    def test_contour_and_depth_z(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            (p/'in.csv').write_text('id,geometry,year\n1,"LINESTRING Z (128.6 38.2 8, 128.601 38.2 9)",2010\n',encoding='utf-8')
            m=converter.convert(self.args(p/'in.csv',p/'out',geometry_field='geometry',depth_z=True,depth_field=None))
            points=[q for t in m['tiles'] for q in json.loads((p/'out'/t['file']).read_text(encoding='utf-8'))['points']]
            self.assertEqual([q[2] for q in points],[8,9]); self.assertTrue(all(q[5] for q in points))
            self.assertEqual([q[4] for q in points],['2010','2010'])

    def test_negative_depth_not_silently_absolute(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp); (p/'in.json').write_text(json.dumps({'type':'Feature','geometry':{'type':'Point','coordinates':[128.6,38.2]},'properties':{'depth':-8}}),encoding='utf-8')
            with self.assertRaises(ValueError): converter.convert(self.args(p/'in.json',p/'out'))
            self.assertFalse((p/'out').exists())
            m=converter.convert(self.args(p/'in.json',p/'out',elevation=True))
            self.assertEqual(json.loads((p/'out'/m['tiles'][0]['file']).read_text(encoding='utf-8'))['points'][0][2],8)

    def test_shp_z(self):
        import shapefile
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            with shapefile.Writer(str(p/'in'),shapeType=shapefile.POINTZ) as w:
                w.field('year','N'); w.pointz(128.6,38.2,12); w.record(2011)
            m=converter.convert(self.args(p/'in.shp',p/'out',encoding='utf-8',depth_z=True,depth_field=None))
            self.assertEqual(json.loads((p/'out'/m['tiles'][0]['file']).read_text(encoding='utf-8'))['points'][0][2],12)

    def test_constant_contour_not_fake_measurements(self):
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            (p/'in.json').write_text(json.dumps({'type':'Feature','geometry':{'type':'LineString','coordinates':[[128.6,38.2],[128.602,38.2]]},'properties':{'depth':8,'year':2010}}),encoding='utf-8')
            m=converter.convert(self.args(p/'in.json',p/'out'))
            points=[q for t in m['tiles'] for q in json.loads((p/'out'/t['file']).read_text(encoding='utf-8'))['points']]
            self.assertTrue(all(q[2]==8 and q[5] for q in points))
            self.assertEqual(points[0][:2],[128.6,38.2]); self.assertEqual(points[1][:2],[128.602,38.2])
            self.assertLess(len(points),10)

    def test_tile_split_and_merge(self):
        merge_spec=importlib.util.spec_from_file_location('depth_merge',ROOT/'tools/depth-data/merge.py')
        merger=importlib.util.module_from_spec(merge_spec);merge_spec.loader.exec_module(merger)
        with tempfile.TemporaryDirectory() as tmp:
            p=Path(tmp)
            feature={'type':'Feature','geometry':{'type':'Point','coordinates':[128.6,38.2]},'properties':{'depth':8,'year':2010}}
            (p/'in.json').write_text(json.dumps({'type':'FeatureCollection','features':[feature]*12001}),encoding='utf-8')
            m=converter.convert(self.args(p/'in.json',p/'out1'))
            converter.convert(self.args(p/'in.json',p/'out2',dataset_id='second-only',vertical_datum='MSL'))
            self.assertEqual([t['count'] for t in m['tiles']],[12000,1])
            merger.merge([p/'out1',p/'out2'],p/'release')
            combined=json.loads((p/'release/manifest.json').read_text(encoding='utf-8'))
            self.assertEqual(len(combined['datasets']),2)
            for t in combined['tiles']:
                data=(p/'release'/t['file']).read_bytes();self.assertEqual(t['bytes'],len(data));self.assertLessEqual(len(data),1024*1024)
                ds=1 if t['file'].startswith('1/') else 0
                self.assertTrue(all(q[3]==ds for q in json.loads(data)['points']))

if __name__=='__main__': unittest.main()
