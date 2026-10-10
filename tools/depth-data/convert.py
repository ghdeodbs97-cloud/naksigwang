"""공식 GIS 원본 → 지역별 정적 JSON. 깊이/좌표계/기준면을 추측하지 않는다."""
import argparse
import csv
import hashlib
import json
import math
from pathlib import Path
import tempfile
import shutil

TYPES = ['coastal_official', 'mof_contour', 'chart_public', 'bada']


def records(path, encoding, geometry_field=None):
    if path.suffix.lower() == '.shp':
        import shapefile
        with shapefile.Reader(str(path), encoding=encoding) as reader:
            for r in reader.iterShapeRecords():
                geometry = r.shape.__geo_interface__
                # pyshp의 geo interface는 Z를 버리므로 명시적으로 복원한다.
                if hasattr(r.shape, 'z'):
                    values = iter(r.shape.z)
                    def with_z(coords):
                        if coords and isinstance(coords[0], (float, int)):
                            return [*coords[:2], next(values)]
                        return [with_z(c) for c in coords]
                    geometry['coordinates'] = with_z(geometry['coordinates'])
                yield geometry, r.record.as_dict()
    elif path.suffix.lower() in ('.json', '.geojson'):
        doc = json.loads(path.read_text(encoding=encoding))
        features = doc['features'] if doc.get('type') == 'FeatureCollection' else [doc]
        for f in features:
            yield f['geometry'], f.get('properties') or {}
    elif path.suffix.lower() == '.csv':
        from shapely import wkt
        if not geometry_field:
            raise ValueError('CSV는 --geometry-field로 WKT/GeoJSON 필드를 지정해야 합니다')
        csv.field_size_limit(10000000)
        with path.open(encoding=encoding, newline='') as file:
            for row in csv.DictReader(file):
                value = row[geometry_field].strip()
                if value.startswith('{'):
                    obj = json.loads(value)
                    if obj.get('type') == 'Feature':
                        yield obj['geometry'], {**row, **(obj.get('properties') or {})}
                    else:
                        yield obj, row
                else:
                    geometry = wkt.loads(value)
                    from shapely.geometry import mapping
                    yield mapping(geometry), row
    else:
        raise ValueError('SHP, GeoJSON, CSV/WKT만 지원합니다. DXF는 QGIS에서 CRS를 확인하고 GeoJSON으로 내보내세요')


def numeric(value):
    if value is None or isinstance(value, bool) or str(value).strip() == '':
        raise ValueError('수심 값이 비어 있습니다')
    n = float(value)
    if not math.isfinite(n):
        raise ValueError('수심이 유한한 숫자가 아닙니다')
    return n


