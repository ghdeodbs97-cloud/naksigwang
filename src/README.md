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
| `04_depth.js` | 자료집·기준면 분리 보간·KHOA 외삽 차단·출처/자료점 거리 상세 | 가변 | `layerOf`, `addDepthPt`, `clearLayers`, `crossesLand`, `depthQuery`, `depthInsideSupport`, `depthResult`, `modelDepth`, `estimateAt`, `fmtDepth`, `describeDepth`, `depthDetails` |
| `04b_depth_tiles.js` | KHOA 실제 수집 bbox 묶음 검증·지역 타일 lazy loading·요청 공유·제한 캐시/퇴거·실패 fallback | 가변 | `depthReadJSON`, `depthManifest`, `depthTileDocument`, `depthPrepareAreas`, `officialDepthCandidates`, `scheduleDepthArea` |
| `05_struct.js` | 해안 구조물(방파제·부두) 층 | 48 | `addStructSeg`, `addStructLine`, `structDist`, `inStruct`, `structPath` |
| `06_osm.js` | 오픈스트리트맵 해안 지형·이름 | 100 | `decodeOSM`, `osmPath`, `drawOSM`, `osmAt` |
| `07_import.js` | 좌표 정규화, 수심·연도·기준면·보간 출처 불러오기와 로컬 보존 | 가변 | `toLatLon`, `pickDepthKey`, `depthVal`, `importDepthRows`, `importDepthJSON`, `findRecords`, `importStructJSON`, `saveDepth`, `loadDepth` |
| `08_depth_api.js` | 공공 수심 API 불러오기 | 81 | `apiCfg`, `apiSave`, `apiLoad`, `apiParams`, `apiMsg`, `apiFetchTile`, `apiLoadViewport` |
| `09_rocks.js` | 낚시 제한구역과 갯바위 포인트 | 68 | `inBan`, `nearestRing`, `accessAt`, `addRock`, `importRocks`, `saveRocks`, `loadRocks`, `rockInfoHTML` |
| `10_tide.js` | 조석: 예보지점·물때·조위 보간 | 40 | `tideAt`, `getTide` |
| `11_current.js` | 조류 예보(물돌이·최강)와 해 뜨고 지는 시각 | 66 | `loadCrnt`, `crntAt`, `crntDay`, `nearestCrnt`, `flowU`, `sunTimes` |
| `12_fish.js` | 대상어 39개 표시명·사진 매핑, 모델 사용 가능 판정, 이미지 실패 대체 그림 | 가변 | `fishHasBiteModel`, `fishPicture`, `fishSVG` |
| `12b_ecology.js` | 39개 표시명의 생태 프로필·12개월 단계값·우럭 별칭 공유·연속 적합도 | 가변 | `ecologySeason`, `ecologyRange`, `ecologyLight`, `ecologyLightName` |
| `12c_habitats.js` | 39종 주 서식지·낚시 포인트 유형 문구와 별칭 공유 | 가변 | `FISH_HABITAT_TEXT` |
| `13_forecast.js` | 포인트 목록, 바람·파고·수온, 날짜 선택, 조석 곡선·이동 성공 후 선택 확정 | 가변 | `kmaGrid`, `wxCell`, `wxAt`, `sstForLocation`, `sstFor`, `buildPoints`, `selectPoint`, `renderDays`, `setDay` 외 |
| `13b_environment.js` | 기존 수심·OSM·갯바위·항 좌표의 환경 추출, 자료 버전·좌표별 64개 제한 캐시 | 가변 | `getPointEnvironment` |
| `13c_bite_layers.js` | 서식 0~100·선택 날짜 조건 0~100의 분리와 45:55 조합 | 가변 | `biteLayerScores`, `combineBiteScores` |
| `14_bite.js` | V2.1 서식·오늘 조건·개인 기록 조건점수, 내부 신뢰도·기여 이유, 렌더 안의 공통 예보 공유 | 가변 | `biteTemperature`, `biteDataQuality`, `myF`, `biteContext`, `biteEvalAt`, `biteAt`, `biteReasons`, `spark`, `renderBite` |
| `15_view.js` | 지도 표시 보조, 좌표 변환, 화면 보기 상태 | 가변 | `rawToS`, `rawToM`, `toS`, `toM`, `viewBounds`, `drawStations`, `stationDetailAllowed`, `stationAt`, `tmToLL`, `clampRequestedView`, `applyMapView`, `clampView`, `fitBox`, `fitLonLat`, `fitGround`, `zoomAt` |
| `15b_map_provider.js` | NAVER SDK viewport 단방향 동기화·명시적 이동 transaction·1회 no-op 보정·100m 축척·native 입력 선행 숨김·실제 draw stamp 검증, 중복 이벤트 제외·종료 누락 복원·3가지 지도 모드·기본 지형 복구 | 가변 | `NaverMapAdapter` (`handleImageError`, `repairViewport`, `refreshScreenOrigin`), `providerRequestedBounds`, `providerStart`, `providerSync`, `providerAlignment`, `providerReadView`, `providerViewportKey`, `providerTilesLoaded`, `providerRecordEvent`, `providerViewportChanged`, `providerBeginMove`, `providerBeginNativeInput`, `providerRenderedViewportMatches`, `providerQueueSettle`, `providerFinalizeViewport`, `providerQueueFinalViewport`, `providerRevealOverlay`, `providerCancelGestureDeadline`, `providerArmGestureDeadline`, `providerApplyView`, `providerCommandObservation`, `providerFinishViewCommand`, `providerRepairViewCommand`, `providerCancelViewCommand`, `providerUseNativePan`, `providerUpdateInput`, `providerZoomAt`, `providerPanBy`, `providerPanAnchor`, `scheduleDisplayDepthArea`, `providerSetMode`, `providerFallback`, `providerRect`, `providerRectError` |
| `15c_map_diagnostic.js` | localhost 전용 native Marker DOM 중심과 Canvas 실제 픽셀·DPR·원점·이동 완료 대기·8프레임 진단·overlay stamp 상태 | 가변 | `naksigwangMapDiagnostic.lastNavigation`, `naksigwangMapDiagnostic.overlay`, `providerMarkerDiagnostic`, `providerCanvasProbePixel`, `providerProbeSample`, `providerDiagnosticRectDeltas`, `drawProviderDebugCrosshair`, `providerClearDiagnostic` |
| `15d_render_state.js` | UI·조류·단면의 별도 무효화, 화살표 bitmap 캐시, localhost FPS·프레임·호출·long task 계측 | 가변 | `perfCount`, `perfWrap`, `drawCurrentOverlay`, `providerPrepareDraw`, `providerDrawStamp`, `providerCommitDrawStamp`, `window.naksigwangPerfDiagnostic` |
| `15e_tile_diagnostic.js` | localhost 타일 DOM·오류/SDK 상태·Canvas 픽셀/가시성·providerOnly 관찰 (URL 비반환) | 가변 | `providerCanvasVisibility`, `window.naksigwangTileDiagnostic`, `naksigwangPerfDiagnostic.providerOnly`, `naksigwangTileDiagnostic.retry` |
| `15f_provider_health.js` | 타일 오류 계측·SDK API 상태 확인·3회 제한 재확인·비치명적 settle timeout·기존 지도 인스턴스 복구 | 가변 | `providerHealthSnapshot`, `providerRecordTileError`, `providerTileErrorsLast10s`, `providerCancelHealthCheck`, `providerHandleProjectionFailure`, `providerScheduleHealthCheck`, `providerTryRecover`, `providerSettleTimeout`, `providerModeTimeout` |
| `16_terrain.js` | GEBCO 배경·idle 수심 범위 요청, viewport별 해안 Path·mask 캐시 | 가변 | `loadGebco`, `gebcoAt`, `makeLUT`, `renderTerrain`, `drawDepthContours`, `drawContours`, `buildPath`, `renderBase` |
| `17_flow.js` | 조류: 해안 방향장·예보 흐름장·측정 시간 기반 입자 예산·이동 중 정지·화살표 | 102 | `buildFlowField`, `realField`, `spawn`, `stepParticles`, `drawCrnt` |
| `17b_section_surface.js` | 단면 샘플의 바다·육상·구조물·암반·미확인 분류, 다중 교차와 샘플 사이 짧은 형상 보호 | 가변 | `sectionSurfaceContext`, `classifySectionSample`, `sectionPointInRings`, `sectionSampleIsWater`, `sectionEdgeBlocked`, `sectionWaterRuns` |
| `18_section.js` | KHOA 출처를 보존하는 A→B 단면, 비수중 구간에서 곡선·채움·특징분석 중단 | 가변 | `analyzeSection`, `profileFeatures`, `renderSecInfo`, `lineStyle`, `drawSection` |
| `18b_shore.js` | 실제 해안 교차가 있을 때만 해안 종류 판정 | 가변 | `osmDist`, `enclosed`, `classifyShore`, `setShore`, `autoShore` |
| `19_overlay.js` | 평면도 위 표시(자료 좌표에서 투영한 단면선·단면 표식·핀) | 가변 | `drawUI` |
| `20_readouts.js` | 계기판 값 표시 | 45 | `updateReadouts`, `updateCrnt` |
| `20b_today.js` | 「오늘」 탭: 오늘·지금 요약, 연속된 좋은 시간 구간, 39종 계산 중 공통 예보와 같은 날짜의 입질 곡선 공유 | 70 | `goodHourRanges`, `renderToday`, `drawToday` |
| `21_input.js` | 화면·터치·검색 입력, 온라인 native 이동/Canvas 단면 전환과 크기 동기화, 수심/출처 상세 | 가변 | `providerPointerFinished`, `resize`, `endPtr`, `updateHover`, `setMode`, `fillNameList`, `navigateSearchPoint`, `findPlace`, `renderBasis` |
| `22_catchlog.js` | 내 조과 기록 | 45 | `localCatches`, `renderLog` |
| `23_main.js` | 예시 단면·SDK 시작, 용도별 상태 변경 렌더·background RAF 중지 | 가변 | `exampleSection`, `drawBiteChart`, `apiAutoKick`, `frame` |
| `24_tabs.js` | 다섯 탭 전환과 지도 stage 이동, 창 높이 변경 시 지도 크기 갱신 | 가변 | `showTab`, `placeMap` |

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
| `FISH` | `12_fish.js` | 39개 표시명(조피볼락은 우럭의 별칭): 사진·legacy 값·V2 ecology 프로필 |

