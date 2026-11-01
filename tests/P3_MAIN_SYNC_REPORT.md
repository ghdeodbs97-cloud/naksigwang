# P3 feature의 최신 main 자료 동기화

- 원래 feature tip: `1a9276403c3e82997f1c84b067d2b68045d46466`
- 반영한 main: `12769bcf1bc315bf3cc0d31350026fe3e866d8da` — 2026-10-25 07:39 KST 수집 커밋
- 시작 당시 main 위에서 첫 P3 패치가 staging된 채 멈춘 rebase였다. 원래 tip과 staged/unstaged patch 및 rebase 목록을 보존한 뒤, 첫 패치가 원래 커밋과 동일한 것을 확인하고 계속했다. 이후 추가 충돌 없이 완료했다.
- 원래 P3 23개 커밋과 재생한 23개 커밋의 `range-diff`가 모두 `=`이다. 앱 소스, template, static 자료, build.py와 생성 index의 Git 내용도 원래 P3 tip과 동일하다.
- upstream의 네 파일만 자료 변경으로 반영했다: `data/meta.json`, `data/obs.json`, `data/tide.json`, `data/wx.json`. 네 파일 모두 `origin/main`과 동일하다. 수심 production 파일을 임의로 수정하지 않았다.

## 수집 시각

`data/meta.json`의 `generated`는 `2026-10-25T07:34+09:00`, 소요 시간은 300초, `error_count`는 0이다. 07:34는 수집 시작 시각이며 완료 커밋 시각은 07:39 KST다. 앱의 smoke 검사에서도 `자료 갱신 10.25 07:34`, 속초 관측 `10/25 07:00`을 확인했다.

## rebase 후 검사 호환

앱의 기능 코드는 바꾸지 않았다. 검사에서만 다음을 조정했다.

- 과거 SHA를 고정 참조하던 단면·pane·성능 비교 검사는 해당 기능 파일이 추가되기 직전의 현재 조상 커밋을 찾는다. fresh clone에서도 rebase 전의 도달 불가능한 SHA에 의존하지 않는다. 비교 대상 HTML은 원래 해당 빌드와 동일하다.
- production guard는 `origin/main`과 PR head의 공통 조상부터 PR 변경을 비교한다. main에서 정상적으로 받은 자동 수집 갱신은 허용하며, feature가 별도로 변경한 수심/자료 파일은 계속 차단한다.
- 기존 baseline/검증 결과 JSON은 당시의 기록으로 보존했다. 원본 301개 baseline을 재생성하지 않았다.

## 검증

- `python build.py`: `missing ids: []`, 생성 index는 원래 P3 tip과 동일.
- LF/CRLF 빌드 일치 통과.
- provider 20개 화면/DPR 조합, 6종 SDK 실패, 지도 모드·상태·수심·단면 baseline 통과.
- 단면 13시나리오×모바일/PC 및 순수 바다 301개 수심·실제 Canvas 경로 동일성 통과.
- 과거 갯바위 분류 실패 및 pane 좌표 실패 재현 통과. 과거 단면 재현의 최초 실행은 초기 로딩 timeout이 있었으며 단독 재실행에서 의도한 오류를 확인했다. timeout을 통과로 세지 않았다.
- smoke 통과, 날짜는 10월 25일 자료로 표시.
- main의 23개 변경을 모두 포함하며, push 전 main 대비 behind 0 확인.

기존 PR #6과 branch를 유지한다. rebase로 원격 commit ID가 바뀌므로 알고 있는 원격 이전 tip을 지정한 force-with-lease를 사용하며, 다른 작업자가 push했으면 덮어쓰지 않고 실패한다. PR merge나 main 직접 변경은 수행하지 않는다.
