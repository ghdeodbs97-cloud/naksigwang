# P2C-1: KHOA 실제 수집·검증 절차

키는 **환경변수 `KHOA_SERVICE_KEY`에서만** 읽는다. 키를 명령 인자·소스·.env·JSON·HTML·보고서에 넣지 않는다. 이 문서의 명령에 키 값은 없다. 프로세스 환경변수를 지정한 셸에서 수집기를 실행해야 한다. 사용자 환경변수 설정 후에는 기존 앱/셸이 값을 물려받지 못할 수 있으므로 새 프로세스가 필요하다. 키는 채팅에 보내지 않는다.

공식 근거: [자연과학용 수심정보 조회](https://www.data.go.kr/data/15142498/openapi.do). 150 m 간격의 해양수치모델용 자료이며 수심측량자료를 이용해 제작되었다. **간격 150 m와 수직 정확도는 다르다. 원본 측심점으로 표시하지 않는다.** 이용조건은 공공누리 제1유형이다.

## 실제 호출 순서

Python 의존성은 기존 CI와 동일하며 `requests` 및 `requirements.txt`가 필요하다. 아래 출력 폴더는 기존 `.gitignore`의 `tools/depth-data/raw/*` 규칙으로 제외된다. 동일 출력 폴더를 덮어쓰지 않으므로 재수집 시 새 이름을 쓴다.

```powershell
# 아야진: 최초 한 번만 요청 (재시도 0), 최대 10개. probe는 전체 수집으로 간주하지 않는다.
python tools/depth-data/fetch_khoa.py --bbox 128.545 38.260 128.580 38.285 --num-of-rows 10 --probe --retries 0 --output tools/depth-data/raw/khoa/ayajin-probe

# 아야진에서 A가 확인된 경우 속초/거진도 작은 범위로 각각 별도 확인한다.
python tools/depth-data/fetch_khoa.py --bbox 128.585 38.200 128.615 38.225 --num-of-rows 10 --probe --retries 0 --output tools/depth-data/raw/khoa/sokcho-probe
python tools/depth-data/fetch_khoa.py --bbox 128.450 38.430 128.480 38.455 --num-of-rows 10 --probe --retries 0 --output tools/depth-data/raw/khoa/geojin-probe

# 주문진/남애 전체 수집. 11,018건이 실제 응답에서도 같다면 37페이지, 마지막 218건.
python tools/depth-data/fetch_khoa.py --bbox 128.7 37.8 128.95 38.0 --output tools/depth-data/raw/khoa/jumunjin-namae
```

아야진 결과는 A: 정상+자료 있음, B: 정상+0건, C: 위도 범위를 명시적으로 거부, D: 기타 오류로 구분한다. 코드 10만으로 C라고 판단하지 않는다. C 자동 구분은 오류 원문이 위도와 범위를 명시할 때만 하며, 최종 보고에서 원문을 확인한다. B·인증 실패·네트워크 오류로 북위 38도 이상 지원 여부를 단정하지 않는다. 가이드의 39.19335~40.19335 예시와 웹 UI의 30~38도 제한은 사용자가 알려준 불일치이며 **API 실호출 전 어느 쪽도 서비스 지원 범위로 확정하지 않는다.**

각 폴더에는 인증정보를 제거한 `responses/*.txt`와 정규화 점/검증 메타의 `collection.json`을 보관한다. 원 응답의 `lat/lot/dpwt`는 응답 텍스트에 유지하고 정규화 결과에서만 `lot→lon`, `dpwt→depth`로 매핑한다. HTTP 재시도를 포함한 실제 시도 횟수는 `calls`, 정상 페이지 수는 `pages`다. `receivedCount=totalCount`, `uniqueCount+duplicates=receivedCount`를 검사한다. 동일 좌표에 다른 수심이 나오면 임의 평균하지 않고 중단한다. 응답 건수·페이지 번호·페이지 크기·totalCount 변경도 검사한다. 오류 응답은 가능한 한 키를 제거해 보존한다. 네트워크 오류의 URL/예외 원문은 출력하지 않는다.

## 변환·비교 (실제 전체 수집 후에만)

```powershell
python tools/depth-data/convert_khoa.py tools/depth-data/raw/khoa/jumunjin-namae/collection.json --output test-output/khoa-tiles --dataset-id khoa-jumunjin-namae-수집일 --vertical-datum "평균해면하" --datum-note "공식 웹 조회 화면의 수심(m)(평균해면하) 표기를 확인한 URL/확인일"
python tools/depth-data/compare_khoa.py tools/depth-data/raw/khoa/jumunjin-namae/collection.json --baseline-ref 9143465 --output test-output/khoa-comparison.json
```

위 datum 예시는 사용자가 제공한 UI 표기다. 실제 발행 전에 공식 화면/문서의 표기를 확인하고 근거를 남긴다. 미확인이면 `--vertical-datum unknown`과 미확인 사유를 쓰며 `MSL/DL/LAT`로 임의 번역하지 않는다. API에 조사연도가 없으면 null이다. 날짜는 수집일이지 조사일이 아니다. 북쪽 probe는 부분 수집이므로 변환/비교용 전체 자료로 사용할 수 없다. 성공한 해당 bbox를 `--probe` 없이 다시 수집한다.

변환기는 기존 P2B `version:1`, 출처사전과 점 `[lon,lat,depth,datasetIndex,year,interpolated]` 형식을 유지한다. 출처유형은 `khoa`, 150 m 간격/공식 출처/원문 기준면/요청 bbox/수집 hash/필드 매핑을 기록한다. 원 API 격자점에는 추가 공간 보간을 하지 않는다. `estimated:true`는 수치모델용 격자자료라는 뜻이며 현장 측심 실측으로 승격하지 않는다.

비교 도구는 저장소 실제 포인트(주문진·남애·아야진·속초·거진) 중 수집 bbox 안의 기준점에서 가장 가까운 KHOA 점을 고른다. 그 **KHOA 점과 동일한 좌표**에서 앱의 기존 수심을 조회해 차이를 기록한다. `sourcePointDistanceM`는 기준점에서 KHOA 점까지 거리, `comparisonCoordinateDistanceM=0`은 KHOA/기존 조회 간 좌표 차이다. 육지로 판정되는 점은 기존 수심과 차이를 null로 남긴다. `--baseline-ref`의 과거 index를 메모리에서 실행하고 manifest를 빈 검사 route로 차단해 현재 KHOA가 기준값에 섞이지 않게 한다. 변환/비교 결과는 검수 전 Git 제외 경로에만 둔다.

## 앱 통합 정책

현재 앱의 출처 순위·기준면 격리·육지 통과 차단을 유지한다. KHOA를 BADA와 같은 자연과학용 자료 계층으로 연결하되 `sourceType:khoa`와 자료집 ID를 유지해 기존 BADA와 섞지 않는다. GEBCO/모델보다 먼저 조회한다. 요청 bbox 외부는 후보에서 제외하고, 지역 타일 bbox만으로 실제 자료 범위를 넓히지 않는다. 자료가 없는 틈에서도 가장자리 외삽을 금지하도록 실제 격자 coverage/셀 검증이 필요하다. 단순 bbox 확인만으로 이 조건을 충족했다고 주장하지 않는다.

실제 원본 확인 후 앱 로더에 khoa 유형을 허용하고 타일을 발행했다. 후보는 225 m 안, 동일 자료집·기준면, 육지 통과 제외 조건을 유지한다. 요청 bbox 내부이면서 최대 6개 유효 후보의 볼록껍질 안일 때만 기존 IDW를 사용한다. 따라서 가장자리 밖/자료 없는 큰 구역을 수심으로 채우지 않으며, 조건을 만족하지 않으면 GEBCO/모델로 돌아간다. 정확히 원 격자점이면 그 값을 사용한다. 이 보수적 조건으로 해안·타일 경계에서 KHOA가 있어도 fallback이 선택될 수 있다. 해안선 오류·작은 누락 구역·격자 제조 방식/수직 정확도는 별도 검증이 필요하다. 사용자 기본 표시(수심/출처/신뢰도)와 기술 상세보기 구조를 재사용한다.

## CI

`python tests/test_khoa_fetch.py`: 11,018건/37페이지/마지막 218건, 300건 경계, 단일 item/빈 자료/중복·충돌, API/HTTP/네트워크 오류, 재시도, 키 미설정·stdout/stderr/원본 마스킹·URL 인코딩, lot 매핑/숫자 검증, 기준면/coverage 보존. CI에는 실서비스 키를 전달하거나 실제 API를 호출하지 않는다.

## P2C-2 작은 연안 bbox 묶음

호출 전 계획은 `tests/p2c2_plan.json` / `tests/P2C2_PLAN.md`, 기존 영역과 요청 범위의 좌표 그림은 `tests/p2c2_coverage_plan.svg`다. 기존 bbox를 차감하며 새 자료집의 `coverageBoxes`가 있으면 실제로 성공한 조각만 차감한다. 원본 좌표/수심 precision은 유지한다. 지역 중심 전체 행정구역이나 먼바다 전역을 요청하지 않는다.

```powershell
# 키를 명령 인자에 쓰지 않는다. KHOA_SERVICE_KEY 환경변수만 사용.
python tools/depth-data/fetch_khoa_batch.py tests/p2c2_plan.json --cache tools/depth-data/raw/khoa-east
# 동일 명령 재실행으로 성공 페이지와 명시적 NODATA 응답을 재사용한다.
# 값 검증 실패 bbox도 원본 전체 페이지를 보존하며 발행용 collection은 생성하지 않는다.
# 종료 코드 1은 실패/미시도 bbox가 남았다는 뜻이다. batch.json에 누적 호출과 실패 내역이 있다.

# 새 출력 폴더에서 검수. 기존 타일을 덮어쓰는 명령이 아니다.
python tools/depth-data/publish_khoa_coverage.py --plan tests/p2c2_plan.json --cache tools/depth-data/raw/khoa-east --output test-output/east-release --report test-output/east-publication.json --allow-partial
python tools/depth-data/audit_east_coverage.py
```

`--allow-partial`은 실패 bbox를 검수한 뒤 성공 영역만 발행하려는 명시적 선택이다. 옵션이 없으면 미완료 bbox가 있는 발행을 거부한다. 출력 보고서의 `unpublishedJobs`를 반드시 확인한다. NODATA_ERROR는 정상 0건으로 바꾸지 않는다. 재검증하려면 해당 ID의 보존 응답을 별도 위치에 백업한 뒤 새 캐시 루트를 사용한다. 일상 재개에서 오류 응답을 자동 삭제/재호출하지 않는다. 기존 응답/페이지 hash가 다르면 자동 복구하지 않고 검수를 요구한다. 묶음 호출 상한은 재시도 포함 1,000회이며 다른 작업의 당일 사용량은 별도 확인해야 한다.

새 타일만 `east/`에 추가하고 기존 타일 파일/hash/자료집 인덱스를 그대로 보존한다. 겹친 좌표·기준면의 동일 수심은 제거하며 수심 충돌은 중단한다. 이미 발행한 자료에 재발행하면 신규 점 0개, manifest를 포함한 모든 JSON bytes가 동일하다. 실제 수집 조각/수집 hash/자료집 ID가 provenance에 남는다. 원본 응답은 Git 제외 경로에만 둔다.

앱은 기존 캐시 상한과 viewport lazy loading을 유지하며 진행 중 같은 파일 요청을 공유한다. `coverageBoxes` 내부와 유효 후보 볼록껍질 안에서만 기존 보간을 허용한다. 자료집/기준면 격리와 육지 통과 차단은 유지한다. 자료가 가까워도 KHOA를 사용할 수 없는 해안 경계에서는 기존 GEBCO/모델 fallback이 남는다.

최종 실측/미탑재 영역/48개 대표점/모바일 로딩/JS heap은 `tests/P2C2_REPORT.md`와 `tests/p2c2_validation.json`에 있다. 실기기 전체 메모리는 미측정이다. `tests/test_khoa_coverage.py`, `tests/test_khoa_coverage_browser.py`는 합성 응답/메모리 route로만 검사하며 CI에서 실행한다.