## 고정 자료 (`static/`)

`coast.js` 해안선 · `ports.js` 항·포구 716곳 · `rocks.js` 갯바위 1,076곳 · `ban.js` 낚시 제한구역 · `access.js` 차량 접근 섬 · `gebco.js` 지형 격자 · `osm.js` 방파제·등대 등 · `crnt.js` 조류 예보(2026년) · `fish_temp.js` 어종별 서식 수온

## P0 데이터 보호

수집기는 fresh 90% 이상과 모든 요청의 fresh/fallback 복구를 함께 요구합니다. 하나라도 복구되지 않으면 기존 정상 파일 전체를 보존합니다. 메타의 `unrecovered`와 `kept_previous_incomplete`로 원인을 구분합니다. `generated`는 수집 실행 시각입니다. 화면은 보존·복구 상태와 24시간 이상 지난 실행/기상 발표를 안내합니다. 수온은 현재 시각 기준 24시간 이내 관측만 씁니다.

기상 자료의 `cells` 형식은 유지하고 `bases[격자]`에 실제 발표 시각을 저장합니다. 구형 파일은 전역 `base`로 대체합니다. 날짜가 빠진 조석 지점은 제외하고, 현재 날짜가 없는 조석 파일은 명확한 안내 후 시작을 중단합니다.

