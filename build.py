"""index.html 만들기: src/template.html + src/app/*.js(번호 순서로 이어 붙임) + static/*.js (데이터는 data/*.json을 실행 중에 읽음)
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
parts = sorted((R / 'src/app').glob('*.js'))
# 모든 파일은 하나의 async 함수 안에서 이어지므로 서로의 변수·함수를 그대로 쓸 수 있다 (파일 순서 = 실행 순서)
app = '(async () => {\n' + '\n'.join(f.read_text(encoding='utf-8').rstrip('\n') for f in parts) + '\n})();'
page = t.replace('/*STATIC_SCRIPTS*/', '\n'.join(tags)).replace('/*COAST_DATA*/', '').replace('/*APP*/', app)
html = ('<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n' + page + '\n</body>\n</html>\n')
(R / 'index.html').write_text(html, encoding='utf-8')
used = set(re.findall(r"\$\('([A-Za-z0-9_]+)'\)", app)); ids = set(re.findall(r'id="([A-Za-z0-9_]+)"', t))
print('index.html', len(html), 'bytes; missing ids:', sorted(used - ids))
