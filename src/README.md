# 앱 코드 지도 (`src/`)

`build.py`가 `src/app/*.js`를 **번호 순서대로 이어 붙여** 하나의 `async` 함수로 감싼 뒤 `src/template.html`에 넣어 `index.html`을 만듭니다.
모든 파일이 같은 함수 안에 있으므로 다른 파일의 변수·함수를 import 없이 그대로 쓸 수 있습니다. 대신 **파일 순서가 곧 실행 순서**입니다:
위쪽 파일의 최상위 코드는 아래쪽 파일에서 선언한 `const`/`let`을 쓸 수 없습니다(함수 안에서 나중에 부르는 것은 괜찮음).

## 고치는 순서

1. `src/app/` 또는 `src/template.html` 수정
2. `python build.py` → `index.html` 생성 (`missing ids: []` 확인)
3. `python tests/smoke.py` → `통과` 확인
4. 커밋·푸시하면 GitHub Pages가 1~3분 뒤 반영

## 파일별 역할

| 파일 | 하는 일 | 줄 수 | 주요 함수 |
|---|---|---|---|
| `00_boot.js` | 조석 날짜·지점 검증, 선택 자료 실패 복구, 이전 자료 사용 안내 | 101 | `loadJSON`, `validBootData`, `bootNotice` |
| `01_geo.js` | 좌표계(웹 메르카토르)와 해안선 디코딩·육지 판정 | 67 | `decode`, `segDist`, `nearestCoast`, `inLand` |
| `02_state.js` | 화면 상태(S)와 추정 수심 식 | 5 |  |
| `03_userdata.js` | 내 자료: 항·포구 목록, CSV 읽기 | 164 | `readText`, `parseCSV`, `locate`, `parseDeg`, `getLL`, `importPorts`, `saveLocal`, `loadLocal` 외 |
| `04_depth.js` | 자료집·기준면을 분리한 수심 보간과 공통 출처 schema | 가변 | `layerOf`, `addDepthPt`, `clearLayers`, `crossesLand`, `depthQuery`, `depthResult`, `modelDepth`, `estimateAt`, `fmtDepth`, `describeDepth`, `depthDetails` |
| `04b_depth_tiles.js` | 공식 수심 지역 타일의 제한된 캐시·색인·실패 fallback | 가변 | `depthReadJSON`, `depthManifest`, `depthPrepareAreas`, `officialDepthCandidates`, `scheduleDepthArea` |
| `05_struct.js` | 해안 구조물(방파제·부두) 층 | 48 | `addStructSeg`, `addStructLine`, `structDist`, `inStruct`, `structPath` |
| `06_osm.js` | 오픈스트리트맵 해안 지형·이름 | 100 | `decodeOSM`, `osmPath`, `drawOSM`, `osmAt` |
| `07_import.js` | 좌표 정규화, 수심·연도·기준면·보간 출처 불러오기와 로컬 보존 | 가변 | `toLatLon`, `pickDepthKey`, `depthVal`, `importDepthRows`, `importDepthJSON`, `findRecords`, `importStructJSON`, `saveDepth`, `loadDepth` |
| `08_depth_api.js` | 공공 수심 API 불러오기 | 81 | `apiCfg`, `apiSave`, `apiLoad`, `apiParams`, `apiMsg`, `apiFetchTile`, `apiLoadViewport` |
| `09_rocks.js` | 낚시 제한구역과 갯바위 포인트 | 68 | `inBan`, `nearestRing`, `accessAt`, `addRock`, `importRocks`, `saveRocks`, `loadRocks`, `rockInfoHTML` |
| `10_tide.js` | 조석: 예보지점·물때·조위 보간 | 40 | `tideAt`, `getTide` |
| `11_current.js` | 조류 예보(물돌이·최강)와 해 뜨고 지는 시각 | 66 | `loadCrnt`, `crntAt`, `crntDay`, `nearestCrnt`, `flowU`, `sunTimes` |
| `12_fish.js` | 대상어 정보와 물고기 그림 | 71 | `fishSVG` |
| `13_forecast.js` | 포인트 목록, 바람·파고·수온, 날짜 선택, 조석 곡선 | 119 | `kmaGrid`, `wxCell`, `wxAt`, `sstForLocation`, `sstFor`, `buildPoints`, `selectPoint`, `renderDays`, `setDay` 외 |
| `14_bite.js` | 포인트별 입질 조건점수·자료 신뢰도·이유, 실제 시계의 분 단위 갱신 | 107 | `lightF`, `targetF`, `biteTemperature`, `biteDataQuality`, `myF`, `biteEvalAt`, `biteAt`, `biteReasons`, `spark`, `renderBite` |
| `15_view.js` | 지도 표시 보조, 좌표 변환, 화면 보기 상태 | 68 | `drawStations`, `stationAt`, `tmToLL`, `clampView`, `fitBox`, `fitLonLat`, `fitGround`, `zoomAt` |
| `16_terrain.js` | GEBCO 지형 배경과 지역 수심 준비 요청 (기준면 미확인 혼합 없음) | 가변 | `loadGebco`, `gebcoAt`, `makeLUT`, `renderTerrain`, `drawDepthContours`, `drawContours`, `buildPath`, `renderBase` |
| `17_flow.js` | 조류: 해안을 따르는 방향장, 예보 지점 흐름장, 흐름 입자, 예보 화살표 | 102 | `buildFlowField`, `realField`, `spawn`, `stepParticles`, `drawCrnt` |
| `18_section.js` | 공식 수심을 함께 쓰는 A→B 단면, 기준면 경계의 특징분석 중단 | 가변 | `analyzeSection`, `profileFeatures`, `renderSecInfo`, `lineStyle`, `drawSection` |
| `18b_shore.js` | 실제 해안 교차가 있을 때만 해안 종류 판정 | 가변 | `osmDist`, `enclosed`, `classifyShore`, `setShore`, `autoShore` |
| `19_overlay.js` | 평면도 위 표시(단면선·핀) | 19 | `drawUI` |
| `20_readouts.js` | 계기판 값 표시 | 45 | `updateReadouts`, `updateCrnt` |
| `20b_today.js` | 「오늘」 탭: 선택한 포인트의 오늘·지금 요약, 연속된 좋은 시간 구간 | 70 | `goodHourRanges`, `renderToday`, `drawToday` |
| `21_input.js` | 화면·터치·검색 입력과 간단 수심/출처 상세 표시 | 가변 | `resize`, `endPtr`, `updateHover`, `setMode`, `fillNameList`, `findPlace`, `renderBasis` |
| `22_catchlog.js` | 내 조과 기록 | 45 | `localCatches`, `renderLog` |
| `23_main.js` | 예시 단면, 시작 처리, 매 프레임 갱신 | 91 | `exampleSection`, `drawBiteChart`, `apiAutoKick`, `frame` |
| `24_tabs.js` | 아래(휴대폰)·위(넓은 화면) 탭 전환. 주소 끝 #today · #map · #tide · #bite · #log 로 바로 열 수 있다 | 20 | `showTab` |