## V2.1 입질 조건과 자료 신뢰도

`biteEvalAt(fish, pt, st, day, h)`는 기존 API에 `habitatScore`, `dynamicScore`, `finalScore`를 추가합니다. 서식은 `50 + (계절·권역·수심·환경·대상어 기여 합) × 100/54`, 오늘 조건은 `50 + 활동 조건 기여 합`으로 각각 0~100입니다. 활동 배점 범위는 시간 24·수온 22·실제 흐름 28·조석 10·바람 6·파도 10이며 원천이 없으면 중립입니다. 서식 45%와 오늘 조건 55%를 합쳐 개인 기록을 조금 반영하고 0~99로 제한합니다. 권역 변화 폭은 최종 약 5점, 대상어 목록은 최대 약 0.83점입니다. `factors.layerEffect`는 각 층 내부 기여, `factors.effect`는 최종 점수 기여이며 제한 보정도 기록합니다. 점수는 어획 확률이 아닙니다.

카드에는 서식·오늘 조건 정수와 39종의 `habitatSummary`/`catchSpotSummary`를 표시합니다. confidence/confidenceLevel과 원천 품질 계산은 유지하며 카드에서는 숨기고 도움말·진단에서만 확인합니다. 이유는 현재 활동 조건과 확인된 수심을 우선해 최대 3개입니다. 월별/서식 문구는 일반적 환경 안내이며 어획을 보장하지 않습니다.

