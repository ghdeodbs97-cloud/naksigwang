# P3 NAVER 지도 표시 투영 수정 보고서

2026-10-17 갱신. 기존 `feat/p3-map-foundation` / draft PR #6에서 계속 작업했다. 새 브랜치·PR과 merge는 없다. 실 credential은 사용하지 않았다. **실 NAVER 영상 ±2 CSS px 정합은 사용자 localhost 검증 전까지 미확인**이다.

## 위성 기본값과 세 가지 모드

첫 진입 기본은 순수 위성 `SATELLITE`다. Map 생성 옵션에서부터 지도 유형을 지정해 처음에 일반 타일을 요청하는 경로도 없앴다. UI와 실제 SDK 매핑은 다음과 같다.

| 화면 | 저장값 | SDK MapTypeId |
|---|---|---|
| 위성 | satellite | SATELLITE |
| 위성+지명 | hybrid | HYBRID |
| 일반 | normal | NORMAL |

예전 `naksigwang-map-mode`는 개발 중 생성된 설정으로 보고 제거한다. 새 `naksigwang-map-mode-v2`가 없으면 위성으로 시작한다. 이후 사용자가 선택한 v2 값은 새로고침 후에도 유지한다. credential 저장 항목은 변경하지 않는다.

## 이번에 확인한 원인과 아직 확인하지 못한 원인

위성이 기본이 아니었던 원인은 mode의 초기값이 normal이고 satellite 버튼도 HYBRID에 연결되어 있던 코드다. 이를 SATELLITE 기본값과 세 가지 명시적인 매핑으로 고쳤다.

이전 내부 정합 검사는 같은 SDK의 offset/세계 좌표 변환을 비교하므로 내부 일관성만 확인한다. 이 값이 거의 0이어도 실제 native Marker DOM, Canvas 원점·backing 크기, 지도 resize/center 반영 시점까지 맞았다는 증거가 되지 않는다. 사용자 실제 화면의 잔여 어긋남은 이 한계 때문에 아직 원인이 확정되지 않았다. 이번 작업은 독립적인 실제 렌더링 계측을 추가한 것이며, 실 NAVER 오차를 이미 해결했다고 주장하지 않는다. 하드코딩 offset이나 원자료 이동은 넣지 않았다.

## native Marker와 실제 Canvas 픽셀 진단

localhost에서 `await naksigwangMapDiagnostic(38.20854, 128.5947)`를 실행한다. 같은 lat/lon으로 SDK `new Marker({position:new LatLng(lat,lon),map:...})`의 청록색 HTML 원과 자료 mx/my → toS로 그린 자홍색 Canvas 십자선을 만든다.

native 위치는 실제 HTML 원의 getBoundingClientRect 중심을 읽는다. Canvas 위치는 getImageData에서 실제 자홍색 픽셀을 찾아 alpha 가중 중심을 읽고 backing 크기로 나누어 CSS pixel로 환산한다. 양쪽 모두 ui Canvas 왼쪽 위를 기준으로 표현한다. SDK project 결과를 양쪽에 재사용하지 않는다. dx/dy는 Canvas minus native, errorPx는 두 값의 거리다. valid=true이고 errorPx≤2면 해당 좌표·뷰에서 두 렌더러의 정합이 확인된 것이다.

반환 객체에는 providerMode/providerZoom, lat/lon, providerRect/baseRect/flowRect/canvasRect/stageRect, 각 사각형의 left/top/width/height 차이(rectDeltas), 실제 dpr와 canvasDpr(최대 2), nativeMarkerPixel/canvasPixel/dx/dy/errorPx, center/bounds가 있다. 경위도 배열은 [lon,lat], 화면 좌표는 [x,y] 순서다. CSS padding/border/transform/clipPath, backing/logical 크기, 프레임별 위치·마지막 Canvas 그린 시각·V/SDK 중심도 기록한다. 처음과 다음 두 프레임을 기록하고, 마커가 아직 준비되지 않았으면 최대 8프레임까지 기다린다. maxObservedErrorPx로 잠깐 발생한 차이를 볼 수 있다.

