# 사용자 실측·현장 정보 연결 계약 (아직 구현하지 않음)

실측 제출은 공식 수심점과 별도 원본 레코드로 저장한다. 업로드 즉시 공식 수심을 덮어쓰거나 산술평균하지 않는다. 현재 `survey` 로컬 CSV는 검수되지 않은 개인 자료이며 서버 DB가 아니다.

## depth_measurements v1

| 필드 | 타입/단위·의미 |
|---|---|
| schemaVersion | 1 |
| id | 서버 발급 고유 문자열 |
| lat, lon | WGS84 decimal degrees, 실제 측정 위치 |
| measuredDepth | 양의 m, 입력 원값 보존 |
| measuredAt | ISO 8601+timezone, 실제 측정 날짜/시각 |
| method | sonar / depth_line / sinker_line / other |
| horizontalAccuracy | m 또는 null, 좌표 오차 |
| observerLat, observerLon | 관찰자/캐스팅 시작 좌표 또는 null |
| castDistance, castBearing | m / 진북 기준 도, 또는 null |
| tideCorrection | `{status:unknown/pending/applied, valueM:null, stationId:null, observedAt:null, sourceDatum:null, targetDatum:null, method:null}` |
| normalizedDepth | 보정 완료 전 null. 원 measuredDepth와 별도 |
| verticalDatum | unknown 또는 검증된 기준면 ID |
| photoReferences | 스토리지 파일ID 배열, 사진 자체/인증 URL을 DB에 박지 않음 |
| memo | 입력 설명 |
| userId | 서버 측 계정ID |
| review | `{status:pending/approved/rejected/withdrawn, reviewerId:null, reviewedAt:null, reason:null}` |
| createdAt, updatedAt | 서버 ISO 8601 시각 |

선 길이 측정은 선의 기울기·파도·채비로 수직 수심과 다를 수 있으므로 method 원값을 보존한다. 시각이나 기준면이 불분명하면 tideCorrection.applied로 승격하지 않는다. 관리자 승인도 원자료 정확도 보증과 동일하지 않다.

향후 집계 레코드는 `cellId, sourceRecordIds, acceptedCount, rejectedCount, methodCounts, medianDepth, robustMeanDepth, spreadM, horizontalAccuracy, verticalDatum, tideCorrectionVersion, officialReference, differenceFromOfficialM, reviewVersion`를 가질 수 있다. 조위 보정·이상치 제거·중앙값/robust mean·측정방식 신뢰도·횟수·공식자료와 차이를 검토한 결과만 `crowd_verified` provider에 넣는다. `crowd_pending`은 공개 조회 엔진의 공식 fallback에 포함하지 않는다. 이 PR은 이 계산을 구현하지 않는다.

## field_reports v1

`id, schemaVersion, pointId, lat, lon, photoReferences, observationBearing, castBearing, castDistance, reportedDepth, depthMeasurementIds, bottomType, description, observedAt, userId, review, createdAt, updatedAt`.

`reportedDepth`는 `{valueM, estimated, method, verticalDatum}`이며 단순 현장 추정과 검수 실측을 구분한다. `depthMeasurementIds`로 위 원측정들을 참조한다. 사진으로 AI가 수심을 만들어내지 않는다. 사진 위치/관찰 방향과 수심의 실제 측정 위치가 같다고 가정하지 않는다.

현재 `POINTS`는 `buildPoints()`에서 다시 생성되며 인덱스는 영구ID가 아니다. 향후 `static point registry`에서 `pointId`를 발급하고 원본 포인트에 붙여 목록 재생성 때 유지한다. 마이그레이션은 기존 원본 출처+원본ID 우선, 없으면 이름/좌표 후보를 관리자 확인 후 연결한다. field report의 `pointId`는 registry를 참조하며 원 측정 lat/lon은 별도로 보존한다. 인접 포인트 이름이 같다고 자동 합치지 않는다. 포인트 이동/삭제에도 측정 ID와 원좌표를 남기며 레지스트리에 대체ID/상태를 기록한다.

지도/오늘 요약은 pointId로 승인된 현장 정보를 불러오고, 수심 엔진은 좌표/기준면이 정규화된 검수 완료 provider만 읽는다. 업로드/검수/공개 권한은 향후 서버 책임이다. 이번 작업은 백엔드·사진 공개·개인정보 권한 흐름을 추가하지 않는다.
