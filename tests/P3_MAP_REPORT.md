# P3 NAVER 지도 표시 투영·이동 동기화 수정 보고서

2026-10-17 갱신. 기존 `feat/p3-map-foundation` / draft PR #6에서 계속 작업했다. 새 브랜치·PR과 merge는 없다. Codex는 실 credential을 사용하지 않았다. 사용자가 현재 서해안 viewport의 같은 좌표에서 **valid=true, errorPx≈0.0377 CSS px, domMismatchPx=0, satellite**를 보고했다. 추가로 이전 버전 속초 fit 약 0.04165px 성공이 보고됐다. **새 LatLngBounds 코드의 실 NAVER 포항 이동은 재검증 전까지 미확인**이다.

## LatLngBounds 명시적 입력 수정

최신 사용자 실측에서 이전 버전의 속초 fit은 settled, valid=true, 약 0.04165 CSS px로 성공했다. 직후 포항 fit은 60프레임 이상 center/renderCenter/zoom=11/viewportScale/bounds/key가 그대로이고 inside=false, centerErrorPx와 reportedErrorPx 약 4105px, occupancy 약 0.554로 유지됐다. 이 관측은 SDK viewport 미변경을 보여 주며 settle 조건을 완화할 근거가 아니다. 새 코드의 실 NAVER 포항 성공은 아직 미확인이다.

기존 `[new LatLng(sw), new LatLng(ne)]` 인수 대신 `new LatLngBounds(sw,ne)`를 전달한다. providerRequestedBounds가 `{west,south,east,north}` 순수 값을 계산하고 NAVER 어댑터에서만 SDK 객체로 변환한다. 기존 pending/settle/commandId·축척·표시 투영은 유지했다. 추가 setCenter/setZoom 대안, 고정 지연, reload, 지도 재생성은 넣지 않았다. [공식 LatLngBounds 생성자](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.LatLngBounds.html)는 SW/NE LatLng를 받는다. [공식 fitBounds](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html)는 Bounds 외에 좌표 배열도 기재하므로 기존 배열 형태가 모든 SDK에서 미지원이라고 단정하지 않는다.

확인한 테스트 사각지대는 기존 FakeMapAdapter가 syncFromAppViewport를 재구현해 실제 NAVER 메서드와 fitBounds 인수 검사를 건너뛴 점이다. 이제 즉시/지연 mock 모두 실제 NaverMapAdapter.syncFromAppViewport를 호출하고, SDK 경계에서 LatLngBounds 객체·유효한 SW/NE를 엄격히 검사한 뒤 동일 geographic bounds로 표시 상태를 만든다. 객체 배열 거절 검사는 이번에 선택한 명시적 계약의 회귀이며 실제 NAVER의 두 번째 명령 무시 원인을 재현했다는 주장은 아니다. 실제 SDK causal root cause는 사용자 재검증 결과로 확정한다.

홍원→속초→포항→주문진→홍원→포항→속초의 연속 여섯 이동을 각 DPR에서 검사한다. 매 명령 center/key/bounds 변경, target inside, 중심 오차 허용 범위, settled, 독립 native DOM/Canvas ≤2px를 확인한다. requestedBounds와 실제 mock 수신 bounds도 비교한다. command 결과에 fitBoundsType="LatLngBounds", before/after의 center/zoom/bounds/key, sdkViewportUnchanged를 추가했다. no-op 실패 fixture는 모든 SDK viewport 값을 그대로 유지하고 trace 전체와 실패 결과가 sdkViewportUnchanged=true인지 검사한다.

## 명시적 viewport 이동 transaction 수정

이전 커밋 `695a760`에서 fitGround는 V를 목표로 먼저 바꾸고 fitBounds 직후 providerSync가 옛 SDK projection을 읽어 V에 복사했다. diagnostic.fit은 이동 완료 여부를 확인하지 않고 frame 0~8을 측정했다. 이전 빌드에 20 RAF 지연 SDK를 주입하면 서해안 `[126.5,36.15]`에서 속초 `[128.5947,38.20854]`를 요청해도 서해안 center·V, valid=false/errorPx=null로 조기 반환했다. 이는 요청 완료와 표시 측정 사이의 race를 재현한 것이다. **옛 V 복사만으로 SDK 이동이 취소되었다거나 실 SDK fitBounds 미반영의 원인까지 확정한 것은 아니다.** 실 SDK의 요청/반영 순서는 새 command.trace로 확인해야 한다.

fitGround/fitBox/fitLonLat와 탭 복원은 온라인 목표를 V와 분리해 순수 request로 만든다. providerApplyView는 Promise를 반환하고 commandId/requestedView/commandPending을 저장한 뒤 SDK fitBounds를 호출한다. providerSync는 pending 동안 현재 SDK 화면 재그리기는 허용하지만 V를 확정하지 않는다. 이벤트의 idle만 믿지 않고 매 RAF 실제 projection에서 목표가 viewport/bounds 안인지, 표시 중심과 보고 중심이 맞는지, 요청 범위의 배율이 적절한지, viewport key가 연속 두 프레임 안정적인지 검사한다. zoom 보고값이 먼저 바뀌는 경우에는 SDK 세계 좌표 1단위의 CSS pixel 크기도 확인해 옛 zoom projection을 완료 처리하지 않는다.

도착 후 V compatibility·lastSettledView를 갱신하고 dirty를 설정해 기존 Canvas redraw와 수심 viewport 예약을 수행한다. 새 명령은 이전 명령을 superseded로 취소하며 오래된 idle은 새 목표를 확정할 수 없다. 사용자 pan/zoom은 미완료 fit을 interrupted로 취소한다. 기본 timeout은 8초이며 미도착 시 `reason="requested viewport not reached"`, 요청 목표와 관측 center/renderCenter/bounds/trace를 반환한다. 미도착만으로 projection 실패나 terrain fallback으로 분류하지 않는다. SDK 자체 오류는 기존 fallback으로 복귀한다. credential/SDK 객체는 반환하지 않는다.

세계 좌표 배율·목표 포함 검사는 명령 완료를 판단하는 내부 상태 검사다. 실제 정합 판정은 계속 독립 native Marker DOM 중심과 실제 Canvas 픽셀로 수행한다.

diagnostic.fit은 이 Promise가 성공한 뒤 native Marker 측정을 시작한다. 실패하면 이동 실패 이유와 command 기록을 반환하며 native 측정을 성공처럼 표시하지 않는다. 검색창 submit과 다섯 범위 버튼도 같은 transaction을 사용한다. fallback 지도는 기존 V 기반 이동·입력을 유지한다.

추가 mock은 fitBounds를 2~5 RAF 늦추고 center/zoom/idle을 먼저 보고한다. 홍원→속초 10km, 속초→포항 10km, 포항→전국, 전국→주문진 2km, 같은 중심 zoom만 변경, 좌표 검색 10회, 빠른 검색 10회(이전 9개 취소), 홍원항 이름 검색, 전국/동해안/남해안/서해안/제주 버튼을 검사한다. 12 RAF 지연 진단 대기, no-op timeout/복구도 별도로 검사한다. 각 완료 후 목표 포함·중심·settled V·native DOM/실제 Canvas ≤2px·A/B 보존을 확인한다. 이 기록은 실 NAVER 이동 성공의 증거가 아니다.

## 위성 기본값과 세 가지 모드

첫 진입 기본은 순수 위성 `SATELLITE`다. Map 생성 옵션에서부터 지도 유형을 지정해 처음에 일반 타일을 요청하는 경로도 없앴다. UI와 실제 SDK 매핑은 다음과 같다.

| 화면 | 저장값 | SDK MapTypeId |
|---|---|---|
| 위성 | satellite | SATELLITE |
| 위성+지명 | hybrid | HYBRID |
| 일반 | normal | NORMAL |

예전 `naksigwang-map-mode`는 개발 중 생성된 설정으로 보고 제거한다. 새 `naksigwang-map-mode-v2`가 없으면 위성으로 시작한다. 이후 사용자가 선택한 v2 값은 새로고침 후에도 유지한다. credential 저장 항목은 변경하지 않는다.

## 이번에 확인한 원인과 아직 확인하지 못한 원인

이동 후 stale viewport 실패를 이전 커밋 `284389b`의 빌드로 재현했다. 1280×900에서 근거리 보기 후 mock SDK만 전국 zoom 7로 옮기면 providerSync가 V 서명만 감시하여 SDK 변경을 읽지 않았다. provider ground scale은 1264.089 m/px인데 앱 gpp는 1.234462 m/px에 머물렀고 606개 지점이 그려졌다. 즉, 표시 투영이 SDK 경로라도 축척·LOD·base 재그리기는 stale V에 묶여 있었다. 기존 즉시 setCenter/setZoom → providerReadView와 다음 frame의 V → SDK 재동기화도 지연 projection을 다시 덮어쓸 수 있는 경로였다. 실제 NAVER에서 어느 이벤트 순서가 발생했는지는 아직 계측 결과가 없으며, 코드의 실패 경로와 mock 재현을 구분한다.

온라인 표시의 기준은 SDK의 현재 projection/center/zoom/bounds다. providerSync는 읽기만 하고, V는 현재 화면 중심 역변환과 SDK 100m 축척의 호환 복사본으로 둔다. 검색·범위 버튼·탭 복원 같은 명시적 이동만 providerApplyView → SDK fitBounds를 호출한다. V 변경만으로 SDK를 자동 덮어쓰지 않는다. 지도 이동 모드는 SDK native drag/pinch/wheel, 단면 모드는 Canvas pointer 입력을 사용한다. fallback 입력은 유지한다.

SDK의 bounds_changed/center_changed/zoom_changed/projection_changed/idle에서 갱신을 예약한다. 매 표시 frame에서 SDK zoom/center/bounds 및 화면 모서리·중심 역변환을 감시하므로 이른 idle 뒤 projection이 늦게 바뀌어도 최종 base·UI를 다시 그린다. renderBase의 기존 수심 viewport 예약이 그 뒤 실행된다. pxPerGround는 화면 중심을 역변환하고 SDK getDestinationCoord로 동쪽 100m를 구해 실제 CSS pixel 거리/100으로 계산한다. gpp·LOD·라벨·축척막대가 이 값을 공유한다. A/B·선택 pin 지리좌표와 원자료는 이동시키지 않는다.

수정 후 동일 zoom 7 조건은 gpp 1264.089270, 지점 **82개**(항구 81, 선택 갯바위 1), label 1개다. 기존 LOD 기준을 변경하지 않고 올바른 축척을 공급했다. 선택 지점은 기존 의도대로 항상 허용한다. 실제 화면 안의 수는 확대하면서 viewport가 좁아져 감소할 수 있다. 따라서 여섯 범위의 표시 개수와 함께 전체 목록에서 해당 LOD가 허용하는 eligible 개수를 기록하고 확대할수록 eligible이 줄지 않는지 검사한다.

위성이 기본이 아니었던 원인은 mode의 초기값이 normal이고 satellite 버튼도 HYBRID에 연결되어 있던 코드다. 이를 SATELLITE 기본값과 세 가지 명시적인 매핑으로 고쳤다.

이전 내부 정합 검사는 같은 SDK의 offset/세계 좌표 변환을 비교하므로 내부 일관성만 확인한다. 이 값이 거의 0이어도 실제 native Marker DOM, Canvas 원점·backing 크기, 지도 resize/center 반영 시점까지 맞았다는 증거가 되지 않는다. 사용자 실제 화면의 잔여 어긋남은 이 한계 때문에 아직 원인이 확정되지 않았다. 이번 작업은 독립적인 실제 렌더링 계측을 추가한 것이며, 실 NAVER 오차를 이미 해결했다고 주장하지 않는다. 하드코딩 offset이나 원자료 이동은 넣지 않았다.

## native Marker와 실제 Canvas 픽셀 진단

localhost에서 `await naksigwangMapDiagnostic(38.20854, 128.5947)`를 실행한다. 같은 lat/lon으로 SDK `new Marker({position:new LatLng(lat,lon),map:...})`의 청록색 HTML 원과 자료 mx/my → toS로 그린 자홍색 Canvas 십자선을 만든다.

native 위치는 실제 HTML 원의 getBoundingClientRect 중심을 읽는다. Canvas 위치는 getImageData에서 실제 자홍색 픽셀을 찾아 alpha 가중 중심을 읽고 backing 크기로 나누어 CSS pixel로 환산한다. 양쪽 모두 ui Canvas 왼쪽 위를 기준으로 표현한다. SDK project 결과를 양쪽에 재사용하지 않는다. dx/dy는 Canvas minus native, errorPx는 두 값의 거리다. valid=true이고 errorPx≤2면 해당 좌표·뷰에서 두 렌더러의 정합이 확인된 것이다.

반환 객체에는 providerMode/providerZoom, lat/lon, providerRect/baseRect/flowRect/canvasRect/stageRect, 각 사각형의 left/top/width/height 차이(rectDeltas), 실제 dpr와 canvasDpr(최대 2), nativeMarkerPixel/canvasPixel/dx/dy/errorPx, center/bounds가 있다. 경위도 배열은 [lon,lat], 화면 좌표는 [x,y] 순서다. CSS padding/border/transform/clipPath, backing/logical 크기와 함께 frame 0~8을 항상 기록한다. 각 frame은 SDK center/zoom/bounds, V, pxPerGround/gpp, provider/Canvas rect, 실제 native DOM/Canvas 위치와 dx/dy/errorPx, 마지막 base frame 및 station 개수와 최근 이벤트를 포함한다. maxObservedErrorPx와 마지막 세 프레임을 비교해 일시 지연과 지속 오차를 구분한다.

provider·base·flow·ui·stage의 CSS 사각형도 2px guard에 포함했다. full viewport의 높이를 출처 때문에 줄이지 않는다. Canvas 하단 28px의 clip만 출처를 위해 유지한다. 완전한 십자선이 화면 밖/출처 영역에 있거나 마커가 준비되지 않았으면 valid=false, errorPx=null로 반환한다. 이 경우 0px 성공으로 취급하지 않는다. provider가 비활성이어도 DOM 사각형 차이는 반환한다.

native Marker와 십자선은 로컬 호스트에서 사용자가 함수를 호출할 때만 만든다. 공개 호스트에는 window 진단 함수와 debug Marker가 없다. `naksigwangMapDiagnostic.clear()`로 지운다. 같은 좌표로 다시 호출하면 기존 Marker를 재사용해 pan/zoom 뒤 프레임 변화를 측정한다. 일반 pin·A/B·SEC는 진단 생성으로 변경하지 않는다. 반환값에 SDK 객체·credential·Client ID는 포함하지 않는다.