provider·base·flow·ui·stage의 CSS 사각형도 2px guard에 포함했다. full viewport의 높이를 출처 때문에 줄이지 않는다. Canvas 하단 28px의 clip만 출처를 위해 유지한다. 완전한 십자선이 화면 밖/출처 영역에 있거나 마커가 준비되지 않았으면 valid=false, errorPx=null로 반환한다. 이 경우 0px 성공으로 취급하지 않는다. provider가 비활성이어도 DOM 사각형 차이는 반환한다.

native Marker와 십자선은 로컬 호스트에서 사용자가 함수를 호출할 때만 만든다. 공개 호스트에는 window 진단 함수와 debug Marker가 없다. `naksigwangMapDiagnostic.clear()`로 지운다. 같은 좌표로 다시 호출하면 기존 Marker를 재사용해 pan/zoom 뒤 프레임 변화를 측정한다. 일반 pin·A/B·SEC는 진단 생성으로 변경하지 않는다. 반환값에 SDK 객체·credential·Client ID는 포함하지 않는다.

인자 없는 `naksigwangMapDiagnostic()`는 이전 내부 비교값만 반환하며 nativeMarkerMeasured=false로 표시한다. **내부 maxError를 실제 marker-vs-Canvas errorPx로 해석하지 않는다.**

## 원인과 수정

사용자 첫 실검증에서 SDK 인증 오류 없이 2px 정합 실패 안내가 나왔다. 기존 구현은 Web Mercator의 연속 `V.s`를 그대로 둔 채 NAVER 정수 zoom만 반올림했다. 배율 양자화와 UTMK_NAVER 투영의 방향·곡률 차이를 화면 전체에서 맞출 수 없는 구조였다. 실제 실패 px 수치는 credential 없는 환경에서 측정하지 않았다.

`rawToS/rawToM`은 기존 변환 그대로다. 정상 provider의 `toS`는 자료 mx/my → 경위도 → SDK `fromCoordToOffset`, `toM`은 SDK `fromOffsetToCoord` → 경위도 → 자료 mx/my를 쓴다. 초기화 전·정합 실패·SDK 실패는 raw 변환으로 돌아간다. 수심 값이나 원자료 좌표를 이동하지 않는다.

지역/전국 이동 명령은 기존 V를 입력으로 사용해 가까운 SDK 정수 줌을 선택한다. 선택 후 SDK 중심과 중심 부근 실제 px/m를 V에 되돌려 쓴다. V.s는 중심의 국소 배율이며 전국을 affine로 맞추는 용도가 아니다. 실제 표시와 요청 범위는 SDK 투영·bounds를 쓴다. SDK idle에서도 상태를 재확인한다.

pan은 시작 경위도 기준점이 포인터를 따라가도록 SDK 역투영으로 중심을 정한다. wheel/pinch는 작은 배율을 누적한 뒤 정수 zoom을 적용하고 기준점을 유지한다. 줌 애니메이션은 사용하지 않는다. 지도 이동 때 캐시된 타일이 tilesloaded를 다시 발생시키지 않아도 이미 준비된 투영을 즉시 재검사한다. 프레임의 providerSync 다음에 Canvas를 다시 그린다. 실제 SDK 타일/Canvas의 순간적인 어긋남 여부는 수동 프레임 검증이 필요하다.

해안 경로·육지/구조물 마스크·항구·갯바위·수심 점·핀도 같은 SDK 변환을 쓴다. A→B는 원래 자료 좌표의 선을 100개 구간으로 투영하며 단면 hover 표식도 실제 자료 좌표를 투영한다. 18_section.js의 표본과 수심 계산은 그대로다. 활성 배경에서는 GEBCO 색상과 기존 바탕 그림을 건너뛰고 분석 마스크와 표시를 유지한다. 실패하면 기본 지형 그림을 다음 지도 프레임에 복구한다. SDK 하단 출처 28px 영역 위로 축척과 미니맵을 배치해 표시가 잘리지 않게 했다.

## 정합 guard와 개발 진단

2 CSS px 기준은 유지한다. 검사 중에만 후보 SDK 변환을 사용한 뒤 결과에 따라 active를 결정한다.

