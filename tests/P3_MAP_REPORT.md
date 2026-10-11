# P3 NAVER 지도 foundation 보고서

기준: 2026-10-11, 최신 main `a6732f02272e9a2beacf40c04c0e9f78d1dc35e1`에서 `feat/p3-map-foundation` 생성. P2D 연구·수심 production은 변경하지 않는다. 이 단계는 credential 없는 foundation이다. **실 NAVER 지도 연결 및 실영상 기준점 정합 검증은 미완료**다.

## 구조와 변경 파일

`providerMap`(NAVER 공식 SDK 배경) → `base`(항구·갯바위·수심 표시) → `flow`(조류) → `ui`(선택점·A/B). `stage` 전체를 오늘/지도 탭 사이에 그대로 이동한다. 앱의 `V`, `toS/toM`, 선택 상태, 수심 엔진과 단면은 유지한다.

- `src/app/15b_map_provider.js`: init/setMode/syncFromAppViewport/getBounds/project/unproject/resize/destroy 어댑터, 비동기 SDK 로드, 타임아웃·인증·이미지 오류·offline fallback, 9곳 좌표 비교.
- `src/template.html`: 배경 DOM, 일반/위성 버튼, 상태 안내, 빈 credential meta, 자료 출처. SDK 출처·로고가 보이도록 활성 지도 하단 28px는 Canvas 표시/입력 영역에서 제외한다.
- `src/app/16_terrain.js`: 배경 활성 시 기존 terrain 그림은 빈 clip으로 숨긴다. 육지 마스크·분석 격자 계산은 유지하고 항구·갯바위 등은 그 뒤에 그린다.
- `src/app/21_input.js`, `23_main.js`, `24_tabs.js`: 버튼, 크기·보이는 viewport 동기화와 SDK 비동기 시작, 창 높이만 변경되어도 지도 크기 갱신. `src/README.md` 코드 지도 갱신.
- `index.html`: `build.py`로 생성. 직접 편집하지 않음.
- `build.py`, `tests/test_build_consistency.py`: Windows CRLF/Linux LF의 static JS 해시를 통일하고 생성 HTML은 LF로 고정한다. 첫 원격 CI에서 static 캐시 주소만 불일치한 문제를 수정했고 두 입력 형식의 빌드 결과 바이트 일치를 검사한다.
- `.github/workflows/ci.yml`, `tests/p3_depth_guard.py`: P3 PR base와 HEAD 사이의 보호 경로 변경 차단, P3 검사와 빌드 일치 검사.
- `tests/p3_baseline.py`, `p3_baseline.json`, `p3_provider_checks.js`, `test_map_provider.py`, `p3_run_suite.py`, `p3_validation.json`: main baseline, mock/회귀 검사 및 결과.

모드 전환은 같은 인스턴스의 NORMAL/HYBRID를 바꾼다. 앱 viewport·선택점·핀·수심 readout·A/B·단면을 다시 만들지 않는다. 마지막 모드만 localStorage에 보존한다. NAVER SDK의 투영 함수는 화면 비교에만 사용하고 수심 데이터 source로 사용하지 않는다. 비공식 tile 주소, 직접 tile fetch, SW/IndexedDB/서버 tile 저장은 없다.

## HTTP baseline

source 변경 전 `build.py` 실행: `missing ids: []`. `depth_probe`의 저장소 HTTP 서버에서 생성된 index를 실행하여 다섯 탭, 확대, 이동, 좌표·수심 조회, A→B 301개 표본 및 특징을 기록했다. 예외(pageerror) 0. `p3_baseline.json`에 실제 동해안 8곳과 동쪽 500/1000m 수심, 출처·추정 여부, 단면 전체의 SHA-256을 보존한다.

기존 smoke의 첫 실행은 외부 Google Fonts를 기다리는 load timeout이 발생했다. 같은 main baseline 기능 검사는 통과했고 기존 smoke 재실행도 통과했다. 따라서 처음부터 모든 네트워크 요청이 성공했다고 주장하지 않는다. 초기 수심 표본에는 자동 타일 로딩 완료 시점 차이가 있어, 최종 비교는 지도 프레임을 숨기고 진행 중 요청을 비운 뒤 같은 범위를 명시적으로 로드한다. baseline은 수정본으로 갱신하지 않고 `git show origin/main:index.html` 원본에 동일 검사 함수를 주입하여 다시 추출했다. 신규 검사는 `http://localhost:8000/index.html`에서 실행하며 외부 요청을 차단하고 실패 URL을 별도 기록한다. `src/template.html`의 file 실행은 사용하지 않았다.

## NAVER 설정 (실제 값은 채팅·로그·커밋에 넣지 않기)

