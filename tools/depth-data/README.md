# 공식 수심 자료 변환·배포

P2B는 원본 확보와 변환 기반 작업이다. **현재 production에 추가한 고해상도 수심은 0점**이다. `static/depth/manifest.json`은 빈 목록이며 합성 수심은 테스트의 메모리/임시 폴더에서만 만든다. 기존 `static/gebco.js`는 그대로 사용한다.

## 확인한 공식 소스 (2026-10-10)

| 소스 | 실제 확인 | 아직 필요한 것 |
|---|---|---|
| [국토지리정보원 연안해역기본도](https://www.data.go.kr/data/15059725/fileData.do) | 1:25,000, 50 m 이내, 전국, 시간범위 2010~2017. 설명은 SHP, 포털 확장자 표시는 DXF로 서로 다름. 로그인·전용 전송 프로그램 필요 | 원본 SHP 또는 DXF와 도엽별 조사연도/CRS/기준면/범례 |
| [해수부 공동활용체계 수심분포도](https://www.data.go.kr/data/15148924/fileData.do) | 실제 공개 CSV 36,920 bytes, CP949, 1,000행을 다운로드·검사. 열은 `공간정보일련번호`, `공간정보`. 숫자는 행마다 XY 두 개뿐이며 일부 `POINT ((X Y)`는 괄호 형식도 잘못됨. 수심 속성·Z 없음 | 수심이 포함된 원본 GIS 및 필드 정의/CRS. 현재 공개 CSV만으로 수심 복원 불가 |
| [국립해양조사원 자연과학용 수심정보](https://www.data.go.kr/data/15142498/openapi.do) | 공식 설명상 150 m 간격·경위도/수심, JSON/XML, 활용 신청 필요. 기존 `08_depth_api.js`의 범위 API 경로를 유지 | 승인된 API의 실제 응답/활용가이드 또는 경위도·수심 파일. 인증키 없이 호출 성공했다고 보고하지 않음 |
| [GEBCO 2026](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid) | 공식 15 arc-second 픽셀 중심 격자. 기존 저장소에 압축 한국 영역 격자 탑재. 원본 GeoTIFF는 이 작업에서 새로 확보하지 않음 | 필요 시 [영역 다운로드](https://download.gebco.net/)의 elevation GeoTIFF. 기존 변환기는 `tools/data-pipeline/make_gebco.py` |
| [GEBCO TID](https://www.gebco.net/gebco-tid-grid) | 측정/ENC/등심선/보간/중력 기반 등의 셀 출처 코드. 깊이나 정확도 점수가 아님 | **이번에는 미탑재.** 깊이 격자와 같은 2026 버전·범위·원점의 TID NetCDF/GeoTIFF 확보 후 지역 타일로 제공할 후속 작업 |

GEBCO는 평균해면을 가정하나 일부 얕은 구역의 원자료 기준면은 다를 수 있다고 공식 문서가 밝힌다. `MSL_assumed`를 실측 기준면 확정으로 해석하지 않는다. TID 전 지구 NetCDF는 공식 안내상 약 3.5 GB이므로 모바일 초기 자료에 넣지 않는다. 한국 영역 자름과 범주값 최근접 샘플링, 셀 정합 검증이 필요하다. TID가 없는데 직접 측정 출처라고 표시하지 않는다.

해수부 원본 다운로드 연결은 공식 페이지 JSON-LD의 `contentUrl`이다:
`https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_000000003584386&fileDetailSn=1&insertDataPrcus=N`
SHA256: `f6ccfcf2e4afe8508447d229eff2978644166296a218041957baec8a58d7ef05`.
원본은 `raw/mof/depth-distribution.csv`에 로컬 보관했고 Git에는 넣지 않는다. XY만으로 수심이나 EPSG를 추정하지 않는다.

## 사용자가 받아서 놓을 파일

1. 국토정보플랫폼 → 간편지도 검색 → 동해 테스트 지역 영역 지정 → 수치지도 → 연안해역기본도 → 1:25,000 → 로그인 후 다운로드. 거진/아야진·봉포·속초/대포·문암·남애·주문진을 포함하는 도엽과 도엽 설명을 함께 받는다.
2. `tools/depth-data/raw/ngii/<도엽>/`에 **동명 `.shp`, `.shx`, `.dbf`, `.prj`**와 `.cpg`(있으면), 조사연도/기준면/해상도 설명을 함께 둔다. ZIP은 그 폴더에서 풀되 원본도 보관한다. 조사연도를 게시일/다운로드 연도로 대체하지 않는다.
3. DXF만 제공되면 QGIS에서 수심점/등심선 레이어와 Z/수심 속성을 확인하고 원본 CRS를 지정하여 GeoJSON으로 내보낸다. 단순 등고선/지층선/문자 숫자를 수심으로 추정하지 않는다. CRS가 확인되지 않으면 변환·배포하지 않는다.
4. 해수부는 `raw/mof/`에 수심 속성이 포함된 추가 GIS와 필드 설명을 받는다. 현재 공개 CSV에는 수심이 없으므로 제공기관에 수심 원본을 요청해야 한다.
5. BADA 파일은 `raw/bada/`에 경위도·수심 CSV(geometry가 없다면 QGIS에서 점 GeoJSON으로 내보냄) 또는 GeoJSON으로 둔다. API 키는 저장소/로그에 쓰지 않는다. 공공데이터 인증키는 GitHub Secrets만 사용한다.
6. TID를 별도로 받으면 `raw/gebco-tid/`에 둔다. 현재 변환기는 TID 래스터를 지원하지 않는다.

`raw/`는 Git 제외 경로다. 다운로드가 완료돼야 실제 도엽 파일명·필드·CRS·해상도를 확정할 수 있다. 미확보 원본의 구체적 파일명을 만들어 안내하지 않는다.

## 변환

Python 3.10 이상. `python -m pip install -r tools/depth-data/requirements.txt`.

```powershell
# 파일에서 실제 필드와 도형/Z를 먼저 확인 (SHP의 .prj도 함께 읽어 CRS 확인)
python tools/depth-data/convert.py tools/depth-data/raw/ngii/도엽/수심.shp --inspect --encoding cp949
python tools/depth-data/convert.py tools/depth-data/raw/mof/depth-distribution.csv --inspect --encoding cp949 --geometry-field 공간정보

# 아래의 필드·해상도·EPSG·연도는 예시 값을 복사하지 말고 원본 설명에 맞춰 지정한다.
python tools/depth-data/convert.py 원본.shp --output test-output/변환묶음 `
  --encoding cp949 --crs 확인한EPSG --depth-field 확인한수심필드 `
  --source-type coastal_official --dataset-id 고유도엽ID --source "국토지리정보원 연안해역기본도·도엽명" `
  --resolution 확인한미터간격 --vertical-datum unknown --year-field 확인한조사연도필드 `
  --license "공공누리 제1유형" --source-url https://www.data.go.kr/data/15059725/fileData.do

# 여러 지역/출처 묶음의 출처색인을 안전하게 다시 연결
python tools/depth-data/merge.py test-output/변환묶음1 test-output/변환묶음2 --output test-output/depth-release
```

지원 입력: SHP Point/PointZ/MultiPoint/Polyline, GeoJSON Feature/FeatureCollection, CSV의 WKT 또는 GeoJSON geometry/Feature 문자열. `--geometry-field`로 CSV 필드를 지정한다. 수심은 `--depth-field` 또는 `--depth-z` 중 하나를 지정한다. 음수 해저고도는 `--elevation`을 추가해야 양의 깊이로 바뀐다. 양수 육지표고를 abs()로 수심으로 바꾸지 않는다. 폴리곤·수심 없는 XY·비수치·범위 밖 좌표·빈 도형은 오류로 중단하며 기존 배포를 건드리지 않는다.

`--source-field`, `--year-field`, `--datum-field`로 행별 원본 메타를 보존할 수 있다. 원본 전체의 공통 조사연도가 확인되면 `--survey-year`를 쓴다. 연도 미확인은 null, 기준면 미확인은 `unknown`이며 높은 신뢰도로 표시하지 않는다. 1:25,000 **지도 축척을 25 m 자료해상도라고 해석하지 않는다**. 확인한 측정/격자/등심선 샘플링 간격을 명시한다. 근거가 없으면 발행을 보류한다.

원본 꼭짓점은 경위도 float 정밀도로 보존한다. 일정 수심의 등심선이 길면 자료해상도 이상 간격에서만 선 위의 위치를 추가한다. 등심선의 모든 결과는 `interpolated=true`다. Z가 변하는 선은 원래 꼭짓점만 보존한다. 면 사이를 채우거나 가짜 측정점을 만들지 않는다. SHP의 원본 Z를 버리는 pyshp GeoJSON 변환은 별도로 복원한다.

검수 후 **새 변환 결과 전체**를 `static/depth/`에 발행한다. manifest와 타일을 같은 커밋에 넣고 기록 탭 출처도 갱신한다. 서로 다른 시점의 manifest와 타일을 부분 복사하지 않는다. merge 도구는 같은 자료집ID인데 메타가 다르면 거절한다. `data/*.json`은 건드리지 않는다.

## 정적 형식과 비용

- version 1 manifest: `datasets` 출처사전, `tiles` 파일/bbox/점수/byte수, 원본 hash·CRS·변환 설정 provenance.
- 0.1도 지역 묶음, 밀집 구간은 최대 12,000점/1 MiB JSON으로 분할. JSON은 브라우저에서 바로 읽으며 GitHub Pages 전송 압축을 사용할 수 있다. 별도 gzip 해제 비용 없음.
- 점: `[lon, lat, depthM, datasetIndex, surveyYear, interpolated]`. 좌표·수심을 소수점 반올림하지 않는다. `datasets`에 출처유형·출처명·간격·기준면·이용조건·URL 보존.
- 전국 원본을 앱 초기 스크립트에 넣지 않는다. 초기에는 작은 manifest만 읽는다. viewport/단면의 0.6도 이하 범위를 검색반경만큼 넓혀 인접 타일을 포함한다.
- 한 번에 12타일·60,000점·JSON 8 MiB 이하, 순차 요청 1개. 초과하면 일부를 임의로 쓰지 않고 확대할 때까지 기존 fallback 사용. HTTP/형식/크기 실패도 앱 시작을 막지 않는다.
- 다른 지역 이동 시 기존 cache/색인 해제. 지역 색인은 1,000 Mercator m 격자. JS 객체 실제 heap은 엔진에 따라 JSON보다 크므로 8 MiB를 총 메모리 8 MiB로 해석하지 않는다. 고밀도 실자료 확보 후 모바일 heap/시간 측정이 남아 있다.
- 현재 manifest는 39 bytes 이하(실제 크기는 P2B 보고서 참조), 데이터 타일 0개. 기존 GEBCO 전송 2,591,809 bytes와 압축 해제된 `Int16` 고도+`Uint8` 음영은 유지한다.
- 변환·병합한 타일 파일명에는 내용 hash를 넣어 이전 타일과 구분한다. manifest는 HTTP 캐시 재검증으로 읽고 세션 내 한 번 사용한다. 실패하면 다음 페이지 시작에서 재시도. 타일 실패는 범위 이동 후 재시도. 배포 때 manifest와 타일을 함께 발행한다.
- 조회의 수치 계산은 viewport와 독립이다. lazy load가 완료되기 전에는 기존 자료가 먼저 표시되고 완료 후 단면/커서를 갱신한다. 비교 검사는 동일한 자료 준비 상태에서 수행해야 한다.

## 기존 파이프라인과 연결

변경 전: `07_import.js`에서 CSV/GeoJSON → 경위도 또는 `tmToLL`의 휴리스틱 투영 변환 → `addDepthPt` → type별 배열/공간색인 → `depthQuery`의 최대 6점 역거리제곱 보간. 이 브라우저 `ps_depth2`에 저장하며 이전 형식은 연도를 잃었다. BADA는 `08_depth_api.js`에서 0.03도 범위를 직접 요청해 동일 배열에 적재한다. GEBCO는 `16_terrain.js`의 별도 압축 격자와 쌍선형 보간. `18_section.js`는 A/B Mercator 좌표를 샘플링해 육지 제외 후 `depthQuery || modelDepth`를 사용한다. 커서는 `21_input.js`에서 같은 순서로 조회한다. `20_readouts.js`는 단면 최대값/공공자료 비율을 표시한다. 색 배경은 Canvas 반해상도 해안거리 근사값이므로 정밀한 수심 측정 화면이 아니다.

변경 후: 오프라인 변환은 명시적 CRS로 WGS84로 바꾸며 투영을 추측하지 않는다. `04b_depth_tiles.js`는 타일을 별도 bounded cache로 유지하여 로컬 import 배열/저장공간에 넣지 않는다. `depthQuery`가 두 저장소의 후보를 같은 우선순위로 선택하므로 커서와 A/B 엔진이 함께 공식 수심을 사용한다. 후보는 **같은 type·자료집·기준면 안에서만** 보간하며 다른 기준면 숫자를 합치지 않는다. 공통 결과 객체와 옛 속성을 함께 반환한다. 로컬 저장에도 연도/기준면/provenance를 보존한다.

공식자료 없음 → 해안 800 m 미만 경사 추정 → 800 m 이상 GEBCO(바다 격자인 경우) → 격자 누락/육지면 추정. 기존 150~800 m의 GEBCO+가정값 혼합을 제거했다. 이 경계에서 값이 뛰어 보일 수 있다. 기준면 변환/검증 없이 부드럽게 섞어 숨기지 않는다. 단면은 다른 자료집·기준면 사이 선 연결/지형 특징 평활을 중단하고 이유를 표시한다. 육지 마스크는 조류/색 배경용이며 `crossesLand`는 지도 좌표의 `inLand`로 판정(약 5 m 샘플)한다. 모두 바다인 A/B에는 해안을 만들지 않는다.

## 결과 schema와 미래 확장

`depthResult`의 공통 속성은 `depth, sourceType, source, resolution, distanceToSource, interpolated, estimated, confidence, confidenceReason, verticalDatum, surveyYear, measurementCount`이다. 단위는 깊이/거리/간격 모두 m. resolution은 정확도 오차가 아니다. 알 수 없는 값은 null/unknown. `contributingSources`는 기여한 원본별 연도·거리·해상도·등심선 여부를 보존한다. `surveyYear`는 가까운 점의 연도, `measurementCount`는 현재 보간에 기여한 레코드 수(현장 측정 횟수나 원격 격자 제조에 쓰인 측량 개수가 아님)다.

sourceType: `coastal_official`, `mof_contour`, `chart_public`, `bada`, `gebco`, `model_estimate`. `user_verified`, `crowd_verified`, `crowd_pending` 문자열은 향후 검수 계층에서 확장 가능하다. 기존 로컬 `survey` 입력은 동작 호환상 우선권을 유지하되 **crowd_pending·낮음**으로 표시한다. 파일을 입력했다고 검수 완료로 승격하지 않는다. 공식 타일 로더는 검수되지 않은 crowd 유형을 받지 않는다. 향후 공식/공개 DB는 검수 완료 자료만 새로운 provider로 등록해야 한다.

상세 설계는 [future-records.md](future-records.md). 현 시점에는 서버/로그인/사진 업로드/집계 알고리즘을 만들지 않는다.

## 위성지도 확장

`depthQuery(mx,my)`, `depthPrepareAreas([[west,south,east,north],...])`와 단면은 베이스맵 종류를 몰라도 재사용한다. `scheduleDepthArea`의 toM/cw/ch 어댑터, `21_input`의 화면→지도 변환, `16_terrain` 배경 그리기만 새 지도 viewport/레이어에 맞춰 교체한다. A/B는 Mercator 좌표이므로 새 SDK의 경위도를 mxOf/myOf로 변환한다. 기본지도/위성사진/수심 오버레이를 별도 레이어로 구성할 수 있다. 현재 색 배경의 저해상도 근사 격자를 정식 depthQuery 결과와 동일하다고 표시하지 않는다.