- 중앙·네 모서리·네 변 중점: SDK 역변환 경위도를 자료 좌표로 바꿔 앱 화면 변환과 비교하고, 별도 SDK 세계 좌표 경로와 화면 원점을 함께 확인한다.
- 속초·주문진·묵호·포항 고정 경위도: 앱 변환과 `fromCoordToPoint → fromPointToOffset` 기준을 비교한다. 기준 경로는 앱 toS/toM/project를 호출하지 않는다.
- 고의 project 오차 3px를 넣으면 반드시 차단된다. 같은 함수를 양쪽에 호출해 항상 0으로 만드는 mock을 제거했다.

localhost/127.0.0.1 개발자 콘솔에서 `naksigwangMapDiagnostic()`를 실행한다. SDK 객체나 credential은 반환하지 않는다. 결과는 V.cx/cy/s, SDK zoom, CSS viewport, 9곳의 경위도·오차, 고정 경위도의 실제/기준 화면 좌표와 오차, maxError, rawSamples/rawMaxError, x/y scale ratio, provider 중심, visible bounds다. raw 값은 현재 V를 기존 affine 방식으로 그렸을 때의 비교값이며 active 판정값이 아니다. 화면 사용자 UI에 개발 정보는 넣지 않았다.

이 guard는 좌표 변환·화면 경로의 내부 일관성을 검사한다. SDK 영상 자체의 측량 정확도, 원본 OSM 해안/항구 위치의 정확도나 영상 촬영 시점까지 증명하지 않는다. 실영상 검증은 아래 절차로 별도 기록한다.

## 이번 후속 수정 파일

- `src/app/15b_map_provider.js`: SATELLITE 기본값·초기 생성 옵션, 세 가지 SDK 모드, v2 설정, native Marker 생성, DOM rect guard.
- `src/app/15c_map_diagnostic.js`(신규): native DOM·실제 Canvas 픽셀·DPR·원점·프레임 진단, 로컬 전용 함수와 해제/폭 이동 보조 함수.
- `src/app/19_overlay.js`: 로컬 debug 십자선 표시 연결. 기존 분석 좌표는 무변경.
- `src/template.html`: 위성/위성+지명/일반 버튼과 초기 선택.
- `src/README.md`, `index.html`(build.py 생성).
- `tests/p3_provider_checks.js`, `tests/test_map_provider.py`: 세 모드·설정 이관·독립 native DOM mock·원점 오차·DPR 3·공개 호스트 진단 차단 검사.
- `tests/smoke_degradation.py`: 최신 meta의 다른 원천 보존 상태가 합성 merged/kept/incomplete 시나리오를 덮지 않도록 fixture 상태를 분리한다. 기존 안내 문구 검증은 유지한다.
- `tests/P3_MAP_REPORT.md`, `tests/p3_validation.json`: 절차와 결과.

## mock 및 회귀 검증

mock은 앱 변환을 호출하지 않는 비선형 세계 좌표(방향 기울기·곡률)와 정수 줌을 쓴다. 390×844, 768×1024, 1280×900, 1365×768, 1920×1080 × DPR 1/1.25/1.5/2의 20개 조합을 검사한다. 각 조합은 네 항만 × 폭 1.5/9/60/600km를 검사한다. 기존 affine 방식이 2px를 넘는 경우도 검사하며 수정된 표시 변환의 오차는 1e-5 CSS px 미만이어야 한다. 최종 360개 화면 검사 최대 오차는 2.73e-09 CSS px, 기존 affine 비교 최대 오차는 35.507 CSS px였다. 정확한 실행 결과는 `p3_validation.json`에 기록한다. 실제 NAVER 측정값이 아니다.

독립 native DOM mock은 20개 조합 × 전국/광역/10/5/2/1km 및 DPR 3 별도 검사를 합쳐 126개를 측정했다. 실제 Canvas 픽셀 기준 최대 errorPx는 0.247959 CSS px, 최대 DOM 사각형 차이는 0.000000px였다. 내부 비교가 통과해도 native DOM에 넣은 6px 이동과 provider DOM의 5px 원점 차이를 검출한다. SATELLITE 기본값·legacy 이관·세 모드 전환·공개 호스트 debug 부재도 통과했다. 이는 실제 NAVER 수치가 아니다.

