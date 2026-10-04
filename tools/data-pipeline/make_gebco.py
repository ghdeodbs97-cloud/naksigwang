"""GEBCO 2026 GeoTIFF → static/gebco.js
입력: gebco_2026_n38.7_s32.9_w124.4_e131.95_geotiff.tif (GEBCO 사이트에서 15초 격자, 위 범위로 내려받음)
형식: 행마다 앞 칸과의 차이(int16) → 아래 바이트 전체 + 위 바이트 전체 → zlib(deflate) → base64
앱(16_terrain.js loadGebco)이 DecompressionStream('deflate')로 풀고 행마다 누적합으로 되돌린다.
사용: python make_gebco.py 입력.tif 출력.js"""
import base64, sys, zlib
import numpy as np
import tifffile

src, out = sys.argv[1], sys.argv[2]
E = tifffile.imread(src).astype(np.int32)          # (h, w) 표고 m, 바다는 음수
h, w = E.shape
d = np.diff(E, axis=1, prepend=0).astype(np.int16)  # 행마다 앞 칸과의 차이
u = d.view(np.uint16).ravel()
raw = (u & 255).astype(np.uint8).tobytes() + (u >> 8).astype(np.uint8).tobytes()
b64 = base64.b64encode(zlib.compress(raw, 9)).decode()
open(out, 'w').write(f'const GEBCO={{w:{w},h:{h},lon0:124.4,lat0:38.7,step:1/240,b64:"{b64}"}};\n')
print(w, h, len(b64))
