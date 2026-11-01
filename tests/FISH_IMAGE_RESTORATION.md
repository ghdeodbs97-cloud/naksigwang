# 잘린 어종 이미지 복원

기준: 502bb524af86dd174798102e9f4e484ef127793f. 사용자가 후속 대화에서 원본 복원·교체를 명시적으로 허용했다. 이전의 이미지 교체 금지는 이 범위에서 해제되었다.

## 원인과 변경

기존 파일은 잘린 머리·꼬리·팔이 투명 캔버스 내부에 들어 있었다. contain과 여백 조정은 그 결손을 복원하지 못한다. 이번에는 built-in image_gen의 이미지 편집으로 손상된12종의 윤곽을 보완했다. 실제 원본 사진을 되찾았거나 픽셀 단위로 원형을 보증하는 복원은 아니다. 색·무늬·몸체 세부도 일부 재합성된 참고 이미지다.

나머지27종 WebP, 어종 경로/매핑, 카드 CSS, 점수·V2.1·ecology·날짜별 계산·지도·수심·오늘 탭 로직은 유지한다. 복원12종만 fishPicture에서 ?v=20261031-restored 주소를 사용해 이전 브라우저 캐시를 피한다. 원본 필드 fish.image는 바꾸지 않았다. 이미지 title과 기록 탭 자료 출처에 AI 보완임을 알린다.

## 저장과 검수

image_gen의 실제 투명 PNG를 작업공간에 복사하고, 전체 알파 윤곽을 432×216 안에 비율 유지하여 맞춘 뒤 480×256 WebP로 저장했다. canvas 변환은 크기·포맷 정리만 하며 내용을 그리거나 합성하지 않는다. 좌우 최소24px·상하 최소20px 여백을 갖도록 배치했다. 머리/꼬리/팔 복원 결과는 생성 이미지와 실제 카드에서 눈으로 확인했다. 아래 WebP가 최종 프로젝트 자산이다.

| 최종 경로 | 크기(bytes) | 피사체 배치 크기(px) |
|---|---|---|
| static/fish/bangeo.webp | 39316 | 432.0×194.3 |
| static/fish/busiri.webp | 39326 | 432.0×205.7 |
| static/fish/hakgongchi.webp | 23948 | 432.0×103.3 |
| static/fish/gabo-jingeo.webp | 40582 | 304.5×216.0 |
| static/fish/bengaedom.webp | 43994 | 391.9×216.0 |
| static/fish/bollak.webp | 44146 | 366.4×216.0 |
| static/fish/daegu.webp | 46924 | 427.3×216.0 |
| static/fish/godeungeo.webp | 33358 | 432.0×161.3 |
| static/fish/gwangeo.webp | 51876 | 406.6×216.0 |
| static/fish/munchigajami.webp | 42324 | 338.4×216.0 |
| static/fish/jabari.webp | 47548 | 391.1×216.0 |
| static/fish/samchi.webp | 32374 | 432.0×143.1 |

## 검증

390×844와1280×900: 전체39종 카드·진행바/숫자/ARIA·0/58/61/100 경계·세부점수 부재·이미지 중앙/contain·overflow 없음 검사 통과. 기준 코드와39종×24시간936개 점수가 일치했다. 복원12종과 기존 두족류 등21종 실제 카드를 눈으로 확인했다. 사진39종 디코딩/버전주소12개/AI 안내12개/이미지 실패 대체와 smoke·build consistency 통과. build missing ids: [] 및 git diff --check 통과. 기록·오늘·지도·물때·입질 다섯 탭에서 변경 범위를 확인했다. 최신 현장 생물 동정 정확성을 보증하는 사진 자료가 아니다.

## 최종 프롬프트 세트

내장 image_gen 사용, CLI/API fallback 사용 안 함. 각 호출은 해당 static/fish/{name}.webp 원본 한 장을 edit target으로 삼고 transparent_background=true로 실행했다. 아래는 실제 호출 프롬프트이며 번호별로 다른 자산이다.

