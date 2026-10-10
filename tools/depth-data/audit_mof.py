"""해수부 공개 CSV의 실제 필드·좌표 차원을 검사한다. 수심을 만들거나 WKT를 복구하지 않는다."""
import csv
import hashlib
import json
from pathlib import Path
import re
import sys

path=Path(sys.argv[1])
with path.open(encoding='cp949',newline='') as file:
    reader=csv.DictReader(file);columns=reader.fieldnames;rows=list(reader)
values=[row['공간정보'] for row in rows]
valid=re.compile(r'^POINT\s*\(\s*[-+]?\d+(?:\.\d+)?\s+[-+]?\d+(?:\.\d+)?\s*\)$',re.I)
result={'sourceURL':'https://www.data.go.kr/data/15148924/fileData.do',
    'downloadURL':'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003584386&fileDetailSn=1&insertDataPrcus=N',
    'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
    'encoding':'cp949','rows':len(rows),'columns':columns,
    'geometryLabels':sorted(set(v.split('(')[0].strip() for v in values)),
    'numericValuesPerGeometry':sorted(set(len(re.findall(r'[-+]?\d+(?:\.\d+)?',v)) for v in values)),
    'wellFormedPointXY':sum(bool(valid.fullmatch(v.strip())) for v in values),
    'malformedPointText':sum(not bool(valid.fullmatch(v.strip())) for v in values),
    'firstRecord':rows[0],
    'depthAttributePresent':any(re.search(r'depth|수심|valsou|valdco|elevation',c,re.I) for c in columns),
    'depthZPresent':any(len(re.findall(r'[-+]?\d+(?:\.\d+)?',v))>2 for v in values), 'productionImported':False,
    'limitation':'공개 파일에는 수심 필드/Z가 없고 일부 POINT의 괄호가 잘못되어 있어 수심 자료로 사용할 수 없음. CRS도 원본 정의 확인 필요.'}
print(json.dumps(result,ensure_ascii=False,indent=2))
