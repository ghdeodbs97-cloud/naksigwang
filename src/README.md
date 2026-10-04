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
| `00_boot.js` | 공통 도구와 매일 갱신 자료(data/*.json) 불러오기 | 12 | `loadJSON` |
| `01_geo.js` | 좌표계(웹 메르카토르)와 해안선 디코딩·육지 판정 | 67 | `decode`, `segDist`, `nearestCoast`, `inLand` |
| `02_state.js` | 화면 상태(S)와 추정 수심 식 | 5 |  |
| `03_userdata.js` | 내 자료: 항·포구 목록, CSV 읽기 | 164 | `readText`, `parseCSV`, `locate`, `parseDeg`, `getLL`, `importPorts`, `saveLocal`, `loadLocal` 외 |
| `04_depth.js` | 수심 자료 층과 보간 | 87 | `layerOf`, `addDepthPt`, `clearLayers`, `crossesLand`, `depthQuery`, `modelDepth`, `estimateAt`, `fmtDepth` 외 |
| `05_struct.js` | 해안 구조물(방파제·부두) 층 | 48 | `addStructSeg`, `addStructLine`, `structDist`, `inStruct`, `structPath` |
| `06_osm.js` | 오픈스트리트맵 해안 지형·이름 | 100 | `decodeOSM`, `osmPath`, `drawOSM`, `osmAt` |
| `07_import.js` | 좌표 정규화, 수심 파일 불러오기, 이 브라우저에 저장 | 121 | `toLatLon`, `pickDepthKey`, `depthVal`, `importDepthRows`, `importDepthJSON`, `findRecords`, `importStructJSON`, `saveDepth` 외 |
| `08_depth_api.js` | 공공 수심 API 불러오기 | 81 | `apiCfg`, `apiSave`, `apiLoad`, `apiParams`, `apiMsg`, `apiFetchTile`, `apiLoadViewport` |
| `09_rocks.js` | 낚시 제한구역과 갯바위 포인트 | 68 | `inBan`, `nearestRing`, `accessAt`, `addRock`, `importRocks`, `saveRocks`, `loadRocks`, `rockInfoHTML` |
| `10_tide.js` | 조석: 예보지점·물때·조위 보간 | 39 | `tideAt`, `getTide` |
| `11_current.js` | 조류 예보(물돌이·최강)와 해 뜨고 지는 시각 | 66 | `loadCrnt`, `crntAt`, `crntDay`, `nearestCrnt`, `flowU`, `sunTimes` |
| `12_fish.js` | 대상어 정보와 물고기 그림 | 71 | `fishSVG` |
| `13_forecast.js` | 포인트 목록, 바람·파고·수온, 날짜 선택, 조석 곡선 | 107 | `kmaGrid`, `wxCell`, `wxAt`, `sstFor`, `buildPoints`, `selectPoint`, `renderDays`, `setDay` 외 |
| `14_bite.js` | 시간별 입질 지수 | 72 | `lightF`, `targetF`, `tempF`, `myF`, `biteAt`, `spark`, `renderBite` |
| `15_view.js` | 지도 표시 보조, 좌표 변환, 화면 보기 상태 | 68 | `drawStations`, `stationAt`, `tmToLL`, `clampView`, `fitBox`, `fitLonLat`, `fitGround`, `zoomAt` |
| `16_terrain.js` | GEBCO 지형 격자와 바탕 지도 그리기 | 265 | `loadGebco`, `gebcoAt`, `makeLUT`, `renderTerrain`, `drawDepthContours`, `drawContours`, `buildPath`, `renderBase` |
| `17_flow.js` | 조류: 해안을 따르는 방향장, 예보 지점 흐름장, 흐름 입자, 예보 화살표 | 102 | `buildFlowField`, `realField`, `spawn`, `stepParticles`, `drawCrnt` |
| `18_section.js` | 단면(측면도) 분석과 그리기 | 177 | `analyzeSection`, `profileFeatures`, `renderSecInfo`, `lineStyle`, `drawSection` |
| `19_overlay.js` | 평면도 위 표시(단면선·핀) | 19 | `drawUI` |
| `20_readouts.js` | 계기판 값 표시 | 45 | `updateReadouts`, `updateCrnt` |
| `21_input.js` | 화면 크기, 마우스·터치·버튼 입력, 이름 검색 | 152 | `resize`, `endPtr`, `updateHover`, `setMode`, `fillNameList`, `findPlace`, `renderBasis` |
| `22_catchlog.js` | 내 조과 기록 | 45 | `localCatches`, `renderLog` |
| `23_main.js` | 예시 단면, 시작 처리, 매 프레임 갱신 | 84 | `exampleSection`, `drawBiteChart`, `apiAutoKick`, `frame` |

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
