"""index.html 만들기: src/template.html + src/app.js + static/*.js (데이터는 data/*.json을 실행 중에 읽음)
사용: python build.py"""
import hashlib, re
from pathlib import Path
R = Path(__file__).parent
STATIC = ['coast', 'ports', 'access', 'rocks', 'ban', 'fish_temp', 'gebco', 'osm', 'crnt']
tags = []
for n in STATIC:
    h = hashlib.md5((R / 'static' / f'{n}.js').read_bytes()).hexdigest()[:8]   # 내용이 바뀔 때만 새로 받게
    tags.append(f'<script src="static/{n}.js?v={h}"></script>')
t = (R / 'src/template.html').read_text(encoding='utf-8')
app = (R / 'src/app.js').read_text(encoding='utf-8')
page = t.replace('/*STATIC_SCRIPTS*/', '\n'.join(tags)).replace('/*COAST_DATA*/', '').replace('/*APP*/', app)
html = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + page + '\n</body>\n</html>\n')
(R / 'index.html').write_text(html, encoding='utf-8')
used = set(re.findall(r"\$\('([A-Za-z0-9_]+)'\)", app)); ids = set(re.findall(r'id="([A-Za-z0-9_]+)"', t))
print('index.html', len(html), 'bytes; missing ids:', sorted(used - ids))
