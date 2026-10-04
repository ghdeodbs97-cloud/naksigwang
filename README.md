# 낚시광

바다낚시 포인트 분석 앱. 웹 주소: https://ghdeodbs97-cloud.github.io/naksigwang/

## 구조

| 경로 | 내용 |
|---|---|
| `index.html` | 빌드 결과 (직접 고치지 말고 `python build.py`로 만듦) |
| `src/app/*.js`, `src/template.html` | 앱 코드(기능별 24개 파일)와 화면 — 지도는 `src/README.md` |
| `tests/smoke.py` | 고친 뒤 빠른 동작 확인 |
| `static/*.js` | 고정 자료: 해안선(OSM), 지형(GEBCO), 항·갯바위, OSM 시설, 조류 예보(2026년) |
| `data/*.json` | 매일 갱신 자료 (수집기가 씀) |
| `collector/` | 수집기 |

## 데이터 수집 (`collector/`)

GitHub Actions가 매일 05:25, 17:25(한국 시각)에 공공데이터포털 API를 받아 `data/`에 저장합니다.

| 파일 | 원천 | 내용 |
|---|---|---|
| `data/tide.json` | 국립해양조사원 조석예보(고, 저조) | 예보지점 166곳, 오늘부터 15일 만조·간조 시각과 조위(cm), 음력 날짜 (오전 실행 때만) |
| `data/obs.json` | 국립해양조사원 조위관측소 최신 관측데이터 | 관측소 55곳 최신 수온·풍향·풍속·기온·기압·조위 |
| `data/wx.json` | 기상청 단기예보 조회서비스 | 항·포구·갯바위가 있는 5 km 격자 615칸의 시간별 풍향(°)·풍속(m/s)·파고(m) |
| `data/meta.json` | — | 실행 시각, 받은 개수, 오류 |

인증키는 저장소 Settings → Secrets and variables → Actions의 `DATA_GO_KR_KEY`에 넣습니다. 코드에는 키가 없습니다.

출처: 해양수산부 국립해양조사원, 기상청 (공공데이터포털, 공공누리 제1유형 — 출처표시)
