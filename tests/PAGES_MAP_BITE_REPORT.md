# Pages NAVER 설정과 입질 카드 요약

## 확인한 실제 배포 상태

- PR #6은 이미 main에 반영됐다. 최신 main `5298998c844e9202d013a185db1177854ba6f621`에서 새 브랜치 `fix/pages-map-bite-ui`를 만들었고, 기존 feature의 미커밋 수정분만 옮겼다. 이전 브랜치에 추가 커밋하지 않았다.
- 공개 URL: https://ghdeodbs97-cloud.github.io/naksigwang/
- 실제 브라우저 확인: `naver-map-key-id` 빈 값, SDK script 0개/요청 0건, `window.naver` 없음, Map 생성자 없음, 안내는 온라인 지도 설정 전이었다. 따라서 확인된 원인은 **배포 설정 누락과 설정 주입 경로 부재**이며, 이 상태에서 NCP 인증 실패가 발생했다고 단정하지 않는다.
- 저장소 설정 이름만 조회했다. repository Actions secret은 DATA_GO_KR_KEY만 있고 NAVER 설정과 repository variable은 없었다. 값은 조회/출력하지 않았다.
- Pages는 legacy 방식으로 main의 root index를 공개하고 있었다. 브라우저의 localhost localStorage는 Pages origin으로 전달되지 않는다. NCP 콘솔 자체에는 접근하지 않았으므로 허용 URL/계정 상태 확인은 별도로 필요하다.

## 코드와 배포 경로

`providerStart()`의 공식 HTTPS endpoint와 `ncpKeyId`, 콜백 선행 등록은 유지한다. 새로 안전한 로드 진단, 이미 준비된 SDK 재사용, 콜백 시 Map 생성자 확인, 중복 완료 방지를 추가했다. SDK 요청에는 strict-origin-when-cross-origin 정책을 명시한다. 투영·지도 이동·수심 계산은 바꾸지 않는다.

공개/로컬 공통으로 개발자 도구 Console에서 실행:

```js
naksigwangMapLoadDiagnostic()
```

키 값, query를 포함한 SDK URL, 원본 예외는 반환하거나 앱 로그에 넣지 않는다. Console의 `[낚시광 NAVER 로드]` 기록도 같은 제한을 따른다. 기존 좌표/타일 상세 진단은 계속 localhost 전용이다.

| 상태/필드 | 의미와 다음 확인 |
|---|---|
| configuration-missing / missing-key | 배포 키 누락. NCP 인증 요청 전 단계 |
| scriptRequested | SDK 요청을 시작했는지 |
| scriptLoaded | SDK script 실행/로드 확인 여부 |
| callbackReceived | SDK 준비 callback 도착 여부 |
| naverPresent / apiReady | naver 객체와 Map 생성자 존재 여부 |
| script-error | 네트워크·콘텐츠 차단 등. Network에서 HTTP/CSP/차단 상태 확인 |
| timeout / callback-timeout | script는 로드됐지만 준비 callback이 오지 않음 |
| auth-failed / authFailure | NCP 인증 실패 callback. ID·Web 서비스 URL·Dynamic Map 확인 |
| waiting-api / apiWaitMs | callback 이후 Map 생성자 공개를 최대 3초간 관찰 중 |
| api-missing / map-constructor-timeout | callback 후 관찰 기한이 지나도 Map 생성자가 없음 |
| init-failed | Map/이벤트/초기 viewport 설정 중 실패 |
| initialized / initStatus=ready | SDK 초기화 경계 통과. providerActive는 실제 표시 상태를 별도로 확인 |

`tools/build_pages.py`는 기존 build.py 실행 후 `_site` 공개 산출물에만 `NAVER_MAP_KEY_ID`를 넣는다. Git의 원본 index에는 빈 meta를 유지한다. 키가 없거나 형식이 잘못되면 배포를 중단한다. Client Secret은 사용하지 않는다. 브라우저용 Client ID는 실행 시 브라우저가 사용하는 공개 식별자이므로 NCP의 허용 도메인 제한도 필요하다.

새 `.github/workflows/pages.yml`은 main에서만 build/deploy한다. PR/feature에는 배포 설정을 전달하지 않는다. 공개 산출물은 index, static, data와 .nojekyll뿐이다. 일반 push 외에 main의 데이터 수집 workflow 성공 후에도 최신 main으로 다시 배포한다(GITHUB_TOKEN의 push가 다른 push workflow를 시작하지 않는 경우를 처리).

## 운영자가 설정해야 할 항목