def convert(args):
    from pyproj import Transformer, Geod
    transform = Transformer.from_crs(args.crs, 'EPSG:4326', always_xy=True)
    inverse = Transformer.from_crs('EPSG:4326', args.crs, always_xy=True)
    geod = Geod(ellps='WGS84')
    datasets, ds_index, tiles = [], {}, {}
    feature_count = 0
    def emit(c, props, interpolated, fixed_depth=None):
        lon, lat = transform.transform(c[0], c[1], errcheck=True)
        if not (123.5 <= lon <= 132.5 and 32 <= lat <= 39.5):
            raise ValueError('대한민국 범위 밖 좌표: 원본 CRS/축 순서를 확인하세요')
        d = numeric(fixed_depth if fixed_depth is not None else c[2] if args.depth_z else props[args.depth_field])
        if args.elevation:
            if d > 0:
                raise ValueError('해저고도 모드에서 양수 표고 발견 (육지를 수심으로 바꾸지 않습니다)')
            d = -d
        if d < 0:
            raise ValueError('양의 깊이만 허용합니다. 음수 해저고도는 --elevation 지정')
        year = props.get(args.year_field) if args.year_field else args.survey_year
        datum = props.get(args.datum_field) if args.datum_field else args.vertical_datum
        if not datum:
            raise ValueError('기준면 값 누락: 미확인이면 unknown을 명시하세요')
        source = props.get(args.source_field) if args.source_field else args.source
        if not source:
            raise ValueError('출처 값 누락')
        key = (str(source), str(datum))
        if key not in ds_index:
            ds_index[key] = len(datasets)
            datasets.append({'id': args.dataset_id + '-' + str(len(datasets)), 'sourceType': args.source_type,
                'source': str(source), 'resolution': args.resolution, 'verticalDatum': str(datum),
                'surveyYear': None, 'license': args.license, 'sourceURL': args.source_url, 'inputCRS': args.crs})
        tile = (math.floor(lon * 10), math.floor(lat * 10))
        tiles.setdefault(tile, []).append([lon, lat, d, ds_index[key], year, interpolated])

    def geometry(g, props):
        kind, cs = g['type'], g.get('coordinates')
        if kind == 'Point':
            emit(cs, props, False)
        elif kind == 'MultiPoint':
            for c in cs:
                emit(c, props, False)
        elif kind == 'LineString':
            # 원래 꼭짓점을 보존한다. 점을 촘촘히 만들어 원본보다 정밀한 척하지 않는다.
            for c in cs:
                emit(c, props, True)
            if not args.depth_z:
                # 긴 등심선의 빈 구간은 자료해상도 이상의 간격으로만 샘플링한다.
                for a, b in zip(cs, cs[1:]):
                    lo1, la1 = transform.transform(*a[:2], errcheck=True)
                    lo2, la2 = transform.transform(*b[:2], errcheck=True)
                    az, _, distance = geod.inv(lo1, la1, lo2, la2)
                    for j in range(1, math.ceil(distance / args.resolution)):
                        dist = j * args.resolution
                        if dist >= distance:
                            break
                        # 원본 좌표로 되돌려 emit에서 공통 검증한다.
                        lo, la, _ = geod.fwd(lo1, la1, az, dist)
                        emit(inverse.transform(lo, la), props, True)
        elif kind == 'MultiLineString':
            for line in cs:
                geometry({'type': 'LineString', 'coordinates': line}, props)
        elif kind == 'GeometryCollection':
            for part in g['geometries']:
                geometry(part, props)
        else:
            raise ValueError('지원하지 않는 도형: ' + kind + ' (면의 최소/최대 수심을 한 수심으로 바꾸지 않습니다)')

    for g, props in records(args.input, args.encoding, args.geometry_field):
        feature_count += 1
        geometry(g, props)
    if not tiles:
        raise ValueError('변환할 수심점 없음')
    manifest = {'version': 1, 'datasets': datasets, 'tiles': [], 'provenance': {
        'inputFile': args.input.name, 'sha256': hashlib.sha256(args.input.read_bytes()).hexdigest(),
        'featureCount': feature_count, 'pointCount': sum(map(len, tiles.values())), 'depthField': args.depth_field,
        'depthZ': args.depth_z, 'elevation': args.elevation}}
    inputs = [args.input]
    if args.input.suffix.lower() == '.shp':
        inputs = [args.input.with_suffix(ext) for ext in ['.shp', '.shx', '.dbf', '.prj', '.cpg'] if args.input.with_suffix(ext).exists()]
    manifest['provenance']['inputFiles'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}
    # 전부 검증한 후 별도 폴더에 발행. 기존 manifest를 덮어쓰지 않는다.
    if args.output.exists():
        raise ValueError('출력 폴더가 이미 있습니다. 새 출력 폴더를 지정하세요')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as temp:
        staging = Path(temp) / 'depth'
        staging.mkdir()
        for (x, y), points in sorted(tiles.items()):
            part = 0
            def write(rows):
                nonlocal part
                data = json.dumps({'version': 1, 'points': rows}, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
                if len(data) > 1024 * 1024:
                    if len(rows) < 2:
                        raise ValueError('단일 자료점이 크기 제한을 넘습니다')
                    middle = len(rows) // 2
                    write(rows[:middle]); write(rows[middle:]); return
                digest = hashlib.sha256(data).hexdigest()[:12]
                name = f'{x}_{y}_{part}_{digest}.json'; part += 1
                (staging / name).write_bytes(data)
                manifest['tiles'].append({'file': name, 'bbox': [x / 10, y / 10, (x + 1) / 10, (y + 1) / 10], 'count': len(rows), 'bytes': len(data)})
            for i in range(0, len(points), 12000):
                write(points[i:i + 12000])
        text = json.dumps(manifest, ensure_ascii=False, indent=2)
        if len(text.encode('utf-8')) > 1024 * 1024:
            raise ValueError('목록 1 MiB 초과: 지역별 목록 분할이 필요합니다')
        (staging / 'manifest.json').write_text(text, encoding='utf-8')
        shutil.move(str(staging), str(args.output))
    return manifest


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--inspect', action='store_true', help='첫 자료의 속성과 도형/Z 유무 확인')
    p.add_argument('--encoding', default='utf-8-sig')
    p.add_argument('--geometry-field')
    p.add_argument('--output', type=Path)
    p.add_argument('--crs')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--depth-field'); group.add_argument('--depth-z', action='store_true')
    p.add_argument('--elevation', action='store_true')
    p.add_argument('--source-type', choices=TYPES)
    p.add_argument('--dataset-id')
    p.add_argument('--source'); p.add_argument('--source-field')
    p.add_argument('--resolution', type=float)
    p.add_argument('--vertical-datum'); p.add_argument('--datum-field')
    p.add_argument('--survey-year'); p.add_argument('--year-field')
    p.add_argument('--license'); p.add_argument('--source-url')
    args = p.parse_args()
    if args.inspect:
        g, props = next(records(args.input, args.encoding, args.geometry_field))
        print(json.dumps({'geometry': g, 'properties': props}, ensure_ascii=False, indent=2)[:12000]); return
    required = ['output', 'crs', 'source_type', 'dataset_id', 'resolution', 'license', 'source_url']
    if any(getattr(args, k) is None for k in required) or not (args.depth_field or args.depth_z) or not (args.source or args.source_field) or not (args.vertical_datum or args.datum_field):
        p.error('출력/CRS/수심필드 또는 Z/출처유형/자료집ID/출처/해상도/기준면/라이선스/출처URL 필수')
    if not math.isfinite(args.resolution) or not 0 < args.resolution <= 1000:
        p.error('해상도는 확인된 0 초과 1000 m 이하 값이어야 합니다')
    try:
        result = convert(args)
    except (ValueError, KeyError, IndexError) as e:
        p.error(str(e))
    print(json.dumps(result['provenance'], ensure_ascii=False))


if __name__ == '__main__':
    main()