Canvas 이벤트 핸들러의 A→B·hover·pan·wheel·두 포인터 pinch, 작은 줌 누적, 줌 기준점, SDK 범위 안의 수심 요청, 3px 차단·복구, 실패 시 raw 복귀, 배경 투명·마스크·아이콘, 모드 전환 상태 보존을 검사한다. 합성 touch 이벤트는 물리 휴대폰 검증을 대신하지 않는다. 외부 HTTPS를 차단해 NAVER 요청과 실 credential을 CI에서 사용하지 않는다. SDK 404/429/offline/콜백 timeout/인증 실패도 mock으로 검사한다.

기존 main baseline의 동해안 8곳 × 동쪽 0/500/1000m 수심·기준면·출처와 A→B 전체 301개 표본·특징 해시를 비교한다. baseline을 수정본으로 갱신하지 않는다. 기존 CI 12개 명령과 빌드 일치 검사도 실행한다. 390×844와 1280×900의 다섯 탭 및 활성 mock의 핀·아이콘·A→B·축척·미니맵을 PNG로 직접 확인했다. 원격 결과는 PR checks에 연결한다.

## 수심 보호

`static/depth/`, `04_depth.js`, `04b_depth_tiles.js`, `18_section.js`, `data/`는 변경하지 않는다. production 42타일·35,982점, verticalDatum·KHOA provenance, 12타일·60,000점·8MiB 제한, 육지/외삽 차단과 fallback은 동일하다. 바뀐 수심 부분은 화면 투영에 맞는 요청 bbox를 만드는 외부 표시 어댑터뿐이며 기존 depthPrepareAreas의 제한·공유·퇴거를 그대로 통과한다.

## 사용자 localhost 실제 검증

1. 기존 브랜치의 최신 코드를 받아 `python build.py`를 실행한다. 저장소에서 `python -m http.server 8000`을 실행하고 `http://localhost:8000/index.html#map`을 강력 새로고침한다. 기존 localStorage `naksigwang-naver-key-id`는 그대로 둔다. 키를 채팅/보고서/캡처에 복사하지 않는다.
2. 이전 P3 legacy 설정만 있던 브라우저와 신규 브라우저는 **위성**으로 열린다. 위성+지명/일반도 눌러 확인한다. 이후 직접 선택한 v2 값은 유지되는 것이 정상이다. 새 기본값만 다시 확인하려면 `localStorage.removeItem('naksigwang-map-mode-v2')` 후 새로고침한다. credential 항목은 지우지 않는다.
3. 좌표 검색에 `38.20854, 128.5947`을 입력해 찾기를 누른다. 개발자 콘솔에서 다음을 실행한다.

```js
const r = await naksigwangMapDiagnostic(38.20854, 128.5947);
r
```

청록색 원은 native Marker, 자홍색 십자는 Canvas다. r.valid=true, r.errorPx≤2인지 확인한다. providerRect/baseRect/flowRect/canvasRect/stageRect와 rectDeltas가 같은 원점·크기인지 확인한다. dpr와 canvasDpr는 3과 2처럼 달라도 정상이며 환산된 CSS px를 비교한다. 타일 영상 대신 이 동일 경위도 기준점으로 projection 정합을 판단한다.

4. 다음을 한 줄씩 실행해 전국/광역/10km/5km/2km/1km에서 기록한다. 정수 줌 때문에 실제 표시 폭은 요청 폭과 다를 수 있다. 전국에서는 속초가 화면 가장자리에 걸릴 수 있어 화면 안의 별도 정확한 좌표 36,128을 쓴다.

```js
await naksigwangMapDiagnostic.fit(600000, 36, 128)
await naksigwangMapDiagnostic.fit(60000, 38.20854, 128.5947)
await naksigwangMapDiagnostic.fit(10000, 38.20854, 128.5947)
await naksigwangMapDiagnostic.fit(5000, 38.20854, 128.5947)
await naksigwangMapDiagnostic.fit(2000, 38.20854, 128.5947)
await naksigwangMapDiagnostic.fit(1000, 38.20854, 128.5947)
```