인자 없는 `naksigwangMapDiagnostic()`는 이전 내부 비교값만 반환하며 nativeMarkerMeasured=false로 표시한다. **내부 maxError를 실제 marker-vs-Canvas errorPx로 해석하지 않는다.**

## 원인과 수정

사용자 첫 실검증에서 SDK 인증 오류 없이 2px 정합 실패 안내가 나왔다. 기존 구현은 Web Mercator의 연속 `V.s`를 그대로 둔 채 NAVER 정수 zoom만 반올림했다. 배율 양자화와 UTMK_NAVER 투영의 방향·곡률 차이를 화면 전체에서 맞출 수 없는 구조였다. 실제 실패 px 수치는 credential 없는 환경에서 측정하지 않았다.

`rawToS/rawToM`은 기존 변환 그대로다. 정상 provider의 `toS`는 자료 mx/my → 경위도 → SDK `fromCoordToOffset`, `toM`은 SDK `fromOffsetToCoord` → 경위도 → 자료 mx/my를 쓴다. 초기화 전·정합 실패·SDK 실패는 raw 변환으로 돌아간다. 수심 값이나 원자료 좌표를 이동하지 않는다.

지역/전국 이동 명령은 요청 V의 범위를 SDK fitBounds에 전달한다. SDK가 선택한 정수 줌의 실제 표시 중심과 100m 축척을 V에 복사한다. V.s는 중심의 국소 배율이며 전국을 affine로 맞추는 용도가 아니다. 실제 표시와 요청 범위는 SDK 투영·bounds를 쓴다.

지도 이동 모드는 SDK native 입력을 사용한다. 단면 모드의 wheel/pinch와 확대 버튼은 배율을 누적한 뒤 SDK zoomBy의 경위도 기준점을 사용한다. SDK에 반복 setCenter로 기준점을 맞추는 루프는 제거했다. 앱 명령의 줌 애니메이션은 끈다. 캐시된 타일이 tilesloaded를 다시 발생시키지 않아도 viewport 이벤트와 매 프레임 감시가 최종 Canvas 재그리기를 보장한다. 실제 SDK native 애니메이션의 순간적인 어긋남 여부는 수동 프레임 검증이 필요하다.

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

추가 delayed mock은 center/zoom 이벤트와 idle을 먼저 발생시키고 실제 projection/native DOM 반영은 3 RAF 뒤로 미룬다. 절반은 최종 이벤트까지 생략한다. DPR 1/1.25/1.5/2 각각 pan 20회·확대/축소 20회·혼합 20회·세 모드·실제 너비 변경/복원 후 0~8프레임을 기록한다. 각 단계 마지막 3프레임 native DOM/실제 Canvas ≤2px, DOM rect ≤2px, 최종 base viewport/gpp 최신화, A/B/pin 원좌표 유지, stale V를 SDK로 역전송하지 않음을 검사한다. 초기 stale frame은 숨기지 않고 timeline에 보관한다. 여섯 범위 station/label/eligible 개수는 `p3_validation.json`에 기록한다. 이 검사는 실제 NAVER 이벤트 순서의 관측이 아니다.

mock은 앱 변환을 호출하지 않는 비선형 세계 좌표(방향 기울기·곡률)와 정수 줌을 쓴다. 390×844, 768×1024, 1280×900, 1365×768, 1920×1080 × DPR 1/1.25/1.5/2의 20개 조합을 검사한다. 각 조합은 네 항만 × 폭 1.5/9/60/600km를 검사한다. 기존 affine 방식이 2px를 넘는 경우도 검사하며 수정된 표시 변환의 오차는 1e-5 CSS px 미만이어야 한다. 최종 360개 화면 검사 최대 오차는 2.73e-09 CSS px, 기존 affine 비교 최대 오차는 35.508 CSS px였다. 정확한 실행 결과는 `p3_validation.json`에 기록한다. 실제 NAVER 측정값이 아니다.

독립 native DOM mock은 20개 조합 × 전국/광역/10/5/2/1km 및 DPR 3 별도 검사를 합쳐 126개를 측정했다. 실제 Canvas 픽셀 기준 최대 errorPx는 0.247959 CSS px, 최대 DOM 사각형 차이는 0.000000px였다. 내부 비교가 통과해도 native DOM에 넣은 6px 이동과 provider DOM의 5px 원점 차이를 검출한다. SATELLITE 기본값·legacy 이관·세 모드 전환·공개 호스트 debug 부재도 통과했다. 이는 실제 NAVER 수치가 아니다.

Canvas 이벤트 핸들러의 A→B·hover·pan·wheel·두 포인터 pinch, 작은 줌 누적, 줌 기준점, SDK 범위 안의 수심 요청, 3px 차단·복구, 실패 시 raw 복귀, 배경 투명·마스크·아이콘, 모드 전환 상태 보존을 검사한다. 합성 touch 이벤트는 물리 휴대폰 검증을 대신하지 않는다. 외부 HTTPS를 차단해 NAVER 요청과 실 credential을 CI에서 사용하지 않는다. SDK 404/429/offline/콜백 timeout/인증 실패도 mock으로 검사한다.

기존 main baseline의 동해안 8곳 × 동쪽 0/500/1000m 수심·기준면·출처와 A→B 전체 301개 표본·특징 해시를 비교한다. baseline을 수정본으로 갱신하지 않는다. 기존 CI 12개 명령과 빌드 일치 검사도 실행한다. 390×844와 1280×900의 다섯 탭 및 활성 mock의 핀·아이콘·A→B·축척·미니맵을 PNG로 직접 확인했다. 원격 결과는 PR checks에 연결한다.

## 수심 보호

`static/depth/`, `04_depth.js`, `04b_depth_tiles.js`, `18_section.js`, `data/`는 변경하지 않는다. production 42타일·35,982점, verticalDatum·KHOA provenance, 12타일·60,000점·8MiB 제한, 육지/외삽 차단과 fallback은 동일하다. 바뀐 수심 부분은 화면 투영에 맞는 요청 bbox를 만드는 외부 표시 어댑터뿐이며 기존 depthPrepareAreas의 제한·공유·퇴거를 그대로 통과한다.

## 사용자 localhost 실제 검증

최신 LatLngBounds 변경은 홍원에서 시작해 다음 순서를 연속 실행한다. 각 행의 status=settled, unchanged=false, inside=true, valid=true, errorPx≤2를 확인하고 실제 지도 이동도 함께 확인한다. 실패 행의 command.before/after/requestedBounds/trace를 기록한다. 키와 SDK 객체는 포함하지 않는다.

```js
await naksigwangMapDiagnostic.fit(10000,36.15983,126.50376)
var checks = []
for (var [name,lat,lon] of [
  ['홍원→속초',38.20854,128.5947], ['속초→포항',36.05,129.38],
  ['포항→주문진',37.89192,128.8312883028771], ['주문진→홍원',36.15983,126.50376],
  ['홍원→포항',36.05,129.38], ['포항→속초',38.20854,128.5947]
]) {
  var r = await naksigwangMapDiagnostic.fit(10000,lat,lon)
  checks.push({name,status:r.command.status,type:r.command.fitBoundsType,
    unchanged:r.command.sdkViewportUnchanged,inside:r.command.trace.at(-1)?.inside,
    valid:r.valid,errorPx:r.errorPx,reason:r.reason})
  if (!r.valid) console.log(name,r.command)
}
console.table(checks)
```

이번 수정의 우선 재검증은 아래 두 명령이다. 실제 화면이 해당 항만으로 바뀌는지 확인하고 command.status/target/center/renderCenter, trace의 reached/zoomPending/occupancy와 최종 errorPx를 기록한다. 실패하면 reason과 command.trace를 함께 전달한다. 이 객체에 credential은 없다. 검색창의 같은 좌표와 홍원항 이름, 다섯 범위 버튼도 반복한다.

```js
var sokcho = await naksigwangMapDiagnostic.fit(10000,38.20854,128.5947)
console.log(sokcho.valid,sokcho.errorPx,sokcho.reason,sokcho.command)
console.table(sokcho.command.trace)
var pohang = await naksigwangMapDiagnostic.fit(10000,36.05,129.38)
console.log(pohang.valid,pohang.errorPx,pohang.reason,pohang.command)
console.table(pohang.command.trace)
```

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

명령 시작부터 빠짐없이 기록하려면 같은 좌표가 화면 안에 있는 10km 보기에서 다음을 실행한다. 마지막 3프레임의 errorPx와 baseFrame.viewport/gpp, stationDrawStats도 비교한다. 이후 UI의 지도 이동 모드로 실제 drag/wheel/pinch를 반복한다. 단면 모드에서 A/B를 그린 뒤 전국 → 속초 → 이동 → 줌 → 전국을 반복하고 지리 위치가 유지되는지 확인한다.

```js
await naksigwangMapDiagnostic.fit(10000)
const panResult = await naksigwangMapDiagnostic.pan(40, 20)
console.table(panResult.timeline.map(({frame,providerCenter,providerZoom,gpp,errorPx}) => ({frame,providerCenter,providerZoom,gpp,errorPx})))
const zoomResult = await naksigwangMapDiagnostic.zoom(2)
zoomResult.timeline // center, bounds, V, rect, native/Canvas, baseFrame 포함
await naksigwangMapDiagnostic.zoom(0.5)
```

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

사용자는 현재 서해안 viewport의 동일 좌표 native-vs-Canvas 약 0.0377px 정합을 확인했다. 이전 버전 속초 fit 약 0.04165px 성공이 추가로 보고됐다. **새 LatLngBounds 코드의 포항 fit과 연속 이동은 재검증 전까지 미확인이다.** Codex는 사용자 credential을 사용하지 않았다. mock 수치로 실 SDK 이동 성공을 주장하지 않는다. native-vs-Canvas 정합은 두 렌더러가 같은 경위도를 찍는지 확인하며 영상/측량 또는 원자료의 위치 정확도를 보증하지 않는다. 화면 밖·출처 영역은 측정 불가로 반환한다. 합성 touch와 mock DOM은 실제 기기·SDK 프레임 검증을 대신하지 않는다. 공개 방문자의 NAVER 설정 주입 단계는 별도이며 설정이 없으면 기본 지형으로 동작한다.

