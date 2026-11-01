# 어종 카드 실사 사진 연결

기존 18개 어종 카드와 오늘 추천의 `fishSVG()` 직접 출력 경로를 `fishPicture()`로 바꿨다. 제공된 WebP 39개(약 1.42MB)를 그대로 사용한다. 신규 21개 표시명을 FISH와 조과 기록 선택에 등록했다. 볼락은 한 번만 등록하며, 조피볼락은 우럭과 같은 어종이라는 설명을 붙인다.

## 점수 미설정 처리

신규 항목은 `modelStatus: 'provisional'`, `season/reg/cur: null`이다. 시간대·수온 선호를 임의로 만들지 않는다. `biteEvalAt()`의 score/rawScore/confidence와 `biteAt()`은 null을 반환하며 환경 계산에 들어가지 않는다. 신규 카드는 사진·이름·점수 `—`·미설정 안내만 표시한다. 순위, 시간별 최고 점수 그래프, 오늘 추천에서 제외한다. 기존 18개 모델의 계수는 그대로다.

추가로 필요한 값은 근거가 있는 월별 시즌 적합도, 동해/남해/서해/제주별 적합도, 물때·조류 영향, 시간대 선호, 서식 수온 범위와 한국 연안 적용 여부다. 조피볼락/우럭 같은 별칭은 조과 기록과 모델 통합 정책도 필요하다. 현재는 이름 등록만으로 기존 우럭 모델이나 보정을 복제하지 않는다.

FISH 전체를 순회하던 계산 기준 표는 `reg.map()`/수온 배열 접근을 전제로 했다. 신규 항목은 먼저 미설정 행으로 표시해 초기 실행 오류를 막았다. `21_input.js`에서는 이 표의 렌더만 수정했고 지도 입력은 바꾸지 않았다.

## 사진과 대체 그림

입질 카드의 기존 2:1 사진 영역, 오늘 추천의 56×32 영역에서 `object-fit: contain`으로 표시한다. 점수·spark·텍스트 흐름은 유지한다. 이미지 로드 실패는 문서의 단일 capture error 리스너로 처리하며 같은 영역의 기존 fishSVG를 표시한다. 신규 항목은 어종별 SVG 형태 자료가 없어 일반 물고기 대체 그림이다. 이미지 매핑 자체가 없을 때도 SVG를 반환한다. 기존 fishSVG 함수는 보존했다.

## 파일명 매핑

모든 경로의 앞부분은 `static/fish/`, 확장자는 `.webp`이다. 파일명 기준으로 연결했으며 사진의 생물학적 동정이나 원본 출처를 새로 검증한 것은 아니다.

| 기존 어종 | 파일명 | 신규 표시명 | 파일명 |
|---|---|---|---|
| 감성돔 | gamseongdom | 독가시치 | dokgasichi |
| 볼락 | bollak | 방어 | bangeo |
| 벵에돔 | bengaedom | 문치가자미 | munchigajami |
| 농어 | nongeo | 조피볼락 | jopibollak |
| 우럭 | ureok | 학공치 | hakgongchi |
| 광어 | gwangeo | 무늬오징어 | munuiojing-eo |
| 노래미 | noraemi | 피문어 | pimuneo |
| 삼치 | samchi | 용가자미 | yonggajami |
| 고등어 | godeungeo | 참가자미 | chamgajami |
| 참돔 | chamdom | 참문어 | chammuneo |
| 잿방어 | jaetbangeo | 갑오징어 | gabo-jingeo |
| 부시리 | busiri | 갈치 | galchi |
| 대구 | daegu | 가숭어 | gasungeo |
| 숭어 | sungeo | 민어 | mineo |
| 전갱이 | jeongaengi | 벤자리 | benjari |
| 돌돔 | doldom | 붕장어 | bungjangeo |
| 백조기 | baekjogi | 살오징어 | salojing-eo |
| 전어 | jeoneo | 자바리 | jabari |
| — | — | 쭈꾸미 | jjukkumi |
| — | — | 한치 | hanchi |
| — | — | 호래기 | horaegi |

## 검증

- 새 사진 회귀: 모바일 390×844와 PC 1280×900 각각 39개 실 WebP 디코딩, 카드 크기/가로 넘침, 오늘 추천 이미지, 다섯 탭, 39개 이미지 전체 실패 대체 표시, 기록 선택과 계산 기준 표를 검사한다.
- 수정 전 빌드와 기존 18개×24시간=432개 평가의 점수·기여분·신뢰도·출처 전체가 동일하다. 오늘 추천 순서와 문구도 같다.
- 신규 21개는 score null, 순위/그래프 제외, 볼락 중복 없음. 다섯 탭 화면과 신규 카드 화면을 직접 확인했다.
- 기존 P1 검사: 29개 조건, 자료 만료 자동 갱신, 모바일/PC 다섯 탭 통과.
- build의 `missing ids: []`와 빌드 플랫폼 일치 통과. 기존 smoke, 자료 실패 복구의 다섯 탭, 단면 13시나리오×2, provider 20개 화면/DPR와 여섯 SDK 실패, 원본 수심·단면 baseline 동일성 모두 통과했다.

지도/P3 코드, 수심 엔진, static/depth, data, build.py는 수정하지 않는다. 사용자의 기존 백업 폴더·설치 스크립트는 커밋에 포함하지 않는다.

## 변경 파일

- 앱: `src/app/12_fish.js`, `src/app/14_bite.js`, `src/app/20b_today.js`, `src/app/21_input.js`의 계산 기준 표.
- 화면/문서/생성물: `src/template.html`, `src/README.md`, `index.html`.
- 검사: `tests/test_fish_photos.py`, `tests/test_bite_confidence.py`, `.github/workflows/ci.yml`, 이 보고서.
- 사진: 위 매핑의 `static/fish/*.webp` 39개. 원래 바이트 그대로 등록했다.
