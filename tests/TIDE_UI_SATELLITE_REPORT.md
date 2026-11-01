# 물때 요약 정리와 위성지도 배포 복구

## 화면

- 물때의 풍향·풍속·파고·수온·습도·물 흐름 6칸은 유지한다.
- 아래 중복 7일 나열표·그리기·이벤트·전용 CSS만 제거한다.
  위 날짜 선택 7개와 7일 예보 수신/캐시, 날짜별 요약 갱신은 유지한다.
- 입질카드에서 조건점수 숫자와 베스트 시간의 중복 점수 tooltip을 제거한다.
  어종명·입질 확률·높음/보통/낮음·progress bar·실제 계산값은 유지한다.
- 오늘의 카카오맵 링크와 포인트 선택/검색 시 href 갱신을 함께 제거해 null 오류를 막는다.

## 실 배포 장애 원인과 복구

실제 공개 사이트 진단은 `configuration-missing`, `keyConfigured=false`,
`scriptRequested=false`, `providerActive=false`였다. SDK 인증 실패나 projection 오류가 아니었다.
Pages 설정은 `build_type=legacy`, 소스 main `/`였다. main push마다 기본
`pages build and deployment`와 사용자 `사이트 배포` workflow가 모두 실행되고 있었다.
설정 주입 없이 저장소 index.html을 직접 배포하는 경로가 공존해 공개본에 빈 지도 설정이 남았다.

Pages 소스를 공식 `workflow` 방식으로 바꾸고 기존 main을 다시 배포했다.
배포 run 41286382114 성공 후 실제 공개 브라우저 진단은 다음과 같았다.

```json
{"status":"initialized","keyConfigured":true,"keySource":"meta","scriptLoaded":true,"apiReady":true,"initStatus":"ready","providerActive":true,"providerFailed":false,"authFailure":false}
```

키 교체·저장소 하드코딩·localStorage 삭제·NCP 허용 도메인 변경은 하지 않았다.
공개 URL과 HTTPS도 유지했다. 재발 시 성공으로 표시하지 않도록 배포 workflow에
Pages Source가 workflow인지 검사하는 선행 단계를 추가했다.
실제 NAVER Marker/Canvas errorPx나 사용자의 휴대폰 성능까지 새로 검증했다고 주장하지 않는다.

참고: [GitHub Pages 빌드 방식](https://docs.github.com/en/rest/pages/pages),
[배포 소스 설정](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## 검증

빌드 missing ids [], 기본 smoke, Pages 산출물 검사 4개, 빌드 일치 통과.
320×740 / 390×844 / 1280×900 다섯 탭·6칸 유지·표 없음·7개 날짜 선택·숫자 문구/링크 없음·
날짜별 예보·실패 복구 mock 통과. SDK 로드 17종과 39종×24시간 점수/기여/출처 불변도 통과했다.
과거 화면 비교는 기능 도입 전 커밋을 고정해 main 진전에 따라 기준이 달라지지 않도록 했다.
data/, static/depth/, 04_depth.js, 04b_depth_tiles.js, 18_section.js는 변경하지 않는다.
