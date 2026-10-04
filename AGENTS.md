# 낚시광 — 작업 안내 (Claude Code · OpenAI Codex 공통)

한국 바다낚시 포인트 분석 웹앱. 휴대폰 우선. 서버 없이 GitHub Actions(자료 수집) + GitHub Pages(공개)로 돈다.
사이트: https://ghdeodbs97-cloud.github.io/naksigwang/  · 코드 지도: `src/README.md` · 자료 만들기: `tools/data-pipeline/README.md`

## 구조
- `src/template.html` 화면(HTML·CSS), `src/app/NN_이름.js` 앱 코드 (번호 순서로 이어 붙여 하나의 `(async () => {…})()`로 실행)
- `build.py` → `index.html` 생성. **`index.html`은 직접 고치지 말 것** (빌드 결과물, 단 커밋은 함께 한다: Pages가 이 파일을 그대로 공개)
- `static/*.js` 큰 고정 자료(해안선·지형·OSM·항·갯바위·조류), `data/*.json` 매일 갱신 자료(수집기가 씀, **손으로 고치지 말 것**)
- `collector/collect.py` + `.github/workflows/collect.yml` 매일 05:25·17:25 KST 수집
- 지도는 라이브러리 없이 캔버스 3장(base·flow·ui), 웹 메르카토르 좌표(`mxOf/myOf`, `toS/toM`)

## 고친 뒤 반드시
1. `python build.py` → 마지막 줄 `missing ids: []` 확인 (코드가 찾는 id가 화면에 없으면 여기 나옴)
2. `python tests/smoke.py` → `통과` (필요: `pip install playwright` 후 `playwright install chromium`)
3. 화면을 바꿨으면 휴대폰 크기(390×844)와 PC(1280×900)에서 다섯 탭을 직접 보고 확인
4. `src/app/` 파일을 더하거나 함수를 바꿨으면 `src/README.md` 표도 맞춘다

## 코드 규칙 (실수했던 것들)
- **파일 순서 = 실행 순서.** 위쪽 파일의 최상위 코드에서 아래쪽 파일의 `const`/`let`을 쓰면 TDZ 오류로 앱 전체가 멈춘다. 함수 안에서 나중에 쓰는 것은 괜찮다.
- 새 파일은 번호로 위치를 정한다(예: `20b_today.js`). 첫 줄은 `// 파일명 — 하는 일`.
- 같은 이름을 두 번 선언하지 않는다(예: `TODAY`는 `10_tide.js`에 있음). 모든 파일이 한 함수 안이라 충돌하면 앱이 안 뜬다.
- 한 줄짜리 함수 안에 `//` 주석을 넣지 말 것 (뒤 코드가 주석이 된다). `/* */`를 쓴다.
- `POINTS`는 나중에 다시 대입된다. 참조를 미리 잡아 두지 말고 그때그때 읽는다.
- 매 프레임 그리기(`23_main.js frame`)는 보이는 탭만 한다. 지도는 `TAB === 'map' || 'today'`일 때만.
- 오늘 탭 지도는 지도 탭의 같은 캔버스를 옮겨 쓴다(`24_tabs.js placeMap`, `S.lock`). 잠금 중엔 이동·확대 안 됨.
- 화면 문구·주석은 한국어. 쉬운 말로(예: 「조위」 대신 「바닷물 높이」). 추정값은 추정이라고 밝힌다.

## 자료·보안·라이선스
- 공공데이터포털 인증키는 GitHub Secrets `DATA_GO_KR_KEY`에만 둔다. 코드·로그·커밋·이슈에 키를 쓰지 말 것.
- 출처 표시 의무: OpenStreetMap(ODbL), 공공누리 제1유형(국립해양조사원·기상청·해양수산부), GEBCO. 기록 탭 「자료 출처」에 있다. 자료를 더하면 출처도 더한다.
- `data/`는 수집기가 하루 2번 커밋한다. 푸시 전에 `git pull --rebase`.

## 작업 방식
- 기능 하나 = 브랜치 하나 = PR 하나. `main`에 바로 올리는 것은 작은 수정만.
- 두 도구(Claude Code, Codex)가 같은 파일을 동시에 고치지 않게 나눈다.
- 커밋 메시지는 한국어, 첫 줄에 무엇을, 아래에 왜.

## 알려진 한계·할 일
- 어종 시즌 점수가 10월 값 하나뿐 (`12_fish.js FISH.season`) → 월별로 바꿔야 함 (11월 전)
- 조류 예보 2026-12-31까지 (`tools/data-pipeline/README.md` 연말 할 일)
- 조과 기록이 기기 브라우저에만 저장 (로그인·서버 저장 없음)
- 위성지도 없음 (자체 캔버스 지도)
- 해안 150 m 안 수심은 실측이 아니라 경사 가정 모델 (`04_depth.js modelDepth`, `18b_shore.js`)