1. GitHub 저장소 Settings → Secrets and variables → Actions에서 **NAVER_MAP_KEY_ID**를 등록한다. 값은 NCP Maps의 브라우저용 Client ID이며 Client Secret을 넣지 않는다. repository variable로 같은 이름을 사용하는 것도 지원하지만 secret을 권장한다. 키를 채팅/커밋/스크린샷에 복사하지 않는다.
2. 이 Draft PR을 검토하고 main에 반영한 뒤 Pages의 Build and deployment → Source를 **GitHub Actions**로 전환한다. 이 작업에서는 main 반영·Pages 설정 변경·실배포를 하지 않았다.
3. Actions의 **사이트 배포**를 main에서 수동 실행한다. 이후 main push 및 main 데이터 수집 성공 후에는 자동 실행한다. 배포 키 누락 실패를 무시하거나 legacy index를 대신 배포하지 않는다.
4. NCP Maps Application에서 Dynamic Map을 활성화하고 Web 서비스 URL을 확인한다.

NCP Web 서비스 URL은 포트/URI를 뺀 호스트 기준이다. 이 프로젝트의 등록 목록은 다음과 같다.

| 용도 | 등록 URL |
|---|---|
| GitHub Pages 운영(필수) | `https://ghdeodbs97-cloud.github.io` |
| localhost 개발(사용할 때) | `http://localhost` |
| IP로 여는 로컬 개발(사용할 때) | `http://127.0.0.1` |

`/naksigwang/`, `/index.html`, `:8000`, `#map`은 등록값에 붙이지 않는다. 실제 사이트 방문 URL은 프로젝트 경로를 포함한다. HTTP429/Quota Exceed가 보이면 Dynamic Map 선택/이용 한도를 함께 확인한다. script error만으로 HTTP429나 도메인 오류를 단정할 수 없어 Network와 NCP 콘솔에서 확인해야 한다.

