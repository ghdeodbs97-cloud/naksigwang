"""Pages 공개 산출물에만 브라우저용 NAVER ID를 주입한다. 저장소의 index는 바꾸지 않는다."""
import argparse
import html
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def stage_pages(root, output, key):
    if not key or not re.fullmatch(r'[A-Za-z0-9_-]{4,128}', key):
        raise ValueError('NAVER_MAP_KEY_ID가 없거나 형식이 올바르지 않습니다. 저장소 Actions secret/variable 설정을 확인하세요.')
    root, output = Path(root).resolve(), Path(output).resolve()
    if output == root or root not in output.parents:
        raise ValueError('공개 산출물은 프로젝트 안의 별도 폴더여야 합니다.')
    if output.relative_to(root).parts[0] in ['static','data','src','.git','tools','tests','.github']:
        raise ValueError('자료·소스 폴더 안에 산출물을 만들 수 없습니다.')
    if output.exists():
        raise ValueError('산출물 폴더가 이미 있습니다. 비어 있는 새 경로를 사용하세요.')
    source = (root / 'index.html').read_text(encoding='utf-8')
    pattern = r'(<meta\s+name="naver-map-key-id"\s+content=")[^"]*(")'
    if len(re.findall(pattern, source)) != 1:
        raise ValueError('NAVER 지도 설정용 meta가 정확히 하나 있어야 합니다.')
    page = re.sub(pattern, lambda m:m[1]+html.escape(key, quote=True)+m[2], source)
    for folder in ['static', 'data']:
        if (root / folder).is_symlink() or any(p.is_symlink() for p in (root / folder).rglob('*')):
            raise ValueError('공개 자료에 심볼릭 링크를 포함할 수 없습니다.')
    output.mkdir(parents=True)
    (output / 'index.html').write_text(page, encoding='utf-8', newline='\n')
    (output / '.nojekyll').touch()
    for folder in ['static', 'data']:
        shutil.copytree(root / folder, output / folder, ignore=shutil.ignore_patterns('.git', '.env*', '*.local.*'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='_site')
    args = parser.parse_args()
    key = os.environ.get('NAVER_MAP_KEY_ID', '').strip()
    # 설정 누락은 배포 전에 중단한다. ID/Secret 값은 오류와 로그에 넣지 않는다.
    if not key:
        parser.error('NAVER_MAP_KEY_ID를 저장소 Actions secret 또는 variable로 등록하세요.')
    subprocess.run([sys.executable, str(ROOT / 'build.py')], cwd=ROOT, check=True)
    try:
        stage_pages(ROOT, ROOT / args.output, key)
    except ValueError as error:
        parser.error(str(error))
    print('Pages 공개 산출물 준비 완료 · NAVER 설정 있음 · 키 값 출력 안 함')
