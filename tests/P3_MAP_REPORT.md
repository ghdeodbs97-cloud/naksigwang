# P3 NAVER 지도 표시 투영 수정 보고서

2026-10-11. 기존 `feat/p3-map-foundation` / draft PR #6에서 계속 작업했다. 새 브랜치·PR과 merge는 없다. 실 credential은 사용하지 않았다. **실 NAVER 영상 ±2 CSS px 정합은 사용자 localhost 검증 전까지 미확인**이다.

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

- `15_view.js`: raw/provider 변환 분리, 네 변 32분할 및 SDK bounds를 포함하는 viewBounds, provider zoom 연결.
- `15b_map_provider.js`: 실제 V 배율 동기화, SDK 기준점 pan/zoom, idle, 독립 guard, 로컬 진단, SDK 화면 수심 요청 어댑터.
- `03_userdata.js`, `05_struct.js`, `06_osm.js`, `08_depth_api.js`: 보이는 자료 선별·구조물·OSM·선택 API 범위를 viewBounds로 통일.
- `16_terrain.js`: 비선형 해안 투영·범위 선별, 배경만 생략하고 분석 마스크 보존.
- `19_overlay.js`: 자료 좌표 A→B 경로와 단면 표식 투영.
- `21_input.js`: pan/wheel/pinch와 크기 동기화 순서.
- `src/README.md`, `index.html`(build.py 생성), P3 mock·검사 결과·이 보고서.

## mock 및 회귀 검증

mock은 앱 변환을 호출하지 않는 비선형 세계 좌표(방향 기울기·곡률)와 정수 줌을 쓴다. 390×844, 768×1024, 1280×900, 1365×768, 1920×1080 × DPR 1/1.25/1.5/2의 20개 조합을 검사한다. 각 조합은 네 항만 × 폭 1.5/9/60/600km를 검사한다. 기존 affine 방식이 2px를 넘는 경우도 검사하며 수정된 표시 변환의 오차는 1e-5 CSS px 미만이어야 한다. 최종 360개 화면 검사 최대 오차는 2.73e-09 CSS px, 기존 affine 비교 최대 오차는 35.507 CSS px였다. 정확한 실행 결과는 `p3_validation.json`에 기록한다. 실제 NAVER 측정값이 아니다.

Canvas 이벤트 핸들러의 A→B·hover·pan·wheel·두 포인터 pinch, 작은 줌 누적, 줌 기준점, SDK 범위 안의 수심 요청, 3px 차단·복구, 실패 시 raw 복귀, 배경 투명·마스크·아이콘, 모드 전환 상태 보존을 검사한다. 합성 touch 이벤트는 물리 휴대폰 검증을 대신하지 않는다. 외부 HTTPS를 차단해 NAVER 요청과 실 credential을 CI에서 사용하지 않는다. SDK 404/429/offline/콜백 timeout/인증 실패도 mock으로 검사한다.

기존 main baseline의 동해안 8곳 × 동쪽 0/500/1000m 수심·기준면·출처와 A→B 전체 301개 표본·특징 해시를 비교한다. baseline을 수정본으로 갱신하지 않는다. 기존 CI 12개 명령과 빌드 일치 검사도 실행한다. 390×844와 1280×900의 다섯 탭 및 활성 mock의 핀·아이콘·A→B·축척·미니맵을 PNG로 직접 확인했다. 원격 결과는 PR checks에 연결한다.

## 수심 보호

`static/depth/`, `04_depth.js`, `04b_depth_tiles.js`, `18_section.js`, `data/`는 변경하지 않는다. production 42타일·35,982점, verticalDatum·KHOA provenance, 12타일·60,000점·8MiB 제한, 육지/외삽 차단과 fallback은 동일하다. 바뀐 수심 부분은 화면 투영에 맞는 요청 bbox를 만드는 외부 표시 어댑터뿐이며 기존 depthPrepareAreas의 제한·공유·퇴거를 그대로 통과한다.

## 사용자 localhost 실제 검증