39개 표시명 모두 부분 프로필로 숫자를 계산합니다. 우럭·조피볼락은 같은 ecology 객체와 기록 별칭을 공유합니다. 모르는 수온 기준·권역 prior는 중립이며, 계절·수심·서식·활동의 넓은 생태 가정은 통계 검증 전입니다. 점수와 별도로 profile confidence를 낮게 배정합니다. 상세 근거 구분은 `tests/BITE_V2_REPORT.md`를 봅니다.

`getPointEnvironment`는 수심 엔진을 읽기만 합니다. 기존 P3 지형 상태 판정을 읽어 육지·구조물·노출 암반·미확인 구간에 수심을 붙이지 않으며 경사 가정 수심을 사용하지 않습니다. 250/500 m 주변 8방향 수심은 출처를 보존하고, 자료집·기준면이 같고 해상도 250 m 이하인 표본 3개 이상에서만 주변 변화량을 구합니다. 이 값은 측량된 경사나 캐스팅 거리의 수심이 아닙니다. OSM·항·갯바위 자료와 노출도 추정의 evidence를 보존합니다. 포인트·자료 버전 기준 환경 캐시는 최대 64개/60초이며 렌더 안에서 24개 공통 시간 조건을 재사용합니다. 같은 날짜라면 입질 탭의 39×24 곡선을 오늘 탭에서도 재사용하며 동점은 원래 어종 순서로 정렬합니다.

수온의 50 km/24시간·미래 날짜 감쇠 및 기상 발표·격자/자료 상태 처리를 유지합니다. 실제 조류 예보 cm/s를 m/s로 변환하며, 없는 곳에서는 유속 적합도를 중립으로 두고 조석 변화 조건만 작게 참고합니다. 조석 상대세기를 m/s로 해석하지 않습니다. 조석 상승·하강을 실제 조류 방향과 구분합니다. 신뢰도 배점은 프로필 15·수심 15·환경 15·수온 20·바람 5·파도 10·조류 15·조석 5입니다. 등급 경계 80/55는 유지합니다. 누락 기여는 0이며 신뢰도 하락과 점수를 구분합니다.

`python tests/test_bite_v21.py`는 7일×39종 실제 입력·층별 기여와 날짜 조회·동일 입력·카드 회귀를 기록합니다. 상세 근거와 전후 결과는 `tests/BITE_V21_REPORT.md`를 봅니다.

`python tests/test_bite_v2.py`는 318개 방향/불변조건, 실제 동해 8곳의 24시간×39종 행렬·상관도·순위 및 렌더 성능을 기록합니다. `before` 인자는 수정 전 고정 커밋을 재현합니다. `tests/test_bite_confidence.py`는 기존 P1의 실제 포인트 비교·자료 만료 검사를 39종으로 확장합니다. 사진 테스트는 V2 숫자 모델을 전제로 디코딩·대체 그림·모바일/PC 다섯 탭을 보존합니다.

명시적 이동: point/bounds 목표를 분리 기록하고 500ms 미도착 시 현재 표시 배율에서 정수 zoom을 산출해 1회 보정한다. 항구/검색 선택은 성공 시에만 확정한다. `naksigwangMapDiagnostic.lastNavigation()`은 실제 중심·폭·보정 여부를 credential 없이 반환한다.