근거: [NAVER 공식 ID 안내](https://navermaps.github.io/maps.js.ncp/docs/tutorial-1-Getting-Client-ID.html), [공식 SDK 로드 방법](https://navermaps.github.io/maps.js.ncp/docs/tutorial-2-Getting-Started.html), [NCP 인증 오류 FAQ](https://www.ncloud.com/support/faq/all/1047?searchKeyword=map), [GitHub Pages custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## 카드 UX

- 큰 `65점` → 큰 **입질 확률** + 작은 `조건점수 65점`. 상태 배지와 가로 progress bar 유지.
- `최고 08시 65점` → **오늘 베스트: 오전 8시**. 미래/지난 날짜를 선택하면 **이날 베스트**로 표시한다. 최고 시간의 점수는 title에 보존해 주 화면의 중복 숫자를 줄였다.
- 베스트 시각의 줄간격과 강조를 소폭 조정했다. 주 서식지·잘 잡히는 곳·접는 현재 조건은 유지한다.
- 확률 모델을 새로 만든 것이 아니다. 카드 목록 위에 참고 조건점수이며 실제로 잡힐 확률이 아니라는 안내를 유지한다. V2.1 계산·가중치·순위는 그대로다.

## 재검증

localhost: build.py 후 로컬 서버에서 최신 index를 강력 새로고침한다. 기존 해당 origin의 localStorage 설정이 있으면 유지된다. 콘솔 진단에서 keySource=local-storage, scriptRequested/scriptLoaded/callbackReceived/apiReady 및 initStatus를 확인한다. 오늘·입질·지도·물때·기록 탭을 확인한다.

Pages: 위 외부 설정과 main 반영/배포 성공 후 공개 URL을 Ctrl+Shift+R로 연다. Network에서 oapi.map.naver.com의 maps.js 요청이 있는지 확인하되 query나 키를 보고서에 복사하지 않는다. `naksigwangMapLoadDiagnostic()`에서 keySource=meta, keyConfigured=true, apiReady=true, initStatus=ready, providerActive=true를 확인한다. authFailure=true면 NCP 허용 호스트와 Dynamic Map을 확인한다. scriptLoaded=true/callbackReceived=false면 callback-timeout을 확인한다.

기존 live 사이트의 문제가 이번 브랜치 push만으로 해결됐다고 주장하지 않는다. 실제 배포 인증·타일 표시·체감 성능은 위 설정 후 재검증이 필요하다. SDK 로더 테스트는 좌표/그리기 어댑터를 경계 대역으로 분리하며 실제 지도 렌더 성공의 증거로 사용하지 않는다.

## 자동 검증

- 배포 산출물: 키 누락/잘못된 값 차단, 원본 index 및 자료 보존, 공개 파일 범위·경로 보호.
- 로드: 공개/로컬 origin, 키 누락, meta/localStorage, 정상 callback, 인증 실패, 네트워크 오류, callback timeout, API 없음, init 실패, 이미 준비된 SDK. 진단/앱 로그에서 fixture ID와 원본 예외 미노출.
- 카드: 모바일390×844 / PC1280×900, 39종×24시간936개 평가의 전체 점수/기여/출처가 수정 전과 동일. progress 값·작은 조건점수·베스트 문구, 오전/오후12시 경계, 다섯 탭과 가로 넘침 검사.
- 기존 smoke/입질/사진/지도 provider/빌드 일치 검사를 실행해 최종 결과를 PR에 보고한다. 생산 수심과 data는 수정하지 않는다.

## PR #7 loader callback race 수정

사용자 localhost의 실제 진단은 keyConfigured=true, keySource=local-storage, scriptRequested/scriptLoaded=true인데 status=api-missing이었다. 이 상황은 키 누락이나 script 요청 실패와 구분한다. 키·localStorage·NCP 설정은 변경하지 않았다.

수정 전 loader는 callback 안에서 즉시 `typeof window.naver?.maps?.Map==='function'`을 검사하고, 없으면 map-init-failed fallback을 실행했다. Fake SDK가 `callback(); Map=...`처럼 **같은 script의 바로 다음 동기 코드**에서 생성자를 등록해도 api-missing으로 실패하는 것을 수정 전 빌드에서 재현했다. callback 수신과 API 공개 완료를 같은 시점으로 간주한 코드 회귀다. 실제 NCP 설정 오류로 단정할 근거가 아니다.

기존 성공 mock은 Map을 먼저 등록한 뒤 callback을 호출했기 때문에 이 순서 차이를 놓쳤다. 이번에는 constructor가 늦게 공개되는 순서를 별도 계약으로 검사한다.

수정 후 callback은 수신/실행만 기록하고 로드 promise를 완료한다. 앱 탭 배치와 현재 JS/microtask가 완료된 뒤 Map 준비를 관찰한다. 아직 없을 때만 25ms 간격으로, 총3초·최대121회 한도로 재확인한다. 생성자를 발견하면 즉시 init으로 진행하며 3초를 무조건 기다리는 delay가 아니다. 기한이 지나도 없으면 api-missing/map-constructor-timeout으로 실패한다. 늦게 생성자가 나타나도 이미 실패한 초기화를 다시 시작하지 않는다. authFailure는 즉시 fallback하며 wait와 init을 취소한다. script-error와 callback 미수신12초 timeout은 기존대로 분리한다.

추가 진단: apiWaitLimitMs, apiWaitMs, apiWaitChecks. fallback 성공으로 위장하거나 providerActive를 강제로 true로 만들지 않는다. providerActive는 계속 기존 SDK viewport/투영 검사 결과를 따른다.

로컬 기존 회귀 재실행: build missing ids: [], build consistency, smoke, provider 20개 화면/DPR·SDK 실패6종·원본 수심/단면 baseline 통과. performance 12개 화면/DPR 모두 movingHeavy=0, maskChangedPixels=0, 최대 Marker오차0.446878px·A/B오차0.707107px, overlay permanentHidden=0. pan quick도 기존500ms/300ms 상한을 유지한 채 최대 복구164.7ms로 통과했다. 이 수치는 실 API가 아닌 기존 mock 검사 결과다.

검사 범위를 로더17개로 확장했다. callback 뒤 동기/microtask/task/1초 지연 생성, localStorage 경로의 microtask/task 생성과 저장값 보존, 기한 초과 후 생성, 영구 미생성, wait 중 authFailure를 포함한다. 기존 준비 완료·공개/로컬 origin·script 오류/timeout·중복 init 방지·카드936개 평가 동일성도 유지한다. 로더 검사는 SDK 초기화 경계 대역이며 providerActive=true 또는 실제 NAVER 표시의 증거로 쓰지 않는다. 지도/overlay 검증은 기존 provider/performance/pan 검사로 별도 실행한다.

실제 localhost 브라우저 검증은 Windows에서 현재 URL을 안전하게 판별할 수 없다는 computer-use 도구의 차단으로 중단됐다. 이를 우회해 사용자 브라우저/프로필/키에 접근하지 않았다. 실사용의 apiReady=true / initStatus=ready / providerActive=true는 아직 확인하지 못했으며 사용자 재검증 결과와 mock 결과를 분리한다. 기존 localhost 탭을 강력 새로고침 후 다음 값만 공유하면 된다(키 값 전송 불필요).

사용자가 추가로 제공한 실제 탭 값은 apiReady=true, initStatus=not-started, providerActive=false, reason=map-constructor-missing, apiWaitMs=undefined였다. Map이 결국 공개됐지만 즉시 실패한 기존 loader 상태를 뒷받침한다. 다만 이 reason과 apiWaitMs 미존재는 **수정 전 코드가 탭에서 실행 중이라는 표시**다. 수정 버전의 기한 초과 reason은 map-constructor-timeout이며 apiWaitMs는 항상 숫자다. 서버 HTML의 providerWaitForAPI 포함 여부와 탭의 진단 필드 존재를 별도로 확인해, 서버의 이전 파일/탭의 이전 실행 상태를 구분한다. 키 교체나 저장소 초기화로 해결하지 않는다.

```js
((d) => ({status:d.status, apiReady:d.apiReady, initStatus:d.initStatus,
  providerActive:d.providerActive, reason:d.reason, apiWaitMs:d.apiWaitMs}))(
  naksigwangMapLoadDiagnostic())
```