1. 이 브랜치를 pull하고 `python build.py`, `python -m http.server 8000` 실행 후 `http://localhost:8000/index.html#map`을 연다. 기존 localStorage `naksigwang-naver-key-id` 설정은 사용자 브라우저에서 유지한다. 실제 값을 복사하거나 보고서에 넣지 않는다.
2. NAVER Console Web Dynamic Map 허용 URL은 `http://localhost`다(포트·경로 제외). 공개 호스트는 `https://ghdeodbs97-cloud.github.io`. SDK 설정은 공식 `ncpKeyId`를 사용하고 Client Secret을 사용하지 않는다. 127.0.0.1 사용 시 별도 호스트를 등록한다.
3. 일반/위성을 각각 선택한다. 콘솔에서 `naksigwangMapDiagnostic()` 결과의 samples·references·maxError를 확인한다. maxError ≤2, SDK 중심과 V 경위도가 같고 viewport가 Canvas CSS 크기와 같은지 확인한다. `rawMaxError`는 클 수 있으며 실패를 뜻하지 않는다.
4. 전국 → 동해안 광역 → 속초(38.20854,128.5947), 주문진(37.89192,128.8312883028771), 묵호(37.55,129.12), 포항(36.05,129.38) 순서로 이동한다. 좌표 검색은 lat,lon 순서이며 검색 직후 근접 화면이므로 축소 버튼으로 약 5~10km까지 넓힌다. 각 단계에서 진단 값을 기록한다.
5. 항만별 약 1~2km 화면에서 원자료에 좌표가 있는 방파제 끝단/꺾임 두세 곳을 고른다. 항구 아이콘은 바다 쪽으로 비켜 그려지므로 **실제 위치 점/핀**을 사용한다. 독립 원자료 경위도를 검색해 핀 중심과 영상의 같은 지형점을 CSS px로 비교한다. A→B 끝점을 같은 두 곳에 놓고 선·단면 hover 표식도 확인한다. 수심을 영상에서 추정하거나 좌표를 임의 보정하지 않는다.
6. 항만·모드·CSS viewport·DPR·zoom·기준점 경위도·관찰 dx/dy/max를 기록한다. 390×844와 1280×900에서 시행한다. 개발자 도구의 네트워크/Storage 패널에는 credential이 있으므로 캡처하지 않는다. 진단 반환 객체에는 credential이 없다.
7. pan, wheel, pinch, 회전/크기 변경 직후 같은 기준점을 확인한다. 필요하면 화면 녹화의 연속 프레임으로 배경과 핀이 한 프레임을 넘겨 크게 어긋나는지 확인한다. 오늘/지도 왕복, 나머지 세 탭, 수심 hover와 A→B도 확인한다.
8. 네트워크 offline 후 기본 지형·분석이 복구되는지 확인한다. offline 테스트 후 연결을 켜고 새로고침한다. 실 SDK 타일 캐시/오류 및 하단 출처·로고도 확인한다.

예상 동작: 전국/광역은 SDK 비선형 투영을 모든 위치에 적용한다. 항만 5~10km와 근접 1~2km도 같은 경로다. 정수 zoom 때문에 표시 폭은 요청 폭에서 단계적으로 달라질 수 있으며 V.s와 폭 안내가 실제 선택 배율로 갱신된다. wheel/pinch의 작은 변화는 누적해 다음 정수 단계로 넘어간다. 모드 전환으로 선택점·단면·수심 자료를 바꾸지 않는다. 실영상 잔차가 2px를 넘으면 SDK/Canvas 변환과 원자료 위치·영상 시점 차이를 구분해서 조사한다.

**실 NAVER ±2px: 미확인.** 사용자 브라우저의 후속 관찰 기록을 받기 전에는 성공으로 바꾸지 않는다.

공식 근거: [MapSystemProjection 화면/세계 좌표 API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.MapSystemProjection.html), [지도 투영](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Projection.html), [Map 줌·이벤트 API](https://navermaps.github.io/maps.js.ncp/docs/naver.maps.Map.html), [SDK 설정](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html), [허용 URL](https://guide.ncloud-docs.com/docs/en/maps-troubleshoot).