### bangeo.webp

Use case: precise-object-edit. Edit target: the attached cropped fish cutout for a Korean fishing app. Restore ONLY the missing front of the head/snout of this yellowtail amberjack (방어, Seriola quinqueradiata). Preserve the existing fish's proportions, yellow lateral stripe, coloring, side-view pose facing left, realistic photo-cutout style and fin anatomy. Show ONE complete fish: entire snout, mouth, head, every fin and full forked tail inside the canvas, with generous transparent padding on all four sides (at least 10% of canvas). No clipped or flat-truncated anatomy. True alpha transparent background. Remove stray fragments or matte halos. No text, no labels, no extra fish. Landscape composition suitable for an individual small card thumbnail.

### busiri.webp

Use case: precise-object-edit. Asset type: a single transparent thumbnail for a Korean fishing app. Edit target: attached 부시리 (greater amberjack) photo cutout. Restore the clipped pointed upper and lower lobes of the forked tail on the right, keeping the full existing head and body. Keep the same species identity, colors, body proportions, pose, orientation, realistic photo-cutout style and existing anatomy. One complete animal only. All head, snout, fins, tail and appendage tips must be visible, no flat crop edges. Center the complete animal with at least 10% transparent padding on every side. True alpha transparent background; remove stray fragments and matte halos. No text, labels, shadows or extra animals. Landscape composition.

### hakgongchi.webp

Use case: precise-object-edit. Asset type: a single transparent thumbnail for a Korean fishing app. Edit target: attached 학공치 (halfbeak) photo cutout. Restore the entire cropped tail fin on the right. Preserve the distinctive long thin lower jaw/beak pointing left; do not shorten it. Keep the same species identity, colors, body proportions, pose, orientation, realistic photo-cutout style and existing anatomy. One complete animal only. All head, snout, fins, tail and appendage tips must be visible, no flat crop edges. Center the complete animal with at least 10% transparent padding on every side. True alpha transparent background; remove stray fragments and matte halos. No text, labels, shadows or extra animals. Landscape composition.

### gabo-jingeo.webp

Use case: precise-object-edit. Asset type: a single transparent thumbnail for a Korean fishing app. Edit target: attached 갑오징어 (cuttlefish) photo cutout. Restore the cropped arms/tentacles at the right and lower-right so every visible appendage ends naturally within the frame. Preserve the oval mottled mantle and its surrounding fin, eye and pose. Keep the same species identity, colors, body proportions, pose, orientation, realistic photo-cutout style and existing anatomy. One complete animal only. All head, snout, fins, tail and appendage tips must be visible, no flat crop edges. Center the complete animal with at least 10% transparent padding on every side. True alpha transparent background; remove stray fragments and matte halos. No text, labels, shadows or extra animals. Landscape composition.

### bengaedom.webp

Use case: precise-object-edit. Edit target: attached 벵에돔 (Girella punctata) cutout for a fishing app. Restore the missing outer tail fin on the right; preserve the dark slate oval body, small mouth, scales and spiny dorsal fin. Keep the existing body proportions, pose facing left, colors and realistic photo-cutout style. One complete fish only: full head, mouth, every fin and entire tail with natural tips, no flat cut edges. Center within a landscape canvas with generous true alpha transparent padding on all four sides, at least 10%. Remove stray pixels, fragments and matte halos. No text, no labels, no shadows, no background, no extra animals.

### bollak.webp

Use case: precise-object-edit. Edit target: attached 볼락 (Sebastes inermis) cutout for a fishing app. Restore the missing outer tail fin on the right; preserve the brown rockfish coloring, large eye, spiny dorsal fin and mottled scales. Keep the existing body proportions, pose facing left, colors and realistic photo-cutout style. One complete fish only: full head, mouth, every fin and entire tail with natural tips, no flat cut edges. Center within a landscape canvas with generous true alpha transparent padding on all four sides, at least 10%. Remove stray pixels, fragments and matte halos. No text, no labels, no shadows, no background, no extra animals.

