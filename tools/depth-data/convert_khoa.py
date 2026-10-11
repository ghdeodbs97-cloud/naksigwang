"""검증 완료 KHOA 수집 결과만 기존 P2B 정적 타일로 변환한다. 앱 발행은 별도 검수."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
from argparse import Namespace

from convert import convert
from fetch_khoa import SOURCE, SOURCE_URL, KhoaError, point_of, validate_bbox


def convert_collection(path, output, dataset_id, vertical_datum, datum_note):
    doc = json.loads(path.read_text(encoding='utf-8'))
    if doc.get('complete') is not True or doc.get('probeOnly') is not False:
        raise KhoaError('전체 수집 검증을 마친 결과만 변환할 수 있습니다')
    points = doc.get('points', [])
    if not points or len(points) != doc['uniqueCount'] or doc['receivedCount'] != doc['totalCount'] or len(points) + doc['duplicates'] != doc['totalCount']:
        raise KhoaError('원본 건수 검증 실패 또는 빈 자료')
    bbox = validate_bbox(doc['bbox'])
    if not vertical_datum or not datum_note or not dataset_id:
        raise KhoaError('자료집 ID·기준면 원문·근거를 명시해야 합니다')
    validated = [point_of({'lat': p['lat'], 'lot': p['lon'], 'dpwt': p['depth']}, bbox) for p in points]
    if len({(p['lon'], p['lat']) for p in validated}) != len(validated):
        raise KhoaError('정규화 결과에 중복 좌표가 남아 있습니다')
    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / 'khoa-points.geojson'
        source.write_text(json.dumps({'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [p['lon'], p['lat']]},
             'properties': {'depth': p['depth']}} for p in validated]}, ensure_ascii=False), encoding='utf-8')
        args = Namespace(input=source, output=output, crs='EPSG:4326', encoding='utf-8', geometry_field=None,
                         depth_field='depth', depth_z=False, elevation=False, year_field=None, survey_year=None,
                         datum_field=None, vertical_datum=vertical_datum, source=SOURCE, source_field=None,
                         dataset_id=dataset_id, source_type='khoa', resolution=150, license='공공누리 제1유형', source_url=SOURCE_URL)
        manifest = convert(args)
    for ds in manifest['datasets']:
        ds.update({'datasetId': ds['id'], 'coverageBBox': bbox, 'datumNote': datum_note,
                   'estimated': True, 'note': '150 m 간격 해양수치모델용 데이터. 원본 측심점/수직 정확도 보증이 아님.'})
    manifest['provenance'].update({'sourceType': 'khoa', 'source': SOURCE, 'datasetId': dataset_id,
        'verticalDatum': vertical_datum, 'datumNote': datum_note, 'coverageBBox': bbox,
        'collectionSHA256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'receivedCount': doc['receivedCount'], 'uniqueCount': len(points), 'calls': doc['calls'],
        'fetchedAt': doc['fetchedAt'], 'fieldMapping': {'lat': 'lat', 'lot': 'lon', 'dpwt': 'depth'}})
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('collection', type=Path)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--dataset-id', required=True)
    p.add_argument('--vertical-datum', required=True)
    p.add_argument('--datum-note', required=True, help='공식 근거 URL/원문. 영문 약어를 임의 지정하지 않는다')
    args = p.parse_args()
    try:
        m = convert_collection(args.collection, args.output, args.dataset_id, args.vertical_datum, args.datum_note)
    except (KhoaError, ValueError, KeyError) as e:
        p.exit(1, 'KHOA 변환 오류: ' + str(e) + '\n')
    print(json.dumps({'tiles': len(m['tiles']), 'points': m['provenance']['uniqueCount']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