5. 같은 검사를 주문진 37.89192/128.8312883028771, 묵호 37.55/129.12, 포항 36.05/129.38에서도 10/5/2/1km로 반복한다. 위성·위성+지명·일반, 390×844와 1280×900에서 시행한다. UI 검색 pin도 동일 좌표로 입력해 십자선과 중심이 같은지 확인한다. 분석 선을 그어 A/B·단면 hover와 수심 readout이 유지되는지도 확인한다.
6. pan/wheel/pinch·창 크기/방향 변경 직후 같은 좌표의 진단을 다시 실행한다. r.timeline과 r.maxObservedErrorPx에서 frame 0과 이후 프레임의 차이를 확인한다. 지속되는 오차와 한 프레임 지연을 구분한다. CSS transform/padding/border는 styles, DPR 환산은 backingSize/logicalSize/canvasDpr, SDK 중심 반영은 각 프레임의 providerCenter/view를 비교한다. 필요하면 연속 화면 녹화로 확인한다.
7. projection이 ≤2px인 상태에서만 항구/갯바위 원자료와 위성의 구조물을 비교한다. 아이콘은 해안 밖으로 비켜 그리므로 연결선의 실제 위치 점을 사용한다. 데이터의 위치가 다르다고 전체 provider transform이나 항구 좌표에 offset을 넣지 않는다.
8. 결과는 mode/zoom/viewport/DPR/lat/lon/dx/dy/errorPx/rectDeltas/timeline을 기록한다. 반환 객체에는 credential이 없다. Network/Storage 패널을 포함해 캡처하지 않는다. `naksigwangMapDiagnostic.clear()`로 debug를 지운다. offline 후 기본 지형 복귀, 오늘/지도 왕복과 나머지 세 탭도 확인한다.

## 원자료 위치 오차와 projection 오차 구분

| 대상 | 해석 |
|---|---|
| 같은 직접 입력 lat/lon의 native Marker와 Canvas 십자선이 >2px | 렌더링/DOM/DPR/SDK 갱신 시점 문제를 조사한다. 데이터 위치 이동으로 해결하지 않는다. |
| 같은 lat/lon은 ≤2px인데 POINTS 항구/갯바위만 어긋남 | 포인트 생성·대표 좌표·간격에 따른 위치 정확도 문제일 수 있다. |
| PORTS만 어긋남 | 원 항구 목록의 대표 위치와 방파제 끝점은 다를 수 있다. 원 출처 좌표를 확인한다. |
| ROCKS만 어긋남 | 갯바위 위치·접근정보의 출처별 정확도를 확인한다. |
| OSM 해안/구조물만 어긋남 | OSM 원자료·단순화 허용오차·위성 촬영/구조물 변경 시점 차이를 확인한다. |

이 분류는 진단 순서이며 이번 작업에서 각 dataset의 실제 m 오차를 측정한 결과는 아니다. 임의 일괄 보정, 수심/해안의 영상 추론은 하지 않았다.

## 남은 한계

**실 NAVER native-vs-Canvas errorPx는 미확인이다.** Codex는 사용자 credential을 사용하지 않았고 실 실행 결과를 받지 않았다. mock 수치로 실 SDK 성공을 주장하지 않는다. native-vs-Canvas 정합은 두 렌더러가 같은 경위도를 찍는지 확인하며 영상/측량 또는 원자료의 위치 정확도를 보증하지 않는다. 화면 밖·출처 영역은 측정 불가로 반환한다. 합성 touch와 mock DOM은 실제 기기·SDK 프레임 검증을 대신하지 않는다. 임의 회전 CSS transform을 적용한 레이아웃은 현재 제품에서 사용하지 않으며, 그런 변경은 별도 실검증이 필요하다. 공개 방문자의 NAVER 설정 주입 단계는 별도이며 설정이 없으면 기본 지형으로 동작한다.

공식 근거: [MapSystemProjection 화면/세계 좌표 API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.MapSystemProjection.html), [지도 유형](https://navermaps.github.io/maps.js.ncp/docs/tutorial-MapTypes.html), [Marker HTML 아이콘·anchor](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Marker.html), [지도 투영](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Projection.html), [Map 줌·이벤트 API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html), [SDK 설정](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html), [허용 URL](https://guide.ncloud-docs.com/docs/en/maps-troubleshoot).