## 화면 구조 (3단계)

탭 5개: `#v-today`(오늘 요약) · `#v-map`(평면도·측면도) · `#v-tide`(물때·예보) · `#v-bite`(어종별 입질 지수) · `#v-log`(조과 기록·자료 불러오기·출처).
주소 끝에 `#map`처럼 붙이면 그 탭으로 열린다. 매 프레임 그리기는 보이는 탭 것만 한다(`23_main.js`의 `frame`).

## 공통으로 쓰는 값

| 이름 | 만드는 곳 | 내용 |
|---|---|---|
| `TIDE`, `OBS`, `WXG`, `META` | `00_boot.js` | `data/*.json` (수집기가 매일 갱신) |
| `S` | `02_state.js` | 화면 상태: 선택 날짜(`day`), 시각(`t`), 레이어, 단면 A·B 등 |
| `STATIONS` | `10_tide.js` | 조석 예보지점 166곳 (날짜별 만조·간조, 물때, 물때 세기) |
| `POINTS` | `13_forecast.js` | 항·포구(5 km 간격)와 갯바위, 각자 가장 가까운 예보지점 번호 |
| `CR` | `11_current.js` | 조류 예보 199개 지점 (`static/crnt.js` 해제) |
| `FISH` | `12_fish.js` | 대상어 18종: 시즌·해역·물때 선호·그림 |

## 고정 자료 (`static/`)

`coast.js` 해안선 · `ports.js` 항·포구 716곳 · `rocks.js` 갯바위 1,076곳 · `ban.js` 낚시 제한구역 · `access.js` 차량 접근 섬 · `gebco.js` 지형 격자 · `osm.js` 방파제·등대 등 · `crnt.js` 조류 예보(2026년) · `fish_temp.js` 어종별 서식 수온

## P0 데이터 보호

수집기는 fresh 90% 이상과 모든 요청의 fresh/fallback 복구를 함께 요구합니다. 하나라도 복구되지 않으면 기존 정상 파일 전체를 보존합니다. 메타의 `unrecovered`와 `kept_previous_incomplete`로 원인을 구분합니다. `generated`는 수집 실행 시각입니다. 화면은 보존·복구 상태와 24시간 이상 지난 실행/기상 발표를 안내합니다. 수온은 현재 시각 기준 24시간 이내 관측만 씁니다.

기상 자료의 `cells` 형식은 유지하고 `bases[격자]`에 실제 발표 시각을 저장합니다. 구형 파일은 전역 `base`로 대체합니다. 날짜가 빠진 조석 지점은 제외하고, 현재 날짜가 없는 조석 파일은 명확한 안내 후 시작을 중단합니다.

## P1 입질 조건과 자료 신뢰도

`biteEvalAt(fish, pt, st, day, h)`는 `score`, `rawScore`, `confidence`, `confidenceLevel`, `factors`, `sources`를 반환합니다. `biteAt`은 score만 반환하는 호환 함수입니다. 기여분 합계에 내 조황기록 보정을 적용하고 1~99점으로 제한·반올림합니다(시즌·해역 부적합은 0점). 반올림이나 조건 기여의 상쇄로 같은 정수 점수가 나올 수 있으며 위치별 상수는 없습니다.

수온은 실제 좌표 캐시와 50 km/24시간 제한을 사용합니다. 자료 신뢰도 배점은 수온 25·풍속 15·파고 20·조류 25·조석 15입니다. 수온 거리/나이와 미래 날짜, 인접 격자/시간 보간/이전 발표, P0 파일 단위 fallback/stale 메타에 따라 감쇠합니다. 조류 추정은 7점입니다. 등급 경계는 높음 80·보통 55이며 적중 확률이 아닙니다. 원천 누락은 기여 0점이고 내 조황기록은 신뢰도와 무관합니다.

`python tests/test_bite_confidence.py`는 앱에 검사 함수를 테스트 중에만 주입하여 실제 동해 항 5곳을 위도 구간별로 고르고(서로 15 km 이상) 동일 시각·감성돔 조건을 비교합니다. 원점수와 기여분의 차이를 검사하며 모든 점수가 고유해야 한다고 강제하지 않습니다. `P1_OUTPUT`으로 JSON 보고서와 모바일/PC 5개 탭 화면을 저장할 수 있습니다.