1. NAVER Cloud Console의 **Services → Application Services → Maps**에서 Application을 만들고 **Web Dynamic Map**을 활성화한다. 현재 공식 SDK는 `ncpKeyId`를 사용한다. Client Secret은 사용하지 않는다.
2. Web 서비스 URL에 **`http://localhost`**, **`https://ghdeodbs97-cloud.github.io`**를 등록한다. 실행 주소는 `http://localhost:8000/`, 공개 주소는 `https://ghdeodbs97-cloud.github.io/naksigwang/`이지만 콘솔에는 포트·경로를 제외한다. 127.0.0.1로 열 때는 `http://127.0.0.1`도 별도 등록한다.
3. 로컬 검증은 브라우저 개발자도구 Application → Local Storage → `http://localhost:8000`의 **`naksigwang-naver-key-id`** 값에 발급받은 Key ID를 직접 입력한 후 새로고침한다. 채팅으로 전달할 필요가 없다. 해제는 이 항목을 삭제한다.
4. 배포 설정의 주입 지점은 빈 `<meta name="naver-map-key-id" content="">`다. 실제 값은 검토용 source/index 커밋에 넣지 않는다. 운영 배포의 별도 주입 단계는 아직 추가하지 않았다. 이번 PR을 merge하더라도 credential 없는 방문자에게는 기본 지형지도가 나온다.

브라우저용 Key ID는 프런트엔드와 SDK 네트워크 요청에서 보인다. 완전히 숨기는 비밀키가 아니므로 허용 도메인·사용량 제한을 콘솔에서 관리한다.

공식 근거 (2026-10-11 확인): [SDK 로드·인증·setSize](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html), [URL에서 포트·경로 제외](https://guide.ncloud-docs.com/docs/en/maps-troubleshoot), [투영·화면 좌표](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Projection.html), [좌표 ↔ pixel](https://navermaps.github.io/maps.js.ncp/docs/tutorial-1-projection-coord-to-pixel.example.html), [지도 유형 변경](https://navermaps.github.io/maps.js.ncp/docs/tutorial-Map.html).

## 정합성 판단과 한계

NAVER 기본 지도는 자체 **UTMK_NAVER** 투영이다. 기존 Canvas는 Web Mercator이며 자유로운 연속 배율을 쓴다. 같은 Mercator라고 가정하지 않았다. 어댑터는 SDK project로 현재 배율을 측정하여 가까운 SDK 정수 zoom을 선택하고, 화면 중앙·네 모서리·네 변 중점의 CSS 좌표를 비교한다. 최대 오차가 2px를 넘으면 NAVER 배경을 숨기고 지형지도를 유지한다. SDK getProjection의 project/unproject를 한 곳에 모았으나 기존 좌표계를 교체하지 않았다.

| 검사 | 결과 |
|---|---|
| 속초·주문진·묵호·포항, 폭 1.5/9/60km mock | 좌표 왕복 및 화면 정합 검사 통과. 수치는 `p3_validation.json`. 실지도 오차가 아님 |
| 고의 3px 오차 | NAVER 배경 차단, 기본 지형 복귀 |
| 실 NAVER 방파제 끝단·항구 기준점 | **credential 부재로 측정하지 못함** |
| PC/mobile 실영상 ±2px 목표 | **달성 여부 미확인** |

정수 zoom 차이는 큰 화면 범위에서 위치 오차를 크게 만들 수 있다. 따라서 credential을 설정해도 일부/다수 배율에서 보수적으로 fallback할 수 있다. 실제 오차량·zoom별 변화는 측정 전이며 임의 수치를 제시하지 않는다. 다음 단계에서 SDK project/unproject를 Canvas 화면 변환의 기준으로 삼는 방안과 SDK zoom 기준으로 앱 배율을 맞추는 방안을 비교해야 한다. 조류 격자·육지 마스크·pan/pinch·수심 viewport 요청 범위를 함께 점검해야 하므로 이번 PR에서 전역 좌표계를 바꾸지 않았다.

## 검증

기존 P0/P1/P2B/P2C CI 명령 12개 모두 종료코드 0: boot degradation, build, collector, smoke, degradation smoke, bite confidence, depth converter, depth foundation, KHOA fetch/depth/coverage/coverage browser. 실제 NAVER API는 CI 필수 의존성이 아니다.

P3: 390×844, 768×1024, 1280×900, 1365×768, 1920×1080 × DPR 1/1.25/1.5/2의 20개 조합, 다섯 탭, 회전 크기 변경, 확대·이동·크기 동기화, NORMAL/HYBRID 매핑과 인스턴스 재사용, 좌표 왕복, 정합 차단·복구, 배경 투명/분석 마스크 유지, selected point·핀·단면·수심 보존, 활성 mock 전환으로 수심 추가 요청 0을 검사한다. SDK 404/429/offline/콜백 timeout/인증 실패는 메모리 route로 재현한다. 외부 폰트 차단 실패 URL은 예상된 테스트 조건으로 기록한다.

390×844와 1280×900 다섯 탭 PNG를 직접 확인했다 (`test-output/p3/`). 실제 모바일 하드웨어 검사는 아니다. 운영 수심 파일, 기준면·provenance, 캐시 제한 12타일/60,000점/8MiB, 중복 요청 방지, 육지·외삽 차단, GEBCO/model fallback은 원본 그대로다. `18_section.js`도 무변경이며 baseline의 수심 결과와 전체 A/B 단면 해시를 비교한다.

원격 GitHub Actions 결과는 PR checks에서 확인한다. 실 credential 연결, 영상 정합 측정, 실제 SDK 하단 attribution의 화면 검수·타일 실패 동작은 다음 현장 검증으로 남긴다. 정합 전에는 기본 지형을 계속 사용할 수 있는 foundation으로 검토하며, 실지도 도입 완료로 간주하지 않는다.