### daegu.webp

Use case: precise-object-edit. Edit target: attached 대구 (Pacific cod, Gadus macrocephalus) cutout for a fishing app. Restore the missing tail fin on the right. Preserve the three dorsal fins, chin barbel, pale lateral line and mottled brown elongated body. Keep the existing body proportions, pose facing left, colors and realistic photo-cutout style. One complete fish only: full head, mouth, every fin and entire tail with natural tips, no flat cut edges. Center within a landscape canvas with generous true alpha transparent padding on all four sides, at least 10%. Remove stray pixels, fragments and matte halos. No text, no labels, no shadows, no background, no extra animals.

### godeungeo.webp

Use case: precise-object-edit. Edit target: attached 고등어 (chub mackerel, Scomber japonicus) cutout for a fishing app. Restore the cropped right ends of the entire forked tail. Preserve the blue-green striped back, silvery belly, streamlined body and small finlets. Keep the existing body proportions, pose facing left, colors and realistic photo-cutout style. One complete fish only: full head, mouth, every fin and entire tail with natural tips, no flat cut edges. Center within a landscape canvas with generous true alpha transparent padding on all four sides, at least 10%. Remove stray pixels, fragments and matte halos. No text, no labels, no shadows, no background, no extra animals.

### gwangeo.webp

Use case: precise-object-edit. Edit target: attached 광어 (olive flounder, Paralichthys olivaceus) cutout for a fishing app. Restore the clipped outer fan-shaped tail on the right. Preserve the flat oval mottled brown upper-side view, both eyes on the upper side, and continuous dorsal/anal fin outline. Keep existing proportions, colors, pose facing left and realistic photo-cutout style. One complete animal only. Full snout, head, every fin and entire tail must be visible with naturally finished tips and no flat cut edges. Landscape composition, centered with at least 10% true alpha transparent padding on all four sides. Remove stray fragments and matte halos. No text, labels, background, shadows or extra animals.

### munchigajami.webp

Use case: precise-object-edit. Edit target: attached 문치가자미 (marbled flounder) cutout for a fishing app. Restore the clipped outer fan-shaped tail on the right. Preserve the flat oval brown mottled upper-side view, eyes and continuous dorsal/anal fins. Keep existing proportions, colors, pose facing left and realistic photo-cutout style. One complete animal only. Full snout, head, every fin and entire tail must be visible with naturally finished tips and no flat cut edges. Landscape composition, centered with at least 10% true alpha transparent padding on all four sides. Remove stray fragments and matte halos. No text, labels, background, shadows or extra animals.

### jabari.webp

Use case: precise-object-edit. Edit target: attached 자바리 (longtooth grouper, Epinephelus bruneus) cutout for a fishing app. Restore the missing tail fin on the right. Preserve the stocky grouper body, wide mouth, brown marbled pattern and spiny dorsal fin. Keep existing proportions, colors, pose facing left and realistic photo-cutout style. One complete animal only. Full snout, head, every fin and entire tail must be visible with naturally finished tips and no flat cut edges. Landscape composition, centered with at least 10% true alpha transparent padding on all four sides. Remove stray fragments and matte halos. No text, labels, background, shadows or extra animals.

### samchi.webp

Use case: precise-object-edit. Edit target: attached 삼치 (Japanese Spanish mackerel, Scomberomorus niphonius) cutout for a fishing app. Restore the cropped ends of the forked tail on the right. Preserve the long narrow streamlined silver body, pointed head, spotted blue-gray back and finlets. Keep existing proportions, colors, pose facing left and realistic photo-cutout style. One complete animal only. Full snout, head, every fin and entire tail must be visible with naturally finished tips and no flat cut edges. Landscape composition, centered with at least 10% true alpha transparent padding on all four sides. Remove stray fragments and matte halos. No text, labels, background, shadows or extra animals.