공식 근거: [MapSystemProjection 화면/세계 좌표 API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.MapSystemProjection.html), [지도 유형](https://navermaps.github.io/maps.js.ncp/docs/tutorial-MapTypes.html), [Marker HTML 아이콘·anchor](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Marker.html), [지도 투영](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Projection.html), [Map 줌·이벤트 API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html), [SDK 설정](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html), [허용 URL](https://guide.ncloud-docs.com/docs/en/maps-troubleshoot).

## 이번 연속 이동 검사 결과

4개 DPR 합계 264단계를 통과했다. 단계별 마지막 errorPx 최대는 0.304936 CSS px, DOM 차이는 0px였다. 초기 stale frame 수는 DPR 순서대로 [33, 33, 33, 33]개로 기록되었고 마지막 세 프레임은 모두 ≤2px였다.

| 범위 | 화면 지점 | 라벨 | LOD 허용 목록 | m/px |
|---|---:|---:|---:|---:|
| 전국 | 71 | 47 | 81 | 632.045 |
| 동해안 | 86 | 24 | 480 | 311.145 |
| 60km | 12 | 9 | 606 | 76.735 |
| 10km | 0 | 0 | 606 | 9.592 |
| 2km | 0 | 0 | 606 | 2.398 |
| 1km | 0 | 0 | 606 | 1.199 |

1280×900 mock 기준이다. 근거리 기준점(38.20854,128.5947) 주위의 목록에 지점이 없으면 화면 개수는 0일 수 있으며 좌표나 가짜 지점을 추가하지 않았다. eligible은 화면 범위와 무관한 LOD 허용 개수로 확대 시 상세 단계가 늘어남을 검증한다.

## 이번 명시적 이동 검사 결과

DPR [1, 1.25, 1.5, 2]에서 명시적 이동/검색/범위 버튼 88개 측정이 통과했다. native DOM/실제 Canvas 최대 오차는 0.221596 CSS px였다. 빠른 검색의 이전 9개 취소, 같은 중심의 옛 zoom 차단, 미도착 이유 구분과 재검색 복구도 각 DPR에서 통과했다. 12 RAF 지연 fit은 측정 시작 전 각각 [13, 13, 13, 13]프레임을 관찰했다.

| DPR | 속초 fit errorPx | 포항 fit errorPx | timeout reason |
|---|---:|---:|---|
| 1 | 0.000000 | 0.000000 | requested viewport not reached |
| 1.25 | 0.046187 | 0.221596 | requested viewport not reached |
| 1.5 | 0.000000 | 0.000000 | requested viewport not reached |
| 2 | 0.000000 | 0.000000 | requested viewport not reached |

기존 native DOM 검사 126건, 연속 이동 264단계와 20개 화면/DPR 검사도 통과했다. 이 결과는 mock이며 사용자 보고의 현재 viewport 0.0377px와 구분한다.

## LatLngBounds 최종 mock 결과

네 DPR에서 연속 6회 ×4 = 24회 원거리 이동이 모두 center/key/bounds 변경·목표 포함·settled·native 정합 기준을 통과했다. 전체 명시적 이동/검색 104건 최대 오차는 0.221596 CSS px다. 기존 native DOM 126건 최대 0.247959px, 연속 이동 264단계 최종 최대 0.304936px, DOM 차이 0px였다.

| 이동 | 네 DPR 최대 errorPx |
|---|---:|
| 홍원→속초 | 0.046187 |
| 속초→포항 | 0.221596 |
| 포항→주문진 | 0.221596 |
| 주문진→홍원 | 0.221596 |
| 홍원→포항 | 0.221596 |
| 포항→속초 | 0.046187 |

객체 배열 거절과 SDK 전체 미변경 실패 검출은 네 DPR에서 모두 통과했다. 이는 선택한 입력 계약과 mock 결과이며 새 코드의 실 NAVER 포항 성공은 사용자 재검증이 필요하다.


## P0 이동 성능·화면 안정화 (2026-10-17)

최종 실사용 판정은 **사용자 localhost에서 렉·흩어짐이 사라졌는지 확인 대기**다. 아래 수치는 Windows Chromium headless의 비선형 SDK mock이며 실제 NAVER/휴대폰 하드웨어의 측정값이 아니다. 이전 사용자 보고의 실제 정합 약 0.04px는 보존해야 할 기준이고 이번 mock 수치로 대체하지 않는다. 실 NAVER 포항 연속 fit 성공도 여전히 미확인이다.

### 확인한 병목과 수정

기존 `frame()`은 정지 중에도 `providerSync`, `updateHover`, `drawUI`, `drawCrnt`, `stepParticles`, `drawSection`을 매 프레임 호출했다. 이동 중 `dirty → providerCheck → dirty → renderBase`가 내부 정합·해안 Path·station·육지 mask·getImageData를 반복했다. 보이는 구간보다 훨씬 긴 해안 ring까지 SDK로 투영하는 비용도 확인했다. 이것은 코드와 mock으로 확인한 앱 병목이며 사용자 장치의 실 SDK CPU profile을 직접 측정한 결과는 아니다.

- SDK drag/pinch/zoom 시작부터 Canvas 3장을 함께 숨긴다(방법 A). 원본 좌표나 CSS origin에 offset을 더하지 않는다. 이전 포인트·핀·A/B·흐름 잔상을 표시하지 않는다.
- native gesture 동안 SDK viewport polling·base/mask/흐름장·단면·수심 예약을 멈춘다. drag/pinch 종료 후 최종 idle, zoom 종료 또는 명시적 명령 뒤 표시 projection의 안정된 두 프레임을 확인한다. 이벤트 뒤 관찰은 최대 16프레임이고 정지 중에는 반복하지 않는다. 기존 명시적 fit의 pending/commandId/timeout 구조는 유지한다.
- 마지막 SDK viewport를 한 번 읽어 호환 V·100m ground scale을 캐시한다. 최종 base와 UI를 같은 화면 갱신에서 그린 후 Canvas를 다시 보인다. 이동이 취소되어 SDK 이벤트가 없어도 bounded settle로 숨김을 해제한다.
- base는 기존 `dirty`, UI·화살표·단면·계기판은 별도 상태 key, 흐름장은 `flowStale`로 무효화한다. viewport·LOD·구조물 변경이 없으면 Path/mask를 재사용한다. 수심 갱신만으로 mask readback을 반복하지 않는다. 이동 때문에 취소한 수심 예약은 최종 idle에 복구한다. 수심 로딩 완료 후 기존 단면 함수가 예약을 다시 만들어도 다음 base 갱신이 SDK 네 면 범위를 다시 예약한다. 고의 changed 응답을 이용한 회귀에서 동일한 전체 viewport 범위가 유지되는지 확인한다.
- SDK 투영 전에 화면 밖의 같은 쪽에 머무는 긴 해안 구간을 생략한다. 보이는 꼭짓점의 SDK 투영은 그대로 사용한다. 기존 구현과 raster mask를 직접 비교했다. 속초 10km 예: 해안 project 36,545 → 451회, 포항 10km 36,503 → 177회. 전국 화면은 남는 꼭짓점이 많아 절감 폭이 작다.
- 입자는 900개에서 PC 시작 360개/휴대폰 180개, 할당 상한 480개로 줄였다. 실제 이전 frame 작업 시간이 20ms를 넘는 상황이 반복되면 25%씩 줄이며 최저 120개다. 그리기 상한은 PC 30Hz/휴대폰 20Hz다. 이동·비활성 지도 탭·background에서 정지하고 idle 후 한 번 respawn한다.
- 조류 화살표 bitmap은 viewport·시간·조류 자료·DPR·크기가 바뀔 때만 다시 만든다. 단면과 readout은 자료·A/B·시간·hover·크기 변경에만 다시 그린다. 재생 중에는 시간 key를 제한한다. 정지 중 단면 물결도 매 프레임 그리지 않는다. 보호된 `18_section.js`는 수정하지 않았다.
- resize로 backing canvas가 초기화되면 별도 UI/단면 key도 무효화한다. 단면 모드에서 Canvas가 잠시 숨겨져도 stage가 연속 wheel 입력을 받는다. background에서는 앱 RAF 자체를 중단하고 복귀 시 다시 예약한다.

이벤트 의미는 [NAVER 공식 Map 문서](https://navermaps.github.io/maps.js.en/docs/naver.maps.Map.html)의 dragstart/dragend, pinchstart/pinchend, zoomstart/zoomend, idle에 따른다. 실 SDK의 이벤트 순서와 렌더 지연은 localhost에서 다시 확인해야 한다.

### 같은 60프레임 입력의 전후 비교

`python tests/test_map_perf_comparison.py`로 `1ea95e6`의 index를 그대로 실행한 값과 현재 빌드를 같은 mock 입력으로 비교했다. 조류 켜짐·시간 재생 꺼짐, DPR 1이다. 입력 중 60회 viewport 변경을 보내고 마지막 idle 복구는 별도로 센다. 원시/요약 값은 `tests/P3_PERF_RESULTS.json`에 있다.

| 호출 | 기존 정지 60프레임 | 수정 정지 60프레임 | 기존 이동 60프레임 | 수정 이동 / 마지막 복구 |
|---|---:|---:|---:|---:|
| providerSync | 60 | 0 | 60 | 0 / 1 |
| providerCheck·alignment 각각 | 0 | 0 | 59 | 0 / 1 |
| renderBase·stationRedraw 각각 | 0 | 0 | 59 | 0 / 1 |
| mask·getImageData 각각 | 0 | 0 | 59 | 0 / 1 |
| updateHover | 60 | 0 | 60 | 0 / 0 (hover 없음) |
| drawUI·drawCrnt 각각 | 60 | 0 | 60 | 0 / 1 |
| drawSection | 60 | 0 | 60 | 0 / 0 (A/B·시간 변경 없음) |

입자는 정지 화면에서도 흐름을 표현하지만 제한된 주기로만 그린다. 명시적 진단은 실제 raster를 읽으므로 `getImageData` 계측에 별도로 포함된다. stress에서 반복한 Marker 진단의 9회 readback을 정상 이동의 mask readback으로 해석하면 안 된다.

| 화면 | 이동 FPS 전 → 후 | p95 frame ms 전 → 후 | 50ms 이상 frame 전 → 후 |
|---|---:|---:|---:|
| 390×844 | 31.65 → 62.43 | 34 → 17 | 1 → 0 |
| 1280×900 | 21.02 → 62.57 | 52 → 21 | 9 → 0 |
| 1920×1080 | 20.80 → 62.57 | 54 → 18 | 13 → 0 |

시간 값은 장치·동시 작업·Chromium 스케줄에 따라 달라진다. 실제 PC/휴대폰 FPS의 보증값이 아니다.

### stress 결과

3 화면 × DPR 1/1.25/1.5/2, 총 12조합에서 좌우 pan 20회·상하 pan 20회·zoom 20회·혼합 30회, 합계 **1,080회**를 검사했다. 각 gesture마다 이동 중 세 Canvas 숨김, 무거운 호출 0회, 최종 native Marker DOM 중심 대 실제 Canvas crosshair ≤2px, 원좌표 drift 없음이 통과했다. A/B는 각 phase 종료 후 별도 native DOM 기준과 Canvas의 주황 원 외곽 raster를 비교했다. 글자/연결선은 원 둘레 검출에서 배제한다.

| 화면 | DPR | phase 평균 FPS 범위 | 최악 p95 frame ms | 최대 idle 복구 ms | 최대 Marker px | 최대 A/B px |
|---|---:|---:|---:|---:|---:|---:|
| 390×844 | 1 | 62.1~62.6 | 17 | 72 | 0.000 | 0.559 |
| 390×844 | 1.25 | 62.3~62.6 | 20 | 71 | 0.447 | 0.354 |
| 390×844 | 1.5 | 62.2~62.5 | 20 | 56 | 0.000 | 0.354 |
| 390×844 | 2 | 62.3~62.6 | 17 | 58 | 0.000 | 0.250 |
| 1280×900 | 1 | 61.9~62.5 | 18 | 63 | 0.000 | 0.707 |
| 1280×900 | 1.25 | 59.2~61.2 | 22 | 71 | 0.281 | 0.250 |
| 1280×900 | 1.5 | 57.6~62.5 | 35 | 72 | 0.000 | 0.354 |
| 1280×900 | 2 | 57.9~60.9 | 25 | 67 | 0.000 | 0.559 |
| 1920×1080 | 1 | 57.5~58.9 | 32 | 71 | 0.000 | 0.901 |
| 1920×1080 | 1.25 | 57.8~59.3 | 32 | 70 | 0.280 | 0.354 |
| 1920×1080 | 1.5 | 58.5~59.2 | 32 | 71 | 0.333 | 0.354 |
| 1920×1080 | 2 | 57.2~61.5 | 26 | 66 | 0.000 | 0.559 |

모든 조합에서 일반 이동 phase의 100ms 이상 long task는 0회였다. 이동 중 base/mask/흐름장/정합/단면 호출은 0회다. idle 복구는 최대 72ms이며 mock의 250ms 목표를 만족했다. 이는 최종 idle 이벤트부터 base 복구까지의 시간이다. 실제 SDK 자체의 명령 적용 대기시간과 네트워크 타일 로딩 시간은 포함하지 않는다.

속초→포항→주문진→홍원 4회 ×12조합=48회는 settled와 실제 raster 정합을 통과했다. SATELLITE↔HYBRID↔NORMAL 3회 반복·오늘↔지도 5회 반복·비활성 탭의 입자 정지·background RAF 중지·숨겨진 Canvas 위 연속 wheel도 검사했다. 오늘 탭은 원래 기능대로 선택 포인트의 예시 단면을 새로 만든다. pan/zoom/모드 변경 중 원좌표 보존과 구분한다.

해안 Path 최적화는 세 지역 × 네 축척 ×12조합=144 mask 비교에서 변경 픽셀 0개였다. 기존 20개 화면/DPR, DPR 3 backing cap, 늦은 projection·이른 idle, 원거리 6회 연속 이동, no-op SDK 실패·timeout·신규 명령 취소, DOM mismatch, native 3px/6px 오차 차단도 유지한다.

390×844와 1280×900의 다섯 탭, active mock의 이동 중/idle 캡처를 직접 확인했다. 실제 위성 배경의 동영상/실장치 육안 판정은 사용자 확인 대기다.

### 자료 보호·기존 기능

SATELLITE 기본·HYBRID/NORMAL과 preference migration, 선택점·핀·A/B·hover, native pan/wheel/pinch, terrain fallback을 유지했다. 실제 정합 판정은 동일 lat/lon의 native DOM 중심과 Canvas 실제 픽셀의 거리이며 SDK project끼리의 비교만으로 실 정합 성공을 주장하지 않는다. Marker ≤2 CSS px인데 항/갯바위와 위성 구조물이 다르면 POINTS/PORTS/ROCKS/OSM 원자료 오차로 분류하며 전체 항 좌표를 이동하지 않는다.

`static/depth/`, `04_depth.js`, `04b_depth_tiles.js`, `18_section.js`, `data/`의 diff는 없다. production 42타일/35,982점과 verticalDatum/source/provenance, 12타일/60,000점/8MiB, 육지·외삽 차단·fallback을 유지했다. 기존 8개 지점과 A→B 301점 baseline은 정확히 동일하다. CI 보호 검사에도 `18_section.js`를 추가했다.

빌드 `missing ids: []`, 기본 smoke와 기존 CI 전체 명령, 전체 지도 회귀, 신규 성능 회귀, 빌드 플랫폼 일치가 통과했다. CI에 신규 12조합 성능 회귀를 추가하고 실행 제한을 25분으로 늘렸다. CI는 실제 NAVER API/credential을 사용하지 않는다.

### 변경 파일

- 실행 코드: `src/app/15_view.js`, `15b_map_provider.js`, `15c_map_diagnostic.js`, 신규 `15d_render_state.js`, `16_terrain.js`, `17_flow.js`, `21_input.js`, `23_main.js`
- 화면·빌드 결과·코드 지도: `src/template.html`, `index.html`(build.py 생성), `src/README.md`
- 검사: `tests/p3_provider_checks.js`, `p3_depth_guard.py`, `test_map_provider.py`, 신규 `p3_perf_baseline.js`, `p3_perf_checks.js`, `p3_path_checks.js`, `test_map_performance.py`, `test_map_perf_comparison.py`
- 보고서·측정값·CI: `tests/P3_MAP_REPORT.md`, 신규 `tests/P3_PERF_RESULTS.json`, `.github/workflows/ci.yml`

정지 성능 계측은 초기 자료 로딩·수심 예약·base/단면 변경이 실제로 멈춘 뒤 시작한다. 초기 로딩의 정상 렌더를 정지 중 중복 렌더로 오인하지 않는다. CI 시간 성능은 호스트 변동이 있어 기록하고, 호출 차단·가시성·정합·drift·mask 동일성은 assertion으로 검사한다.

### localhost 재검증

1. 이 branch의 최신 index를 로드한다. 필요하면 저장소에서 `python build.py`, 기존 localhost 서버를 계속 쓰거나 `python -m http.server 8000 --bind 127.0.0.1`로 실행한다. 기존 NAVER 로컬 설정은 유지한다. 코드 갱신 후 브라우저에서 새 빌드를 한 번 로드한다.
2. 지도 탭에서 기본 위성, 위성+지명, 일반을 전환한다. 선택점·핀·A/B·hover가 유지되고 추가 depth 요청이 없는지 Network를 확인한다. native 정합 원을 지운 뒤 성능 계측을 시작한다.

```js
naksigwangMapDiagnostic.clear();
naksigwangPerfDiagnostic.reset();
```

3. 먼저 5초 정지 후 `naksigwangPerfDiagnostic()`를 저장한다. counts의 providerSync/providerViewportKey/providerCheck/renderBase/maskRebuild/getImageData/drawSection이 0인지 본다(자료 로딩과 재생이 끝난 상태). callsPerSecond는 reset 이후 평균 초당 빈도, costs는 각 함수의 total/max ms다. FPS·p95FrameMs·p95WorkMs·longTasks도 함께 저장한다.
4. reset 후 좌우 20회, 상하 20회, wheel 20회, 혼합 30회를 각각 실행한다. 이동 중 분석 overlay가 잠깐 숨고 손을 뗀 뒤 250ms 목표/500ms 이내에 한꺼번에 복구되는지, 이전 포인트 잔상·서로 다른 방향으로 튀는 표시·station 흩어짐이 없는지 눈으로 확인한다. `idleRecoveryMs`도 저장한다.
5. 각 명령은 반드시 await하고 다음 원거리 명령을 순서대로 실행한다.

```js
await naksigwangMapDiagnostic.fit(10000,38.20854,128.5947); // 속초
await naksigwangMapDiagnostic.fit(10000,36.05,129.38); // 포항
await naksigwangMapDiagnostic.fit(10000,37.89192,128.8312883028771); // 주문진
await naksigwangMapDiagnostic.fit(10000,36.15983,126.50376); // 홍원
```

6. `valid/passes`, `errorPx≤2`, `domMismatchPx=0`, command settled와 before/after center·zoom·bounds 변화를 저장한다. 포항 실패 시 requestedBounds·fitBoundsType·sdkViewportUnchanged·trace를 포함한 반환값을 보낸다. credential은 반환하지 않는다.
7. 각 위치에서 A/B를 그려 endpoint·단면 hover를 확인하고 3개 모드/오늘↔지도를 반복한다. PC 1280×900·1920×1080과 휴대폰 390×844, DPR 1/1.25/1.5/2에서 반복한다. PC 45 FPS·휴대폰 30 FPS, 일반 이동 100ms 이상 task 없음도 실제 계측으로 확인한다.

### 남은 한계

- 사용자 localhost의 실제 NAVER pan/zoom 렉·시각 안정성·idle 지연과 연속 포항 fit 성공은 아직 미확인이다. mock 통과로 실사용 최종 통과를 선언하지 않는다.
- 이 항목의 이전 16프레임 감시/숨김 유지 정책은 아래 overlay 회귀 수정으로 대체했다. 종료 이벤트 누락·역순을 처리하고, 안정화 관찰 상한에 도달하면 기본 지형 fallback을 그린 뒤 공개한다.
- 전국 지도는 긴 해안선이 대부분 보이므로 꼭짓점 생략 효과가 작다. 저사양 실장치·타일 네트워크·GPU 성능은 mock 결과로 보증할 수 없다.
- 이동 중 분석 Canvas는 의도적으로 숨겨진다. native debug 원만 보이는 것은 localhost 진단의 동작이다. 단면 물결은 시간 재생이 꺼져 있을 때 정지한다.
- 원자료의 항/갯바위 좌표 정확도와 수심 coverage의 기존 제한은 변경하지 않았다.


## 이동 후 overlay 공개 회귀와 위성 타일 분리 진단 (2026-10-17~18)

사용자는 최신 성능 최적화로 실제 pan/zoom 렉이 크게 줄었다고 확인했다. 그러나 이동 후 분석 Canvas가 사라지고 위성만 남는 회귀, 확대 시 위성의 큰 직사각형 블록을 보고했다. 아래 결과는 코드·mock 검증이며 최신 수정의 실 NAVER 결과는 사용자 localhost 재검증 대기다. 위성 블록의 실제 원인은 **미확인**이다. P3 완료/merge 가능 판정을 하지 않는다.

### 재현한 코드 원인과 공개 순서

직전 커밋 `16b9ee7`의 동일 browser/mock 재생 결과:

| 이벤트 | 이전 상태 | 수정 후 상태 |
|---|---|---|
| dragstart → idle (dragend 누락) | gesture=true, moving=true, hidden=true | 모두 false |
| dragstart → idle → dragend | waitingIdle=true, moving=true, hidden=true | 모두 false |

idle에서 gesture를 해제하지 않았고, 늦은 dragend에서 waitingIdle을 다시 켜서 settle 감시 진입이 막혔다. 별도로 16프레임 감시 상한 도달 시 숨김을 유지하는 경로도 있었다. 이는 코드상 재현한 원인이다. 사용자의 실제 이벤트 순서는 새 trace로 확인해야 한다.

실제 누른 포인터가 없으면 idle이 gesture 대기를 해제한다. dragend/zoomend/pinchend는 추가 idle이 없어도 마지막 표시 viewport의 안정성을 관찰한다. 실제 포인터가 눌려 있으면 조기 idle만으로 공개하지 않으며 마지막 pointerup/cancel도 관찰을 재개한다. 안정화 불능은 viewport 변화가 멈췄는데도 최대 120 RAF 동안 안정화되지 않으면 기본 지형 fallback으로 복구한다. 표시 viewport가 계속 변하는 정상 이동에서는 관찰 상한을 갱신해 조기 fallback을 막는다. resize도 분석 Canvas를 숨긴 상태에서 SDK 표시 viewport를 안정화한 뒤 공개한다. 대기 시간을 하드코딩해 성공으로 판정하거나 지도 인스턴스를 다시 만들지 않는다.

`renderBase` 내부 공개를 제거했다. frame의 최종 렌더 경로는 `providerReadView → renderBase → drawUI → drawCurrentOverlay → 필요한 flow/section → providerRevealOverlay`다. no-change, 명령 성공/실패/취소, fallback도 최종 그리기 후 공개한다. 공개 후 UI를 다시 무효화하던 코드도 제거했다. 이동 중 무거운 렌더 차단·이벤트 기반 sync·입자 예산·throttle·path/mask cache·background RAF 중지는 유지한다.

### 진단과 보안

localhost에서만 `naksigwangTileDiagnostic(clientX?, clientY?)`와 `naksigwangPerfDiagnostic.providerOnly(true/false)`를 제공한다. 공개 호스트에는 노출하지 않는다.

타일 진단은 provider mode/zoom/center/bounds/container rect, provider CSS와 마지막 SDK setSize 시점/횟수, 하위 IMG 개수·보이는 IMG 개수, 각 rect/naturalWidth/naturalHeight/complete, CSS 크기 분포, 네 이동 상태와 세 Canvas opacity/display/visibility, 최근 SDK 이벤트를 반환한다. IMG에는 attribution 등도 포함될 수 있어 IMG 개수 자체를 실패 타일 개수로 해석하지 않는다. viewport와 교차하고 조상 CSS까지 보이는 IMG를 세지만 다른 IMG가 위를 덮는지는 판정하지 않는다.

이번 provider health 수정부터 타일 진단은 IMG currentSrc/src를 읽거나 반환하지 않는다. 이전의 가린 hostname/path 정보도 제거했다. URL/query/key/credential과 SDK 예외 메시지는 기록·반환하지 않는다. 진단은 DOM metadata만 읽으며 타일 요청·교체·캐시 저장을 하지 않는다.

두 인수는 브라우저 client 좌표다. 해당 위치의 base/flow/ui 실제 RGBA를 읽는다. providerOnly=true에서도 Canvas backing 픽셀은 보존되므로 opacity/visibility와 함께 해석한다. providerOnly는 stage 직계 `#base/#flow/#ui`만 숨기고 providerMap/SDK pane/IMG/control/attribution에는 스타일을 바꾸지 않는다. 이동 CSS와 기존 Canvas 배치/하단 출처 clip CSS도 같은 직계 세 ID로 좁혀 SDK 내부 Canvas에 전파되지 않는다.

`tilesloaded`는 실제 SDK 콜백에서 viewport 이벤트와 같은 trace에 기록하며 이벤트 시점의 providerMoving/revealAfterBase/commandPending/heavyHidden도 남긴다. idle과 타일 완료는 별개다. 타일 로딩을 기다리기 위해 올바른 분석 Canvas를 계속 숨기지 않는다.

### 자동 검증 범위

- 기존 90회 이동 성능 시나리오의 각 종료마다 세 Canvas computed opacity/display/visibility 및 숨김 class를 검사한다.
- drag/zoom/pinch 각각 20회에서 종료→idle, idle→종료, 종료 누락을 섞어 검사한다. 누른 포인터 중 조기 idle, 포인터 종료 시 SDK end 누락, no-change/no idle도 검사한다.
- 최종 read/base/UI/current/section/reveal 호출 순서를 직접 계측한다. 모드·resize·오늘→지도·취소·fit 성공/실패·안정화 timeout/fallback도 가시성을 검사한다.
- mock IMG의 안전한 metadata, 미완료 상태, query/경로 비공개, providerOnly에서 SDK IMG 유지, 불투명 Canvas 픽셀과 provider layer의 분리, idle 뒤 tilesloaded 순서를 검사한다.
- 3 화면 ×4 DPR, 기존 20 화면/DPR 정합·원거리 6회 연속 이동·native 3px 차단·DOM mismatch·수심/단면 baseline·전체 기존 회귀를 유지한다. 실 API/credential을 사용하지 않는다.

### 사용자 localhost 재검증

1. 이 브랜치를 최신으로 갱신하고 `python build.py`, `python -m http.server 8000`을 실행한다. 기존 로컬 NAVER 설정 방식으로 SDK를 활성화하고 `http://localhost:8000/index.html#map`을 강력 새로고침한다. credential을 콘솔 출력·보고서에 복사하지 않는다.
2. `await naksigwangMapDiagnostic.fit(10000,38.20854,128.5947)` 뒤 `await naksigwangMapDiagnostic.fit(10000,36.05,129.38)`를 실행한다. 두 번째 command.status/errorPx/sdkViewportUnchanged를 기록한다.
3. drag/wheel/pinch를 각각 반복하고 멈춘 뒤 `naksigwangTileDiagnostic()`을 실행한다. 정상 idle에서는 providerMoving/revealAfterBase/commandPending/heavyHidden 모두 false, 세 Canvas visible이어야 한다. 1~2분 반복해 렉·흩어짐·잔상·누적 drift도 확인한다.
4. 블록이 보이는 위치·zoom에서 진단을 저장하고 `naksigwangPerfDiagnostic.providerOnly(true)`를 실행한다. 블록이 남는지 즉시/몇 초 뒤/tilesloaded 뒤를 비교한다. 필요하면 `naksigwangTileDiagnostic(clientX,clientY)`로 같은 블록 위치의 분석 Canvas RGBA를 확인한다.
5. providerOnly 상태에서 위성(SATELLITE)·위성+지명(HYBRID)·일반(NORMAL)을 비교하고 각 진단의 zoom/center/rect/tiles/events를 저장한다. 이후 `naksigwangPerfDiagnostic.providerOnly(false)`로 복원한다.
6. Canvas를 숨겨도 같은 블록이 유지되면 분석 Canvas 원인에서 제외할 수 있다. tilesloaded 뒤 사라지면 타일 lifecycle 가능성을 조사한다. 충분히 기다린 동일 좌표에서 SATELLITE/HYBRID에 동일 경계가 남고 NORMAL에는 없다면 제공 영상 모자이크 가능성을 분류한다. 이 조건과 실제 사용자 증거 없이 원인을 확정하지 않는다.

실 NAVER fit 결과, 최신 overlay 복원, 1~2분 렉/잔상/drift, 위성 블록 원인 모두 **사용자 localhost 재검증 대기**다. 기존 정합 약 0.04px 성공은 이전 사용자 측정이며 최신 수정의 실측 결과를 대신하지 않는다. 수심 보호 경로와 운영 자료에는 변경이 없다.


### 이번 공개 회귀 수정의 성능 비교

직전 `16b9ee7`과 같은 60프레임 burst를 비교했다. Windows headless mock이며 실제 SDK·장치 성능과 구분한다.

| 화면 | 이전 FPS | 수정 FPS | 이전/수정 p95 | 이동 중 base | 최종 idle base |
|---|---:|---:|---:|---:|---:|
| 390×844 | 50.72 | 62.57 | 17 / 17ms | 0 | 1 |
| 1280×900 | 62.57 | 62.57 | 17 / 17ms | 0 | 1 |
| 1920×1080 | 62.57 | 62.50 | 17 / 17ms | 0 | 1 |

정지 중 SDK sync/check·base·mask 읽기·UI·단면의 불필요 호출은 0회였다. OS/브라우저 변동이 포함되므로 FPS 차이를 이번 수정만의 인과 효과로 주장하지 않는다. 구조상 heavy 렌더 회귀가 없고 공개 후 moving=false/hidden=false였다.

최종 소스 집중 검사에서는 세 화면 각각 73개 종료 상태에서 permanent hidden 0회를 확인했다. 실제 DOM의 opacity=1/display=block/visibility=visible과 네 이동 상태가 모두 false인 것을 함께 기록했다. viewport가 130프레임 계속 변할 때 조기 fallback하지 않고, 변화가 멈춘 뒤 안정화 불능일 때 fallback하는 검사도 통과했다. `tests/P3_REVEAL_RESULTS.json`에 직전 버전 재현·성능 비교·확장 행렬·최종 종료 상태 요약을 기록한다.


확장 12조합에서는 기존 이동 1,080회와 신규 drag/zoom/pinch 720회 종료의 가시성을 확인했고 permanent hidden/moving heavy 모두 0회였다. Marker 최대 0.447px, A/B 최대 0.901px, 해안 mask 변경 픽셀 0개, 일반 이동 100ms 이상 long task 0회였다. 병렬 회귀 중 idle 복구 최대는 **127ms**로 이전 기록 72ms보다 높았다. heavy 호출·60프레임 비교의 p95는 유지됐지만 idle 지연까지 무회귀로 단정하지 않는다. 실 장치의 복구 지연·체감은 사용자 확인 대기다. 전체 행렬 뒤 최종 CSS/resize/지속이동/버블 차단 보강은 세 화면의 최종 집중 검사에서 확인했고 최종 CI도 전체 행렬을 다시 실행한다.

기존 12개 전체 CI 명령·20개 화면/DPR와 실패/설정/공개 호스트 검사·연속 viewport/명령 집중 회귀·301점 단면 baseline·수심 production 보호·최종 build consistency가 통과했다. 모바일/PC 다섯 탭과 active mock 이동/idle 캡처를 직접 확인했다. 실제 NAVER 영상 판정과 분리한다.


## 개별 타일 오류와 provider 실패 분리 (2026-10-18)

사용자 실제 확인: 이전 심한 렉과 이동 후 overlay 영구 소실은 개선됐다. 그러나 NAVER 위성 대신 GEBCO 지형과 「온라인 지도를 불러오지 못해 기본 지형지도로 표시합니다」 안내가 나타났다. 이전에는 fallback 사유가 없어 실제 사용자 세션의 발화 경로는 확정할 수 없다. 아래 두 직접 경로를 직전 커밋 `30af641`과 수정본에서 동일 mock으로 재현했다.

| 입력 | 이전 | 수정 |
|---|---|---|
| provider 안 IMG 1개 error | failed=true, active=false | failed=false, active=true, tileErrorCount=1 |
| 정상 API + tilesloaded 12초 누락 | failed=true, active=false | failed=false, active=true, modeHealthChecks=1 |

기존 imageError 캡처 리스너는 모든 IMG 오류를 onFailure→providerFallback으로 연결했다. 타일 교체 중 단일 오류나 로고 IMG 오류도 전체 지도를 내릴 수 있었다. 수정 후 같은 실제 adapter 리스너는 providerRecordTileError만 호출한다. time/zoom/mode와 누적 수·최근 10초 수만 기록하고 SDK 자체 처리·재요청에 맡긴다. 오류 수가 많아도 그 수만으로 fallback하지 않는다. 최근 metadata 32개와 밀리초별 10초 창을 유지한다.

모드 전환은 기존 loaded 상태를 보존한다. 12초 타이머는 providerModeTimeout으로 바꾸어 map 객체, center/zoom/bounds, project/unproject, ground/viewport scale, provider DOM visibility와 SDK IMG/Canvas 존재를 확인한다. API가 정상인 경우 지도를 유지하고 tilesloaded가 없다는 이유로 실패시키지 않는다. DOM/타일이 아직 없으면 대기 상태로 관찰한다. 이 health check는 위성 영상의 도착·화질이나 native Marker 정합 성공을 증명하지 않는다.

### 실패 사유와 복구

production fallback 경로는 고정된 코드만 기록한다:

- sdk-script-load-failed / sdk-script-timeout: SDK 파일 실패 또는 초기 callback 시간 초과.
- auth-failed: 인증 실패.
- map-init-failed: 지도 생성 실패 또는 객체 소실.
- projection-failure: 필수 지도 좌표 API가 제한된 3회 재확인에서도 사용 불가.
- map-api-failure: 입력 설정 API가 반복 실패.
- browser-offline: 브라우저 offline.
- settle-failure: 기존 최종 표시 viewport 안정화 감시 실패.

manual-fallback은 테스트 정리에 사용한다. 허용하지 않은 인수·예외 객체는 unknown-provider-failure로 치환한다. 원본 예외 메시지를 저장하지 않는다. lastFallbackReason/lastFallbackAt/fallbackCount는 복구 뒤에도 원인 추적을 위해 남긴다.

단일 projection 예외는 즉시 전체 실패로 만들지 않고 분석 Canvas를 숨긴 채 최대 3 RAF에서 API를 재확인한다. 정상으로 돌아오면 기존 FINAL VIEWPORT→DRAW→REVEAL 경로로 복구한다. 지속 예외만 fallback한다. 반복 입력 API 예외도 재확인 상한으로 끝나게 하며, 실패한 setOptions를 성공으로 캐시하지 않는다.

offline·projection/map API·settle 실패는 기존 SDK 객체가 살아 있으면 online, idle, tilesloaded 또는 localhost의 `await naksigwangTileDiagnostic.retry()`에서 제한된 상태 재확인을 지원한다. offline→online 두 번을 검사했으며 같은 map 객체·인스턴스 1개를 유지했다. offline 중 바뀐 화면 크기와 선택 모드는 최종 settle 전에 같은 SDK에 동기화한다. 재확인 실패 시 무한 재시도하지 않는다. SDK 파일/인증/생성 실패처럼 재사용할 지도가 없는 경우 자동으로 인스턴스를 반복 생성하지 않는다. 초기 offline 상태에서 SDK 자체가 없었던 경우도 기존 지도 재사용 복구 대상이 아니다.

### 진단 필드와 검증

naksigwangTileDiagnostic은 tileErrorCount, tileErrorsLast10s, lastTileErrorAt, tilesLoadedCount, lastTilesLoadedAt, active/failed, lastFallbackReason, mode/zoom/center, mapProjectionHealthy, providerDOMVisible, image/complete/incomplete/decoded count를 포함한다. complete=true인 실패 IMG도 있을 수 있어 natural size가 양수인 decodedTileCount를 별도로 둔다. IMG에는 로고 등도 포함될 수 있다. mapProjectionHealthy는 유한한 API 응답과 양수 배율의 상태 확인이며 실제 영상 전달이나 DOM Marker 정합 판정과 구분한다.

새 tests/test_map_health.py는 3 화면 ×2 DPR에서 실제 NaverMapAdapter.init의 IMG 캡처 리스너, 단일 +10개 오류, 정상 load 뒤 overlay, 가상 시계 12초 누락, 10초 오류 창 만료, offline→online 두 번, 단일/지속 projection API 예외, 반복 입력 API 예외, 같은 SDK 객체 복구·offline 중 resize/모드 선택·gesture 중 health 회복의 heavy 차단, 원래 A/B와 복구 후 native Marker/Canvas를 검사한다. 기존 SDK 404/429/연결 실패/timeout/auth 검사에는 사유 assertion과 map-init 실패를 추가했다. 실 API/credential은 사용하지 않는다.

23_main의 FINAL VIEWPORT→DRAW→REVEAL, 이동 중 heavy 차단, 최종 idle base 1회, 이벤트 기반 sync, 입자/throttle, Path/mask cache, SATELLITE 기본·HYBRID/NORMAL은 되돌리지 않았다. 보호된 수심 코드·static/depth·data는 변경하지 않는다. 42타일/35,982점·datum/provenance/cache/육지·외삽 guard와 A→B 301점 baseline을 유지한다.

### 사용자 localhost 확인

최신 브랜치를 받고 기존 NAVER 설정을 유지한 채 `python build.py`, `python -m http.server 8000` 후 localhost 지도 탭을 강력 새로고침한다. 이동 모드에서 1~2분 pan/wheel/pinch하고 세 지도 모드를 바꾼다. 위성이 유지되는지, overlay가 잠깐 숨었다가 돌아오는지, 렉 개선이 유지되는지 확인한다.

블록이나 fallback이 보이면 `naksigwangTileDiagnostic()`의 active/failed, lastFallbackReason, tileErrorCount/tileErrorsLast10s, tilesLoadedCount, mapProjectionHealthy, DOM visibility를 기록한다. 블록 위치에서 `naksigwangPerfDiagnostic.providerOnly(true)`로 SDK 영상만 비교하고 `false`로 복원한다. recoverable=true이고 online/SDK 객체가 살아 있으면 `await naksigwangTileDiagnostic.retry()` 후 최종 idle의 진단을 다시 확인한다. 정상 타일 상태에서 retry는 불필요하며 타일을 직접 요청하지 않는다.

이번 실제 fallback의 발화 경로와 최신 위성 유지·렉/overlay 복원은 **사용자 localhost 재검증 대기**다. 위성 블록의 원인은 providerOnly 실제 결과 전까지 **미확인**이다. 자동 검증으로 P3 완료/merge 가능을 판정하지 않는다.

### 최종 로컬 회귀 기록

계측 원자료 요약은 `tests/P3_HEALTH_RESULTS.json`에 있다. health 6개 조합, 기존 provider 20개 화면/DPR와 DPR 상한·SDK 실패 6종·설정 4종·production 진단 제거(총 32개 결과), performance 12개 조합이 통과했다. legacy 12개 검사 중 smoke_degradation의 첫 실행은 partial_station 시작 시간 초과였고, 소스를 고정한 후 해당 전체 검사를 재실행하여 통과했다. 첫 시간 초과 원인은 확정하지 않았다. provider 높이 변경 검사의 고정 350ms 대기는 실제 크기 조건을 기다리도록 바꾸었으며 동일 assertion으로 전체 행렬을 통과했다. 휴대폰 390×844와 PC 1280×900 다섯 탭도 확인했다.

performance 12개 조합에서 이동 중 heavy rebuild 0, 영구 숨김 0, Marker 최대 0.4469 CSS px, A/B 최대 0.9014 CSS px였다. 병렬 실행 idle 최대는 569ms였다. 별도 단독 실행의 idle 최대는 아래와 같으며 실행 부하에 따른 시간 차이를 숨기지 않는다. 실제 사용자 장치의 체감 성능을 이 수치로 보장하지 않는다.

| 단독 화면 / DPR 1 | idle 최대 | 이동 중 heavy | 영구 숨김 |
|---|---:|---:|---:|
| 390×844 | 67ms | 0 | 0 |
| 1280×900 | 84ms | 0 | 0 |
| 1920×1080 | 92ms | 0 | 0 |

직전 30af641과 60프레임 비교에서도 정지 중 SDK/base/mask/UI/section 재계산 0, 이동 중 base 0, idle 후 base 1회를 유지했다. pan FPS는 화면별 이전 62.50/62.57/62.57 → 수정 62.43/62.57/62.50, p95는 17/17/17 → 18/17/17ms였다. 이 headless mock 범위에서는 작업 횟수 회귀가 없으며 실 NAVER 성능 판정은 대기한다.

브라우저 콘솔의 정확한 확인 명령:

```js
naksigwangTileDiagnostic()
naksigwangPerfDiagnostic.providerOnly(true)
naksigwangTileDiagnostic()
naksigwangPerfDiagnostic.providerOnly(false)
// online이며 recoverable=true인 경우에만 기존 SDK 복구 시작:
await naksigwangTileDiagnostic.retry()
// 최종 idle 뒤 다시 상태 확인:
naksigwangTileDiagnostic()
await naksigwangMapDiagnostic.fit(10000,36.05,129.38)
```

마지막 fit의 command.status/errorPx/sdkViewportUnchanged, 1~2분 반복 pan/zoom의 렉, overlay 잔상·누적 drift, 위성 유지와 블록 providerOnly 비교는 모두 **사용자 localhost 재검증 대기**다.

## 실제 settle-failure 확인 후 정책 수정 (2026-10-18)

사용자의 실제 localhost 진단은 active=false, failed=true, lastFallbackReason=settle-failure, fallbackCount=1이었다. 이번 실제 provider 소실의 직접 경로는 개별 IMG가 아니라 providerQueueSettle의 watchdog→providerFallback으로 확인됐다. 위의 이전 원인 미확인 기록은 이 새 증거로 갱신한다. 위성 영상 블록 자체의 원인은 여전히 미확인이다.

이전 판정은 reported center가 화면 중심에서 2 CSS px 이내, zoom 변화와 scale 변화의 조합, 완전히 같은 viewport JSON key 2프레임을 요구했다. key가 바뀌면 frames도 0으로 되돌렸으므로 기존 watchdog은 총 120프레임 상한이 아니라 같은 key가 지속된 120프레임이었다. 같은 key에서 ready=true라면 2프레임 뒤 성공하므로 실제 발동 직전에는 center 조건 또는 zoom/scale 대기가 계속 실패했을 가능성이 있다(코드에서 도출한 추론). 이전 진단에는 이 두 조건 수치가 없어 어느 쪽인지는 확정할 수 없다.

[NAVER 공식 Map 문서](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html)는 idle을 지도 움직임 종료, tilesloaded를 모든 타일 로드로 구분한다. 문서의 이벤트 의미는 앱의 2px·정확한 key 일치 조건을 보장하지 않는다. 타일 로드는 이 settle ready 식의 직접 입력이 아니다. fractional transform이나 애니메이션 도중 보고 중심과 표시 중심이 달라질 수 있다는 가능성과 실제 사용자 원인은 구분한다. 보통 단일 CSS/DPR 반올림만으로 2px 초과가 설명되지는 않으며, 누적 transform/SDK projection 상태는 새 계측으로 확인해야 한다. 소수 key 변동은 완전 일치를 깨뜨리는 것을 mock으로 재현했다. 실제 SDK의 수치 오차라고 단정하지 않는다.

정합 안전 기준은 완화하지 않는다. 감시를 총 120 RAF로 제한하고 timeout에서는 한 번 API health를 확인한다. 정상 map/projection/center/bounds이면 현재 표시 중심을 안전하게 read하고 provider와 native 입력을 유지한다. failed=false, healthState=settle-timeout이며 이전 Canvas는 숨김/보류한다. 스스로 감시를 재시작하지 않고 다음 idle/interaction에서 새 settle을 시도한다. 성공하면 기존 최종 viewport→DRAW→REVEAL로 돌아간다. 다음 이벤트에서도 기준을 못 맞추면 지도는 유지되고 overlay만 계속 보류될 수 있다.

settle-failure는 fallback allowed/recoverable 목록과 호출 경로에서 제거했다. map 객체 소실이나 지속 API/projection 실패는 기존 fatal 경로를 유지하며 3회 상태 재확인 실패 시 fallback한다. timeout 진단은 settleTimedOut, settleTimeoutCount, lastSettleObservation(frames/stableFrames/keyChanges/centerErrorPx/zoom/scale/stableZoom/stableScale/zoomScalePending/ready), settleFailure의 마지막 timeout snapshot, settleRecoveredAt을 반환한다. credential/URL은 포함하지 않는다. 마지막 timeout 기록은 성공 후에도 보존하고 settleTimedOut은 성공 시 false로 바꾼다.

새 p3_settle_checks는 center 3px, zoom/scale 대기, 소수 bounds key 변동을 각각 재현한다. 동일 RAF 함수 호출을 결정적으로 120회 진행해 watchdog 경계를 확인하고 healthy timeout 뒤 active=true/failed=false/fallback 0, native 입력 유지, heavy 0, 다음 실제 idle 후 base 1회를 검사한다. 100회 pan/zoom 모두에 timeout을 강제한 뒤에도 provider 유지와 마지막 Marker/Canvas 정합을 검사한다. 이 결정적 RAF 검사는 실제 100회 NAVER 렌더링 시간 계측과 구분한다. 기존 health 6개 화면/DPR에 포함해 지속 API 3회 실패와 SDK/auth/offline fatal 검사도 함께 유지한다.

localhost에서 최신 빌드 후 1~2분 pan/zoom하고 `naksigwangTileDiagnostic()`을 확인한다. timeout이 발생해도 active=true, failed=false, providerDOMVisible=true, healthState=settle-timeout이어야 하며 fallbackCount가 증가하면 안 된다(API/offline 등 다른 fatal 사유는 별도). lastSettleObservation과 settleFailure.observation을 기록하고 한 번 더 이동한 뒤 idle에서 settleTimedOut=false와 overlay 복원을 확인한다. `await naksigwangMapDiagnostic.fit(10000,36.05,129.38)`도 확인한다. 최신 실제 위성 유지·성능·overlay와 포항 fit은 **사용자 localhost 재검증 대기**이며 P3 완료/merge 가능 판정은 하지 않는다.

최종 로컬 결과는 `tests/P3_SETTLE_RESULTS.json`에 기록했다. health 6개 조합에서 각 100회, 총 600회 강제 pan/zoom timeout의 fallback 0·moving heavy 0을 확인했다. 다음 idle 후 base 1회와 Marker 정합을 통과했다. 기존 provider 20 화면/DPR 및 SDK 실패 6종 등 32개 결과, performance 12개 조합, legacy 전체 12개 명령이 모두 통과했다. 기존 reveal 테스트의 과거 fatal 기대값을 새 정책으로 바꾼 후 전체 성능 행렬을 재실행했다. performance의 이동 중 heavy 0, 영구 숨김 0, Marker 최대 0.4469px, A/B 최대 0.9014px, idle 최대 98ms였다. 이 로컬 mock 시간값은 실제 사용자 PC 성능을 보장하지 않는다. 빌드 missing ids: [], 플랫폼 빌드 일치, 수심 production 무변경도 통과했다.

timeout 뒤 다음 idle뿐 아니라 명시적 fit 명령이 settled로 성공한 경우에도 settleTimedOut을 해제한다. 이 진단 상태 해제 경로를 health 6개 조합에 추가하여 재검사했다. 직전 전체 성능/legacy 결과는 유지하고 최종 커밋 전체 검사는 Actions에서 다시 실행한다.

## 정상 provider의 drag 종료 후 무입력 overlay 복원 (2026-10-18)

최신 사용자 진단은 active=true, failed=false, lastFallbackReason=null, fallbackCount=0, healthState=healthy였다. NAVER provider는 살아 있었지만 Canvas가 돌아오지 않았다. 직접 원인은 이전 providerSettleTimeout의 providerBeginMove→providerMoving=true/숨김 유지 후 다음 이벤트 대기였다. 사용자가 손을 놓고 추가 이벤트가 없으면 frame의 moving guard 때문에 renderBase/DRAW/REVEAL을 실행할 수 없었다. 이 새 증거와 수정은 앞 절의 「다음 이벤트까지 보류 가능」 정책을 대체한다.

providerFinalizeViewport는 정상 map/projection/center/bounds와 gesture=false, commandPending=false, native pointer=0일 때 SDK의 현재 표시 중심(unproject)·축척을 최종 기준으로 읽는다. viewportDirty/providerMoving/gesture/waitingIdle을 false로 정리하고 dirty/dirtyHover, 빈 uiKey, revealAfterBase를 설정한다. provider-moving CSS는 여기서 먼저 제거하지 않고 기존 frame이 base→UI/조류/단면을 그린 뒤 providerRevealOverlay에서 제거한다. provider를 fallback하지 않는다. 입력 중에는 이 finalization이 실행되지 않는다.

실제 idle은 한 RAF로 모아서 이 공통 경로를 사용한다. reported center 2px 비교를 공개의 필수 gate로 쓰지 않는다. idle이 누락된 dragend/pointerup 경로는 기존 감시가 총 120 RAF 또는 250ms에 도달하면 정상 SDK 표시 좌표를 받아들여 자동 복원한다. 250ms는 SDK 명령을 지연시키는 sleep이 아니라 이벤트 뒤 감시의 경과 시간 상한이다. 다음 입력은 필요 없다. 숨긴 탭/백그라운드의 RAF 정지는 브라우저 정책에 따르며 표시 복귀 후 처리한다.

기존 이른 idle·지연 projection mock도 유지했다. idle 당시 zoom 보고값과 표시 scale이 아직 다르면 확정 zoom/scale을 섞어 저장하지 않는다. 정상 idle은 한 번 DRAW하며, 이른 idle 뒤 projection이 이벤트 없이 늦게 바뀌는 징후가 있을 때만 표시를 막지 않는 최대 250ms 관찰로 늦은 viewport를 한 번 추가 보정한다. 이 비정상 이벤트 순서의 보정은 매 프레임 heavy redraw가 아니다. 새 이동/명령/실패에서 관찰을 취소한다. 고정 타일 offset, reload, 새 SDK 인스턴스는 사용하지 않는다.

새 테스트는 drag→pointerup→idle 직후 timeout 강제, idle에서 center 3px 차이, idle 없는 dragend 뒤 무입력 자동 복원, 100회 drag(절반 idle·절반 timeout 강제)를 검사한다. 각 정상 종료/timeout은 renderBase 정확히 1회, moving/gesture/waitingIdle/heavyHidden/failed=false, 모든 Canvas visible, 이동 중 heavy 0을 확인한다. 무입력 복원은 실제 RAF/시계로 재며 headless 부하를 고려한 검사 상한은 750ms다. SDK 영상 도착·실 사용자 성능 보장과는 구분한다. 기존 타일 오류 허용·fatal SDK/API 실패·A/B·native Marker 정합 검사도 유지한다.

계측 준비는 비동기 수심 요청·generation·base/section 변경이 안정된 뒤 진행한다. 기존 분석 경로에서 취소한 timer의 queued 플래그만으로 대기하지 않는다. 모드 전환의 추가 depth fetch 금지 assertion은 유지한다. 수심/단면 보호 소스·static/depth·data는 변경하지 않는다.

localhost 최신 빌드 후 지도를 drag하고 놓은 다음 아무 입력 없이 overlay가 돌아오는지 확인한다. `naksigwangTileDiagnostic()`의 providerMoving/gesture/waitingIdle/heavyHidden/providerFailed는 false, nativePointerCount는 0, providerActive/providerDOMVisible은 true여야 한다. lastFinalViewport(source/time/center/zoom/bounds)와 finalViewportCount도 확인할 수 있다. timeout 이력은 settleTimeoutCount/settleFailure에 남고, 정상 공개 후 healthState는 healthy로 표시한다. 반복 drag와 wheel/pinch 후 체감 렉·잔상·drift는 **사용자 localhost 재검증 대기**이며 P3 완료 판정은 하지 않는다.

최종 로컬 기록은 `tests/P3_FINAL_VIEWPORT_RESULTS.json`에 있다. health 6개 조합의 무입력 자동 복원은 273~306ms, 각 100회(총 600회) drag의 영구 숨김/fallback/moving heavy는 모두 0, 정상 종료와 강제 timeout의 base는 각각 1회였다. 100회 종료 복원 최대는 75ms였다. provider 20개 화면/DPR 및 여섯 SDK 실패 등 총 32개 결과, performance 12개 조합, legacy 전체 12개 명령을 통과했다. performance moving heavy/영구 숨김 0, Marker 최대 0.4469px, A/B 최대 0.9014px, idle 최대 111ms였다. 직전 기록의 98ms와 실행 부하가 달라 이 차이만으로 성능 향상/악화를 단정하지 않는다. 정지 중 SDK/base/mask 재계산 0과 기존 particle budget·cache 구조를 유지했다. 실제 장치 성능은 재검증 대기다.

390×844와 1280×900의 다섯 탭을 확인했고, build missing ids: [], 빌드 플랫폼 일치와 수심 production 무변경을 통과했다. 테스트 중 발견한 빠른 탭 복귀의 이른 zoom/이전 scale 혼합 기준을 보완한 뒤 성능 전체 행렬을 재실행했다. 계측 준비의 취소된 depth timer 플래그 문제는 테스트 fixture/대기 조건에서 정리했으며 보호 소스는 변경하지 않았다. localhost 확인 전 providerOnly 진단 모드를 사용했다면 `naksigwangPerfDiagnostic.providerOnly(false)`로 분석 표시를 켠다.

## Provider lifecycle 전수 감사 (2026-10-18)

이번 감사는 `0e1c42a`에서 이어 진행했다. 사용자의 실제 NAVER 최신 빌드 검증은 아직 없으므로 아래 결과는 코드/회귀 검증이며 P3 완료나 merge 가능 판정이 아니다. 위성 영상의 사각 블록 원인은 미확인이다.

새로 찾은 경로는 두 가지다. 이미 공개한 동일 viewport에 늦은 idle/end가 오면 다시 숨김→heavy redraw를 반복했다. 또한 포인터 없는 zoom에서 end와 idle이 모두 누락되면 gesture/waitingIdle이 남아 settle 감시가 시작되지 않았다. 공개 완료 시 signature·크기·DPR을 기록하고, 같은 viewport의 늦은 이벤트는 기록만 남겨 중복 redraw/숨김을 생략한다. 새 이동이나 바뀐 viewport에는 이 생략을 적용하지 않는다. 포인터 없는 gesture에는 진행 이벤트마다 갱신되는 유한 250ms 종료 감시를 둔다. 포인터를 누르고 있거나 명시적 명령이 진행 중이면 이 감시가 입력을 강제로 끝내지 않는다. fatal 전환은 종료 timer와 남은 포인터를 정리한다.

종료 이벤트 누락 경로의 복원 시간 계측도 마지막 진행 이벤트 시각을 사용한다. 이전 idleAt이 남으면 실제 약 280ms 복원이 이전 작업 대기까지 포함한 수 초로 기록됐다. 종료 감시를 갱신할 때 시각도 갱신하고, 스트레스 검사에서 직접 잰 복원 시간과 기록 시간 차이 <75ms를 확인한다.

마지막 검토에서는 wheel mock의 실제 zoom 변화도 필수 조건으로 강화했다. ±100 WheelEvent를 번갈아 보내면 정수 zoom 누적량이 상쇄되어 이벤트 100개만 통과할 수 있었다. ±500 입력으로 매번 실제 SDK zoom이 바뀌는지 확인하고, 혼합 구간도 wheel 순서별 방향을 번갈아 보내 줌 상한에 붙지 않도록 했다. 조합마다 wheel 100회와 혼합 wheel 50회, 총 150회의 실제 zoom 변경을 확인한다. 구현 지연 조건을 느슨하게 하지 않고 mock의 성공 조건을 더 엄격하게 했다.

| 상태/이벤트 | 처리와 다음 상태 |
| --- | --- |
| inactive / 설정 없음 | 자체 지형 사용, credential 재요청 없음 |
| loading | SDK callback·인증·초기화 결과 확인; script timeout만 fatal |
| active / 정지 | SDK 읽기·base/mask/단면 재계산 반복 없음 |
| gesture / moving / waitingIdle | 이전 Canvas만 숨김; heavy·픽셀 읽기·수심 준비 중단 |
| commandPending | commandId와 실제 viewport 도착 검증; superseded 취소 |
| idle, 포인터 0, 명령 없음 | 현재 표시 SDK 좌표를 최종 read, dirty→기존 frame DRAW→REVEAL |
| settle monitoring | 최대 120 RAF 또는 250ms, center/zoom/scale 수치는 diagnostic |
| settle timeout, 정상 API | provider 유지, 최종 좌표 read·한 번 redraw·자동 공개 |
| 종료 이벤트 모두 누락, 포인터 0 | 유한 종료 감시→동일 timeout finalization; 다음 입력 불필요 |
| 이른 idle / 늦은 projection | 즉시 공개 후 필요할 때만 최대 250ms 관찰·최대 한 번 추가 보정 |
| degraded / 일시 API 예외 | 제한된 3회 health 확인; 회복하면 같은 지도 유지 |
| recoverable failure / offline | 입력·명령·감시 정리; online/retry에서 기존 map 재사용 |
| fatal failure | script/auth/init 소실 또는 반복 API 실패만 fallback |
| providerOnly | 직계 base/flow/ui만 진단용 숨김; SDK 자손·입력·attribution 유지 |

providerFallback 호출을 전수 확인했다. 시작 경로는 script load/timeout·auth·offline·map init 실패, health/finalization 경로는 map 객체 소실, 입력 API 경로는 3회 연속 예외, projection 경로는 3회 상태 확인 실패다. 수동 fallback은 테스트/내부 명시적 호출만 있다. 타일 IMG 오류, tilesloaded 누락, settle timeout, fit 1회 미도달은 fatal 호출 경로가 없다. 이들의 정상 projection은 그대로 유지한다. 일시 Canvas 정합 불일치는 SDK 인스턴스를 파괴하지 않으며 fatal reason으로 저장하지 않는다.

idle에서 reported center 2px 판정은 공개의 필수 gate가 아니다. 원래 120-frame watchdog이 발동한 실제 세부 수치(center인지 zoom/scale인지)는 과거 trace 부재로 확정할 수 없다. 타일 로드는 ready 식의 직접 입력이 아니며 fractional transform/이른 zoom 보고/완전 동일 key 조건은 가능한 원인이다. 현재 표시 중심은 SDK unproject를 사용하고, native Marker의 실제 DOM center와 Canvas crosshair 비교는 별도로 유지한다. 같은 project 경로 두 번의 0px로 실 정합 성공을 선언하지 않는다.

스트레스는 390×844, 768×1024, 1280×900, 1920×1080 × DPR 1/1.25/1.5/2의 16조합이다. 조합마다 drag 100, 실제 WheelEvent 100, 혼합 100, 모드 30, 오늘/지도 왕복 30, resize 30, explicit fit 30, providerOnly 왕복 30, 강제 timeout 100, 실제 IMG error 100, tilesloaded 누락 100을 검사한다. 누락 타일 검사는 건강한 SDK에 실제 mode timeout callback을 직접 실행하며, 기존 health 검사에서 별도로 실제 예약 12초 경계를 가상 시계로 확인한다. 100×12초의 실제 대기를 했다고 주장하지 않는다. 각 최종 공개 뒤 늦은 idle/center/end/idle 4개를 추가하여 중복 redraw 0도 확인한다. 각 fit은 홍원→속초→포항→주문진→묵호→홍원→포항→속초를 순환하며 실제 mock center/key/bounds 변경, target inside/reached, settled, native DOM/Canvas <=2px를 검사한다.

움직이는 동안 renderBase/mask/getImageData/flow/particle/section 계수 차이와 depthPrepareAreas 호출 0을 검사한다. 마지막 자료 갱신이 안정된 뒤 실제 RAF 60프레임 동안 SDK/base/mask 재계산 0을 확인한다. 별도 12조합 성능 suite는 조류를 켠 상태와 지연 SDK projection, A/B 실제 raster까지 검사한다. 스트레스와 별도 suite를 병행한 로컬 부하를 기록하므로 headless FPS/복원 시간은 사용자 PC 성능 보장이 아니다. 300/500ms 목표를 넘는 관측값도 숨기지 않는다. baseline은 원본 301표본을 유지하고 생성기를 재실행하지 않는다.

최종 로컬 수치는 `P3_AUDIT_RESULTS.json`에 기록한다. 위의 이전 보고 수치와 실행 조건이 달라 수 ms 차이를 성능 향상으로 해석하지 않는다. 무한 provider RAF 재시도는 없으며, 기존 앱 RAF는 지도/오늘 탭의 실제 조류·시각 애니메이션을 담당하고 비활성/백그라운드 정지는 유지한다. SDK 타일 URL/credential은 기록·반환하지 않고 native 타일을 별도 수집·저장하지 않는다. SATELLITE 기본과 HYBRID/NORMAL, 기존 key 저장 방식은 유지한다.

계측 도구 감사에서 기존 `page.clock.set_fixed_time`이 Date뿐 아니라 RAF/performance도 Playwright 시계로 감싸는 점을 확인했다. 앞 절의 health 시간/기존 performance FPS는 그 시계 환경의 값이며 실제 프레임 성능 근거로 사용하지 않는다. 이번 performance/stress 최종 실행은 `p3_native_clock.py`로 Date만 고정하고 원본 RAF/performance/timer를 사용한다. 12초 경계 검사에는 기존 가상 시계를 의도적으로 유지한다. 중간에 종료한 가상 시계 stress/performance 결과는 최종 결과 집계에서 제외한다. 수정 전후 duplicateBase 비교는 이벤트/그리기 횟수 재현이며 시간 성능 비교가 아니다.

실사용 마지막 확인: 최신 branch pull→build→localhost 8000→Ctrl+Shift+R 후 2분 drag/pan/zoom, 세 모드, 오늘/지도 왕복, 속초→포항을 확인한다. 항구/갯바위·조류 자동 복원과 위성 유지, 잔상·drift·체감 렉은 **사용자 localhost 최종 검증 대기**다. `const t=naksigwangTileDiagnostic(); console.log(t.providerActive,t.providerFailed,t.lastFallbackReason,t.fallbackCount,t.healthState)`로 간단히 확인하고 `await naksigwangMapDiagnostic.fit(10000,36.05,129.38)`의 command.status/errorPx/sdkViewportUnchanged를 확인한다. providerOnly는 확인 후 반드시 false로 되돌린다.

최종 로컬 결과: 기존 legacy 12명령, provider 32결과, health 6조합, 원본 RAF performance 12조합, 원본 RAF stress 16조합을 통과했다. stress는 총 12,000동작과 늦은 이벤트 25,600개이며 영구 숨김·비의도 fallback·이동 중 heavy/픽셀 읽기/수심 준비·모드 추가 depth fetch는 모두 0이다. 각 이동 종료의 즉시 base는 1회, 공개 후 동일 viewport 늦은 이벤트의 추가 base는 0회다. 원거리 fit은 총 480회 모두 settled/도착/같은 인스턴스/Marker <=2px/visible을 확인했다. 종료 이벤트 누락은 262.3~284.4ms, 반복 종료 복원 최대는 117.6ms였다. 실제 SDK wheel zoom 변경은 조합마다 150회, 총 2,400회였다.

별도 performance 이동 구간은 50.23~60.38fps, 평균 frame 16.61~19.97ms, p95 최대 54.1ms, idle 복원 최대 88.8ms였다. 진단용 Marker/raster 연산을 포함한 48개 구간 합계 long frame은 319개, frame 내부 작업 50ms 이상은 2개였다. 이동 중 heavy 작업은 0이며 이 수치를 실제 NAVER SDK 비용이나 사용자 체감 성능으로 일반화하지 않는다. Marker 최대 0.4469px, A/B raster 최대 0.9014px, 정지 SDK/base/mask/단면/픽셀 읽기 0, particle budget 180/360을 유지했다. 원본 301표본 baseline 동일, build missing ids: [], LF/CRLF 빌드 일치, PR base 대비 production 수심 무변경, 이번 작업 data 무변경도 확인했다. 최종 SHA의 전체 CI 결과는 기존 PR #6 설명과 Conversation 결과 코멘트에 기록한다.


## 2026-10-24 명시적 항구 이동: 장봉항 광역 잔류 수정

이번 변경은 provider 건강/settle 정책의 재설계가 아니라 명시적 검색·선택 이동의 보정과 commit 경계 수정이다. 시작 local/origin/PR #6 head는 모두 `7ae30c7af94921e62caa4b3ed51e9fcba59923a7`이었다. 작업 전 tracked 변경은 없었고 기존 untracked `python`은 보존했다.

### 원인과 이전 head 재현

`selectPoint(j,true)`는 먼저 `S.pt`·dropdown·이름을 바꾸고 `fitGround`를 호출했다. 명령은 공식 LatLngBounds fitBounds 1회 뒤 polling만 하고, 8초 뒤 실패해도 `providerFinishViewCommand(false)`가 `commandPending=false` 이후 `providerReadView()`로 옛 SDK 광역 화면을 `V`와 `lastSettledView`에 기록했다. provider 건강 여부와 목표 도착 여부는 다르다.

이전 head index를 git show로 읽어 메모리 route에서 실행했다. 저장소 장봉항 POINTS/PORTS(북위 37.52816, 동경 126.33697), healthy SDK와 fitBounds no-op을 주면 선택은 장봉항, 명령 failed / requested viewport not reached, 실제 폭 1049000.0153m, providerActive=true / providerFailed=false, `VWasOverwritten=true`를 재현한다. 테스트 timeout만 180ms로 단축했으며 production old 코드의 종료 경로는 바꾸지 않았다. 실제 NAVER 내부에서 fit이 무시된 이유까지 이 mock이 증명하는 것은 아니다.

기존 mock은 유효한 bounds를 받으면 결국 center/zoom/projection을 모두 적용했다. 이벤트 순서를 늦추는 검사는 있었지만 API 호출이 정상 반환하면서 영구 no-op/center-only/잘못된 scale이 되는 경우가 부족했다.

### 명령과 V/선택 commit

REQUEST(commandId, target/name, view, geographic bounds, ground scale, before snapshot) → PRIMARY(공식 fitBounds) → 실제 projection VERIFY → 500ms 미도착 시 REPAIR 1회 → VERIFY → FINALIZE 구조다. point(`fitGround`, dropdown, 항구/갯바위/좌표/관측소 검색)와 bounds(`fitBox`, 전국/해역 preset)를 명령 종류로 분리한다. **primary API는 두 종류 모두 기존 공식 LatLngBounds fitBounds를 유지한다.** 목표 중심·폭을 알고 있는 공통 repair에서 공식 `stop`, `setCenter(LatLng)`, `setZoom(zoom,false)`를 쓴다. 재생성·reload·무한 correction은 없다. API 계약은 [NAVER 공식 Map 문서](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html)와 [이동 예제](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Map.html)를 확인했다.

repair zoom은 현재 표시 projection의 100m ground scale을 목표 위도로 환산하고 `displayedZoom + round(log2(desiredGroundScale / predictedTargetScale))`, 범위 6~21로 계산한다. 보고 zoom만 먼저 변하고 projection scale이 이전 값이면 이전 표시 zoom/scale 쌍을 사용한다. zoom 1단계가 약 2배라 최근접 정수 오차는 약 sqrt(2)배다. 실제 성공은 target이 SDK bounds 및 화면 안에 있고 중심 오차가 짧은 화면 변의 10% 이내(최소 2px), 실제 폭/요청 폭 0.5~2, 기존 corner occupancy 0.35~1.6, 변경된 projection이 두 프레임 같아야 한다. reported center의 2px 조건은 trace로 남기되 성공 gate에서 제외한다. 원래부터 같은 목표·축척인 명령은 idempotent 성공을 허용한다. 2.5km 요청의 1049km 화면은 폭 조건으로 통과할 수 없다.

500ms는 정상 primary 지연(기존 2~12프레임과 신규 20프레임)을 기다리면서 기존 8초보다 일찍 no-op을 복구하는 유한 감시 경계다. 40프레임의 zoom 지연도 별도로 검사한다. 이는 mock 근거의 기본값이며 실 NAVER latency 측정값은 아니다. 8초 전체 명령 상한은 유지한다.

성공한 SDK projection만 V/lastSettledView로 commit하고 base→UI/flow→A/B 재투영→reveal 순서를 유지한다. 실패는 `settledView:null`, actual center/width와 명시적 실패 안내를 남기며 성공한 V를 덮지 않는다. `navigationFailed` 동안 늦은 idle도 V를 성공 값으로 쓰지 못한다. 새 명령·실제 pointer/wheel/drag는 이 상태를 해제한다. fatal provider 전환도 새 flag를 정리한다.

항구 dropdown과 검색의 선택/pin callback은 성공 때만 실행한다. 실패하거나 superseded된 항구를 선택한 것처럼 표시하지 않는다. 기존 선택과 실제 지도 중심이 서로 다른 경우 actual SDK 화면은 진단과 overlay의 투영 기준으로 유지되며 실패 안내에서 이동 실패와 현재 지도 폭을 밝힌다. 일반 사용자의 자유 pan은 이전처럼 선택 지점을 바꾸지 않는다.

새 명령은 이전 timer/RAF를 취소한다. 모든 polling/repair/finalize는 `pendingCommand===c && commandId===c.id`로 제한하고 command 중 일반 providerReadView는 차단한다. SDK native 이벤트에는 generation이 없으므로 이벤트 자체를 새 명령의 성공 증거로 쓰지 않고 현재 실제 projection을 다시 검증한다. 늦은 idle/center/bounds/zoom/tilesloaded는 command generation이나 목표를 바꿀 수 없다.

### 회귀 범위와 진단

`tests/test_map_navigation.py`: 390×844 DPR 1/2, 1280×900 DPR 1.25/2. 각 조합 장봉항 광역→근접 100회, 장봉항→속초→포항→주문진→묵호→장봉항 100 cycle(600명령), fitBounds no-op 100회. 장봉항은 저장소 실제 좌표, 다른 해역은 기존 사용자 trace 좌표다. delayed/40프레임 지연, center-only, idle-before-zoom, late bounds, stale idle, inside-but-wrong-scale, unchanged key, rapid supersession, dropdown/이름/갯바위/좌표/관측소, 전국/동해안/남해안/서해안/제주/fitBox, drag/wheel/mode/tab/resize 직후 이동을 검사한다. 의도된 모든 API no-op 실패도 따로 검사한다.

각 성공에서 실제 projection 도착·visibleWidth·provider 유지·명령 종료·overlay 공개, 실제 Marker DOM 중심 대 Canvas 자홍색 raster 오차 <=2 CSS px를 검사한다. 명령 중 moving heavy=0과 A/B 원좌표를 확인한다. 오늘 탭은 기존 설계상 예제 단면을 갱신하므로 탭 왕복의 의도된 A/B 변경 이후 navigation이 다시 보존하는지 구분한다. baseline 재생성은 하지 않는다.

최종 집계는 `P3_NAVIGATION_RESULTS.json`에 기록한다. normal/nonfatal fallback 및 permanent hidden은 0이어야 한다. expected API no-op 실패와 unexpected 실패 횟수를 구분한다. mock 시간은 NAVER 실제 latency/체감 성능이 아니다.

`naksigwangMapDiagnostic.lastNavigation()`은 ok/status/targetName/target/actualCenter/zoom/visibleWidthM/centerErrorM/usedRepair/providerActive/commandPending을 반환한다. 상세 last command에는 primary/no-op 감지/repair/total latency, requestedBounds, before/after, bounded trace가 있다. credential은 반환·로그하지 않는다.

### 사용자 localhost 재검증 대기

```cmd
cd C:\Users\TJ-801\naksigwang
git pull --rebase origin feat/p3-map-foundation
python build.py
python -m http.server 8000
```

http://localhost:8000/index.html#map 에서 Ctrl+Shift+R. 전국/광역에서 장봉항을 선택하고 근접 화면·km 폭인지 확인한다. 속초→포항→장봉항, drag/zoom 후 항구 선택, overlay 복원과 위성 유지를 확인한다. 마지막 콘솔 한 줄:

```js
naksigwangMapDiagnostic.lastNavigation()
```

실 NAVER 장봉항/포항 도착·체감 렉·잔상/drift는 **사용자 localhost 재검증 대기**다. P3 완료 또는 merge 가능으로 판정하지 않는다. SDK가 primary와 단 한 번의 공식 repair를 모두 무시하면 명령 실패를 명확히 남기며 강제 reload나 지도 재생성은 하지 않는다. 배경 영상의 구조물과 포인트 원자료 좌표 오차는 별도 한계다.


### 이번 navigation 실행 결과 (headless/mock)

- 4개 화면/DPR에서 반복 성공 3,296명령. 장봉항 광역→근접 400회, 원거리 400 cycle/2,400명령, fitBounds no-op 400회 모두 통과했다.
- 추가 4조합 집중 실행에서 40프레임 지연·빠른 검색 supersession·근접 V를 남긴 all-API no-op 실패를 확인했다. 총 12개 의도된 실패는 성공 처리하지 않고 기존 선택/V를 보존했다. 예상 밖 navigation 실패 0.
- 2.5km 요청 실제 폭 1,983.55~3,305.28m. 광역 1,049,000m는 성공하지 않았다. 실제 Marker DOM 대 Canvas raster 최대 0.22160 CSS px.
- 반복 명령 중 repair 417/3,296(12.65%). no-op 주입 400회는 전부 repair 사용. 이 비율은 고의 장애를 포함한 테스트 구성 비율이며 실 NAVER 장애율이 아니다.
- mock primary 관찰 지연 p50 70.2ms / p95 512.2ms, no-op/미도착 감지 p50 511.7ms / p95 513.8ms, repair p50 82.2ms / p95 84.1ms, total p50 70.2ms / p95 593.5ms / 최대 962.5ms. 감시 경계는 500ms이며 브라우저 프레임 지연으로 실제 감지는 더 늦을 수 있다(최대 906.1ms). native RAF/performance를 유지했고 실제 NAVER latency로 해석하지 않는다.
- moving heavy/fallback/permanent hidden/pageerror 0. 기존 수심·A/B baseline은 재생성하지 않았다.

검색 완료 안내와 외부 지도 링크도 선택/pin과 함께 성공 callback으로 확정한다. 관측소 fallback의 긴 일반 텍스트 안내가 PC 탭 클릭을 가로채던 문제는 안내에 pointer-events:none을 적용해 해결하고, 해당 안내가 남은 실제 버튼 클릭으로 모바일/PC 다섯 탭을 확인한다.

오늘 탭 잠금 상태의 dropdown도 성공 전 선택 확정을 보류한다. 검색 성공 callback은 이미 완료한 이동을 다시 발행하지 않으므로 관측소/가까운 포인트 선택이 원래 검색 목표를 뒤늦게 덮지 않는다. 잠금 상태 all-API no-op 실패도 별도로 검사한다.


### 최종 로컬 회귀와 변경 파일

기존 CI 명령 12개(P0/P1/P2B/P2C, browser/degradation smoke 포함) 종료 0. provider 32결과(20 viewport/DPR, DPR3, SDK 실패6, 설정4, production 진단 비공개), health/settle 6조합, 성능 12조합, lifecycle 스트레스16조합/12,000동작 통과. moving heavy/depth prepare, nonfatal fallback/permanent hidden=0. A/B raster 최대 0.90139px, 성능 검사 native Marker 최대 0.44688px, 원본 301 sample baseline 동일. native mock FPS 51.03~60.35이며 실 NAVER 성능 보장이 아니다. Windows 병렬 초기 실행의 GE 준비 대기 30초 timeout은 provider/stress에서 각각 한 번 발생했고 최종 직렬 재실행은 통과했다. 최종 빌드 missing ids: [], LF/CRLF 일치 및 smoke 재확인. 마지막 잠금/검색 callback 변경은 집중4조합에서 다시 검사했다. GitHub Actions는 push한 새 SHA에서 별도 확인하고 결과를 PR #6 코멘트에 남긴다.

이번 head 대비 변경15파일:
- 앱/빌드: src/app/13_forecast.js, 15_view.js, 15b_map_provider.js, 15c_map_diagnostic.js, 21_input.js, src/template.html, index.html(빌드 생성)
- 검사: tests/p3_provider_checks.js, p3_viewport_checks.js, p3_navigation_checks.js, test_map_navigation.py
- 문서/기록: src/README.md, tests/P3_MAP_REPORT.md, tests/P3_NAVIGATION_RESULTS.json
- CI: .github/workflows/ci.yml

수심 보호 경로 static/depth/, src/app/04_depth.js, src/app/04b_depth_tiles.js, src/app/18_section.js, data/는 변경하지 않았다. KHOA 42 tiles/35,982 points, verticalDatum/provenance/cache 12/60,000/8MiB, land/extrapolation guards와 기존 fallback을 유지한다. 새로운 브랜치/PR/merge 없이 feat/p3-map-foundation / PR #6만 갱신한다.

## Native pan 종료 정합·실제 draw stamp 보강

이번 범위는 f8dda0c의 explicit navigation repair 이후 남은 native pan overlay drift다. 사용자는 이전 localhost에서 lastNavigation()의 ok:true/status:repaired를 확인했다. pan/zoom의 실제 성능·정합은 이번 변경을 사용자 PC에서 다시 확인해야 한다.

### 원인과 변경

이전 stage pointerdown은 포인터만 등록했고 SDK dragstart를 기다려 Canvas를 숨겼다. 따라서 SDK 렌더가 이벤트보다 먼저 움직이면 이전 Canvas가 그대로 보였다. 이전 reveal은 signature를 overlayStamp에 적을 뿐, 실제 base/UI가 그 viewport로 그려졌는지 증명하지 못했다. pan settle 성공도 providerSync/providerReadView 분기로 나뉘었다. zoom의 후속 invalidation/redraw가 좌표를 새로 읽으면 다시 맞아 보일 수 있었으나, 실 NAVER 내부 이벤트 순서 자체를 자동 테스트가 증명하는 것은 아니다.

수정 후 pointerdown과 native wheel 캡처가 같은 JS task에서 base/flow/ui를 숨긴다. touch/pinch도 pointer 캡처를 사용한다. 짧은 tap의 hit test는 최종 draw 뒤 실행한다. 이동 중에는 SDK만 움직이며 이전 flow를 지우고 새 흐름장은 종료 후 다시 만든다. pointerup은 읽기를 예약하며 즉시 이전 projection을 확정하지 않는다.

idle과 settle 성공/timeout은 providerFinalizeViewport로 합쳤다. 실제 SDK projection 중심·groundScale을 V에 읽고 signature를 맞춘다. 중복 idle은 진행 중인 유한 감시를 재시작하지 않는다. 초기 reported/projection 차이는 관찰하고 지속적인 작은 차이는 idle authority로 허용한다. RAF 감시는 최대 250ms/120프레임이며 정상 provider를 fallback시키지 않는다. 정지 상태에 무한 RAF SDK 감시를 추가하지 않았다.

최종 draw 바로 전에도 live key와 마지막 읽기 key를 확인한다. 종료 읽기와 실제 draw 사이에 projection이 바뀌었으면 최신 V를 읽은 뒤 그린다. draw 앞뒤 key, 실제 V, 이동 generation, CSS 크기/DPR 및 세 Canvas backing 크기를 기록한다. base/UI/current/flow/section을 준비한 뒤 같은 stamp일 때만 reveal한다. mismatch면 hidden을 유지하며 이동 세대당 재읽기/redraw를 한 번 예약한다. 같은 세대에서 계속 불일치하면 공개하지 않고 다음 SDK 이벤트를 기다린다(무한 heavy 재시도 없음). SDK가 계속 변하는 상태에서 무조건 공개하는 대신 안전하게 숨기는 한계다.

명시적 navigation의 실패 시 기존 V/선택 보존 정책은 유지한다. 이 경우 실제 SDK projection으로 그린 draw 앞뒤 stamp와 보존된 V가 일치해야 공개하며, 실패 viewport를 성공한 read/lastSettledView로 위장하지 않는다. 정상 pan은 반드시 최신 providerReadView와 draw V가 일치해야 공개한다.

최종 stamp API가 draw 직후 예외를 내도 RAF를 끊지 않고 숨김 상태에서 기존 health 재검사를 진행한다. viewport 읽기는 필요한 SDK 값을 모두 얻은 뒤 V에 확정하므로 실패한 읽기가 V를 일부만 바꾸지 않는다. 새 회귀는 draw 종료 시점의 일시 API 예외도 직접 주입한다.

### 검사 방법

새 tests/test_map_pan.py는 4개 화면(390×844, 768×1024, 1280×900, 1920×1080) × DPR 1/1.25/1.5/2를 검사한다. 각 조합에서 pan100, dragstart/idle 누락·early idle·late dragend 각50, idle without dragend50, 강제 timeout10, pan→pan100, pan→zoom/zoom→pan/pan→장봉항/장봉항→pan 각50, 같은 항구 동서남북 pan500을 실행한다. pan 후 zoom 없이 1초 대기, 고의 draw stamp race, fitBounds no-op repair도 검사한다.

기준점은 실제 장봉항 좌표다. 독립 mock native Marker DOM 중심과 Canvas 자홍색 실제 raster 중심을 비교한다. A/B는 최종 drawUI가 실제 Canvas arc에 넘긴 중심과 별도 native DOM 중심을 비교하며, 기존 성능 회귀는 실제 A/B raster 검사도 유지한다. 매 paint 기회마다 CSS와 live/rendered key를 독립 감사한다. 원본 301표본 baseline은 재생성하지 않는다. 실제 이전 f8dda0c 빌드를 같은 native pointerdown 검사에 넣으면 첫 프레임 숨김이 실패하는 것을 재현했다.

CI에 native pan 전체 매트릭스를 추가했다. 기존 전체 검사를 생략하지 않으며, 새 장시간 매트릭스가 추가되어 job 상한을 60분에서 120분으로 늘렸다. 결과 수치는 실행 종료 뒤 아래에 기록한다. 모든 성능/오차 수치는 headless mock 측정이며 실 NAVER 결과가 아니다.

### localhost 재검증 — 사용자 확인 대기

```powershell
cd C:\Users\TJ-801\naksigwang
git pull --rebase origin feat/p3-map-foundation
python build.py
python -m http.server 8000
```

http://localhost:8000/index.html#map 에서 Ctrl+Shift+R. 근접 위성 항구 화면에서 확대/축소 없이 좌우 drag한다. 이동 중 overlay가 숨고 손을 놓으면 자동 복원되는지, zoom을 추가하지 않아도 항구/갯바위가 맞는지 확인한다. pan 10~20회 → 장봉항 선택 → 다시 pan, 위성 유지와 체감 렉을 확인한다. 콘솔 한 줄:

```js
naksigwangMapDiagnostic.overlay()
```

markerMaxErrorPx는 기존 native 기준점이 실제 측정될 때만 숫자이며, 기준점 미측정 시 null이다. credential/SDK 예외 URL은 반환하지 않는다. 실 NAVER pan 정합·잔상·drift·지연·체감 렉은 **사용자 localhost 재검증 대기**. P3 완료/merge 가능으로 판정하지 않으며 PR #6 Draft/미병합을 유지한다.


### Native pan 최종 로컬 실행 결과

- 새 pan 16조합: 정합 확인 21,840회, 같은 항구 동서남북 pan 8,000회. stale visible/permanent hidden/fallback/moving heavy/depth prepare 모두 0.
- Marker DOM ↔ Canvas raster 최대 0.46506px. A/B 실제 Canvas arc 중심 ↔ 독립 DOM 최대 0.01703px. 기존 별도 A/B raster 검사 최대 0.90139px.
- pointerup/dragend/idle → visible 최대 각각 183.4/183.0/183.0ms. 조합별 p95 최대 각각 111.6/112.0/112.1ms. 최종 base/UI 각 1회(고의 stamp/API 장애 복구는 별도).
- 실제 watchdog 만료를 기다린 mock timeout 복구 최대 313.0ms, native 종료 이벤트 누락 복구 최대 292.2ms(강제 timeout과 구분).
- 성능12조합 native mock FPS 50.41~60.11, moving heavy 0. 입자 budget/cache 유지.
- navigation4조합 성공 3,304명령, 장봉항 광역→근접 400회, fitBounds no-op 400회 보정 통과. 최종 코드의 추가 집중4조합도 통과.
- 기존 전체12명령, provider32결과, health6조합, 성능12조합, 기존 stress16조합/12,000동작, 새 pan16조합, 최종 build consistency/smoke 통과.
- 초기 병렬 pan 실행은 최대653.7ms로 500ms 기준을 실패했다. 이를 통과로 세지 않았으며 위 수치는 최종 직렬 전체 실행 결과다. 실행 환경 부하만이 원인이라고 단정하지 않으며 실 사용자 성능은 별도 확인한다.

이번 변경12파일: .github/workflows/ci.yml, index.html(생성), src/README.md, src/app/15b_map_provider.js, 15c_map_diagnostic.js, 15d_render_state.js, 21_input.js, 23_main.js, tests/P3_MAP_REPORT.md, P3_PAN_RESULTS.json, p3_pan_checks.js, test_map_pan.py. 수심 보호 경로/data/와 원본 301표본 baseline 무변경. 새 SHA의 Actions 결과는 PR #6 최종 코멘트에서 확인한다. 실 NAVER는 사용자 localhost 재검증 대기다.


### NAVER pane 좌표와 고정 Canvas 화면 좌표 구분 — 사용자 pan 재현 후 수정

앞선 5456d32의 입력 숨김/draw stamp 검사는 실제 사용자 pan 오류를 해결하지 못했다. 기존 FakeMapAdapter는 실제 NaverMapAdapter.project/unproject를 우회하고 처음부터 화면 기준 좌표를 반환했다. 따라서 내부 pane이 이동하지만 SDK offset은 그대로 남는 NAVER 좌표계 계약을 검사하지 못했다. 기존 결과는 해당 mock 결과로 보존하며 실사용 해결 근거로 사용하지 않는다.

공식 [좌표계 설명](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Projection.html)에 따르면 offset은 지도 내부 DOM 컨테이너 좌표다. [사용자 정의 overlay 예제](https://navermaps.github.io/maps.js.ncp/docs/tutorial-6-CustomOverlay.html)는 이를 getPanes().overlayLayer 안에 배치한다. 고정 sibling Canvas의 화면 좌표와 혼용해서는 안 된다.

- 이전: fromCoordToOffset 결과를 Canvas CSS pixel로 직접 사용. fromOffsetToCoord에도 고정 Canvas 좌표를 직접 입력.
- 수정: 공식 overlayLayer의 (0,0)에 크기 0인 DOM 기준점을 두고 providerMap에 대한 실제 CSS 원점을 읽는다. project는 pane 원점을 더하고, unproject는 빼서 SDK에 전달한다. 임의/항구별 offset이나 Canvas transform을 사용하지 않는다.
- viewport key/최종 view/health/alignment 확인 때 원점을 갱신하며 각 포인트의 project에서는 저장된 원점을 사용한다. final DRAW→stamp→REVEAL, moving heavy 차단을 유지한다.
- 실제 NaverMapAdapter를 사용하는 새 SDK mock은 pan 때 pane DOM만 이동하고 offset은 고정한다. 독립 Marker DOM은 그 pane 안에 실제 배치한다. zoom 때 원점을 리셋해 “pan 후 어긋남, zoom 후 다시 맞음”을 재현한다.
- 이전 실제 index 빌드 5456d32를 같은 검사에 넣어 첫 pan 37.375px 실패를 확인했다. 수정 코드의 원점 미변환 비교 최대 오차는 47.69205px다.
- 최종 4화면×4DPR=16조합, 총 1,600pan 통과. native DOM↔Canvas raster 최대 0.50526 CSS px, 실제 A/B Canvas arc↔별도 native DOM 최대 0.01650px. 원좌표와 역변환 보존, 종료 후 visible 1,600/1,600.
- 기존 provider 계약 mock에도 공식 getPanes DOM을 추가했다. 전체 기존 CI에 새 pane 검사를 추가하며 기존 검사/허용 오차는 줄이지 않는다. 해당 새 SHA의 CI 최종 결과는 PR #6 코멘트에 기록한다.
- 보호 경로 static/depth/, 04_depth.js, 04b_depth_tiles.js, 18_section.js, data/와 원본301 baseline은 무변경이다.

localhost에서 최신 빌드를 Ctrl+Shift+R 후 zoom 없이 pan한다. naksigwangMapDiagnostic.overlay()는 projectionSpace:"pane-to-container-v1" 및 paneScreenOrigin을 추가 반환한다. 내부 pane의 이동량과 고정 Canvas 화면 좌표를 구분하기 위한 값이며 credential은 없다.

실 NAVER pan·조류/갯바위 정합·잔상·렉은 사용자 localhost 재검증 대기다. 자동 검사 통과를 P3 완료나 merge 가능 판정으로 사용하지 않는다.
