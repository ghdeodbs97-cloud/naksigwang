# 고정 자료 만들기 (`static/*.js`)

`static/`의 큰 자료는 한 번 만들어 두고 거의 바꾸지 않는다. 아래 스크립트는 처음 만들 때 쓴 것을 그대로 옮겨 둔 것이라
**경로와 입력 파일 이름이 작업 당시 그대로**다. 다시 만들 때는 입력 파일을 같은 이름으로 두거나 스크립트의 경로를 고쳐서 쓴다.
입력 원본(수백 MB)은 저장소에 넣지 않았다.

| 결과 | 스크립트 (순서대로) | 입력 원본 |
|---|---|---|
| `static/gebco.js` 지형 격자 | `make_gebco.py 입력.tif static/gebco.js` (재현 확인됨: 지금 파일과 풀어낸 바이트가 같음) | GEBCO 2026, 15″, N38.7 S32.9 W124.4 E131.95 GeoTIFF |
| `static/coast.js` 해안선 | `pbf_coast.py` → `build_coast1~3.py`(구역별) → `build_coast_full.py` → `build_coast_merge.py` → `build_water.py`(방조제 안 호수 빼기) → `build_bridges.py` → `build_bridges2.py` → `build_coast4.py` | Geofabrik south-korea-latest.osm.pbf, OSM 해안선 GeoJSON 10개 구역, 통계청 SGIS 행정동 경계 |
| `static/access.js` 차로 갈 수 있는 섬 | `access.py`, `island.py`, `prune.py` | 위 해안선 + 다리 |
| `static/osm.js` 방파제·해변·등대·다리·이름 | `build_osm.py` (+ `pbf_names.py`, `pbf_dyke.py`, `names_proc.py`, `names_proc2.py`로 이름 보강) | OSM GeoJSON 10개 구역, 위 pbf |
| `static/ports.js` 항·포구 716곳 | `merge_ports.py` | 공공데이터포털 어항 CSV(국가어항·지방어항·소규모항·어촌정주어항, cp949) |
| `static/crnt.js` 조류 예보 | `crnt_download.ps1`(Windows에서 인증키 입력 후 실행) → `build_crnt.py` | 국립해양조사원 조류예보 API, 1년치 |
| `static/rocks.js` 갯바위 1,076곳 | 앱의 CSV 불러오기 코드(`09_rocks.js importRocks`)로 변환한 결과를 저장 | 해양수산부 갯바위 낚시 포인트 CSV (EPSG:5179 WKT) |

필요한 파이썬 패키지: shapely, pyosmium(`osmium`), pyproj, numpy, tifffile.

**연말 할 일:** 조류 예보는 2026-12-31까지다. 2027년 자료를 `crnt_download.ps1` → `build_crnt.py`로 다시 만들어 `static/crnt.js`를 바꾸고, `11_current.js`의 기준 날짜(`2026-09-30`)를 맞춘다.
