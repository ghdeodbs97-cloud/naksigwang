"""KHOA 자연과학용 수심 API 수집. 키는 환경변수에서만 읽고 응답에서도 가린다."""
import argparse
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import quote, unquote

import requests

ENDPOINT = 'https://apis.data.go.kr/1192136/waterDepth/GetWaterDepthApiService'
SOURCE_URL = 'https://www.data.go.kr/data/15142498/openapi.do'
SOURCE = '국립해양조사원 자연과학용 수심정보'


class KhoaError(Exception):
    """URL·인증정보를 담지 않는 사용자용 오류."""


def number(value, name):
    if value is None or isinstance(value, bool) or str(value).strip() == '':
        raise KhoaError(name + ': 숫자가 비어 있습니다')
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise KhoaError(name + ': 숫자 형식 오류') from None
    if not math.isfinite(n):
        raise KhoaError(name + ': 유한한 숫자가 아닙니다')
    return n


def integer(value, name):
    n = number(value, name)
    if n < 0 or not n.is_integer():
        raise KhoaError(name + ': 음이 아닌 정수가 필요합니다')
    return int(n)


def validate_bbox(bbox):
    west, south, east, north = [number(v, 'bbox') for v in bbox]
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise KhoaError('bbox 좌표 순서/범위 오류')
    if east - west > 1 + 1e-12 or north - south > 1 + 1e-12:
        raise KhoaError('요청 위도·경도 폭은 각각 1도 이하여야 합니다')
    # 북위 38도 제한을 두지 않는다. 실제 응답으로 지원 여부를 판정한다.
    return [west, south, east, north]


def items_of(body):
    value = body.get('items')
    if value is None or value == '':
        return []
    if isinstance(value, dict):
        value = value.get('item', [])
    if value is None or value == '':
        return []
    if isinstance(value, dict):
        return [value]
    if not isinstance(value, list) or any(not isinstance(i, dict) for i in value):
        raise KhoaError('items.item 형식 오류')
    return value


def point_of(item, bbox):
    # 공식 원필드 lot는 원본 응답에 남기고, 변환된 레코드에서만 lon에 매핑한다.
    lat, lon, depth = (number(item.get(k), k) for k in ('lat', 'lot', 'dpwt'))
    if depth < 0:
        raise KhoaError('dpwt: 음의 수심은 자동으로 절댓값 변환하지 않습니다')
    west, south, east, north = bbox
    if not (south - 1e-9 <= lat <= north + 1e-9 and west - 1e-9 <= lon <= east + 1e-9):
        raise KhoaError('응답 좌표가 요청 bbox 밖입니다')
    return {'lat': lat, 'lon': lon, 'depth': depth}


class Client:
    def __init__(self, *, session=None, timeout=30, retries=3, backoff=1, sleep=time.sleep):
        encoded = os.environ.get('KHOA_SERVICE_KEY', '').strip()
        if not encoded:
            raise KhoaError('KHOA_SERVICE_KEY 환경변수가 설정되지 않았습니다 (호출 0회)')
        self.key = unquote(encoded)
        self.secrets = {encoded, self.key, quote(self.key, safe=''), quote(quote(self.key, safe=''), safe='')}
        self.session = session or requests.Session()
        self.timeout, self.retries, self.backoff, self.sleep = timeout, retries, backoff, sleep
        self.calls = 0
        self.responses = []
        self.api_error = None

    def redact(self, text):
        for secret in sorted(self.secrets, key=len, reverse=True):
            if secret:
                # URL encoding의 16진수 대소문자·JSON slash escape까지 제거한다.
                text = re.sub(re.escape(secret), '[REDACTED]', text, flags=re.I)
                text = text.replace(json.dumps(secret)[1:-1], '[REDACTED]')
                text = text.replace(secret.replace('/', r'\/'), '[REDACTED]')
        return re.sub(r'(?i)(serviceKey["\s]*[=:]["\s]*)([^&\s"<>]+)', r'\1[REDACTED]', text)

    def page(self, bbox, page_no, rows):
        west, south, east, north = bbox
        params = {'serviceKey': self.key, 'type': 'json', 'ymin': south, 'ymax': north,
                  'xmin': west, 'xmax': east, 'pageNo': page_no, 'numOfRows': rows}
        for attempt in range(self.retries + 1):
            self.calls += 1
            try:
                response = self.session.get(ENDPOINT, params=params, timeout=self.timeout, allow_redirects=False)
            except requests.RequestException:
                # requests 예외에는 인증키가 붙은 URL이 들어갈 수 있어 절대 출력하지 않는다.
                if attempt < self.retries:
                    self.sleep(self.backoff * 2 ** attempt)
                    continue
                raise KhoaError('API 네트워크/시간초과 오류 (재시도 소진)') from None
            safe = self.redact(response.text)
            self.responses.append({'pageNo': page_no, 'attempt': attempt + 1, 'status': response.status_code,
                                   'text': safe})
            if response.status_code == 429 or 500 <= response.status_code < 600:
                if attempt < self.retries:
                    self.sleep(self.backoff * 2 ** attempt)
                    continue
            if response.status_code != 200:
                raise KhoaError('API HTTP ' + str(response.status_code))
            try:
                doc = json.loads(safe)
                root = doc.get('response', doc)
                header = root['header']
                code, message = str(header['resultCode']), str(header.get('resultMsg', ''))
            except (ValueError, KeyError, TypeError, AttributeError):
                raise KhoaError('API JSON/header 형식 오류 (XML 게이트웨이 응답 포함)') from None
            if code != '00':
                self.api_error = {'resultCode': self.redact(code), 'resultMsg': self.redact(message)}
                if code in ('05', '23') and attempt < self.retries:
                    self.sleep(self.backoff * 2 ** attempt)
                    continue
                raise KhoaError('API resultCode=' + self.redact(code)[:80] + ' resultMsg=' + self.redact(message)[:300])
            body = root.get('body')
            if not isinstance(body, dict):
                raise KhoaError('API body 형식 오류')
            return body

    def collect(self, bbox, rows=300, probe=False):
        bbox = validate_bbox(bbox)
        if not isinstance(rows, int) or not 1 <= rows <= 300:
            raise KhoaError('numOfRows는 1~300 정수여야 합니다')
        points, seen, total, received, pages, duplicates = [], {}, None, 0, 0, 0
        while True:
            page_no = pages + 1
            body = self.page(bbox, page_no, rows)
            count = integer(body.get('totalCount'), 'totalCount')
            if total is None:
                total = count
            if count != total:
                raise KhoaError('수집 중 totalCount 변경: 새 수집 필요')
            if integer(body.get('pageNo'), 'pageNo') != page_no or integer(body.get('numOfRows'), 'numOfRows') != rows:
                raise KhoaError('응답 페이지 번호/페이지 크기 불일치')
            items = items_of(body)
            expected = min(rows, max(0, total - received))
            if len(items) != expected:
                raise KhoaError('totalCount 대비 페이지 건수 불일치')
            for item in items:
                point = point_of(item, bbox)
                coord = (point['lon'], point['lat'])
                if coord in seen:
                    if seen[coord] != point['depth']:
                        raise KhoaError('동일 좌표의 서로 다른 수심: 임의 평균 없이 중단')
                    duplicates += 1
                else:
                    seen[coord] = point['depth']
                    points.append(point)
            received += len(items)
            pages += 1
            if probe or received == total:
                break
            if pages >= 100000:
                raise KhoaError('과도한 페이지 수로 수집 중단')
        return {'bbox': bbox, 'totalCount': total, 'receivedCount': received, 'uniqueCount': len(points),
                'duplicates': duplicates, 'pages': pages, 'calls': self.calls, 'complete': received == total,
                'probeOnly': probe, 'classification': 'A' if total else 'B',
                'result': 'NORMAL_SERVICE + 수심 데이터 존재' if total else 'NORMAL_SERVICE + 0건',
                'points': points}


def save_result(folder, client, result):
    folder.mkdir(parents=True, exist_ok=False)
    raw = folder / 'responses'
    raw.mkdir()
    records = []
    for i, response in enumerate(client.responses, 1):
        name = f'{i:04d}-page-{response["pageNo"]}.txt'
        data = response['text'].encode('utf-8')
        (raw / name).write_bytes(data)
        records.append({'file': 'responses/' + name, 'pageNo': response['pageNo'], 'attempt': response['attempt'],
                        'httpStatus': response['status'], 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    report = {**result, 'source': SOURCE, 'sourceURL': SOURCE_URL, 'endpoint': ENDPOINT,
              'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'responses': records,
              'rawPolicy': '응답 텍스트를 UTF-8로 보존하되 인증정보 반사값은 제거. 요청 URL/헤더/키 저장 안 함.'}
    # 서비스가 키를 응답에 반사한 경우에도 정규화 결과·메타에 남지 않게 한다.
    (folder / 'collection.json').write_text(client.redact(json.dumps(report, ensure_ascii=False, indent=2)), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bbox', nargs=4, type=float, required=True, metavar=('XMIN', 'YMIN', 'XMAX', 'YMAX'))
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--num-of-rows', type=int, default=300)
    parser.add_argument('--probe', action='store_true', help='최초 한 페이지만 호출; 전체 수집으로 보고하지 않음')
    parser.add_argument('--timeout', type=float, default=30)
    parser.add_argument('--retries', type=int, default=3)
    parser.add_argument('--backoff', type=float, default=1)
    args = parser.parse_args()
    client = None
    try:
        validate_bbox(args.bbox)
        if args.output.exists():
            raise KhoaError('출력 폴더가 이미 있습니다. 새 폴더를 지정하세요')
        if not 0 < args.timeout <= 300 or not 0 <= args.retries <= 10 or not 0 <= args.backoff <= 60:
            raise KhoaError('timeout/retries/backoff 범위 오류')
        client = Client(timeout=args.timeout, retries=args.retries, backoff=args.backoff)
        result = client.collect(args.bbox, args.num_of_rows, args.probe)
        save_result(args.output, client, result)
        print(json.dumps({k: v for k, v in result.items() if k != 'points'}, ensure_ascii=False))
        return 0
    except KhoaError as error:
        message = client.redact(str(error)) if client else str(error)
        # 코드 10만으로 위도 제한이라 단정하지 않는다. 원문과 요청 bbox를 보고 별도 판정한다.
        latitude_rejection = client and client.api_error and re.search(r'(?i)latitude|위도|ymin|ymax', message) and re.search(r'(?i)range|범위|초과|이하|이상', message)
        failure = {'bbox': args.bbox, 'classification': 'C' if latitude_rejection else 'D', 'result': message,
                   'calls': client.calls if client else 0, 'complete': False, 'apiError': client.api_error if client else None}
        if client and not args.output.exists():
            save_result(args.output, client, failure)
        print(json.dumps(failure, ensure_ascii=False), file=sys.stderr)
        return 1
    except Exception:
        # 알 수 없는 라이브러리 예외의 repr/traceback에도 URL이 들어갈 수 있다.
        print('KHOA 수집 처리 오류; 상세 예외는 인증정보 보호를 위해 출력하지 않습니다. 호출 ' + str(client.calls if client else 0) + '회', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
