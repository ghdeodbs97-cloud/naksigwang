"""검증 후 변환한 지역/출처 묶음을 새 배포 폴더로 합친다. 원본/기존 배포는 수정하지 않는다."""
import argparse
import json
import hashlib
from pathlib import Path
import shutil
import tempfile


def merge(inputs, output):
    if output.exists():
        raise ValueError('새 출력 폴더를 지정하세요')
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = {'version':1,'datasets':[],'tiles':[],'provenance':[]}
    ids = {}
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staging = Path(tmp)/'depth'; staging.mkdir()
        for i, folder in enumerate(inputs):
            m = json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
            if m['version'] != 1:
                raise ValueError('지원하지 않는 버전')
            remap = {}
            for n, ds in enumerate(m['datasets']):
                if ds['id'] in ids:
                    new = ids[ds['id']]
                    if manifest['datasets'][new] != ds:
                        raise ValueError('자료집ID 충돌: ' + ds['id'])
                else:
                    new = len(manifest['datasets']); ids[ds['id']] = new; manifest['datasets'].append(ds)
                remap[n] = new
            dest = staging/str(i); dest.mkdir()
            for t in m['tiles']:
                source = (folder/t['file']).resolve()
                if not source.is_relative_to(folder.resolve()):
                    raise ValueError('범위 밖 파일 경로')
                doc = json.loads(source.read_text(encoding='utf-8'))
                for row in doc['points']: row[3] = remap[row[3]]
                data = json.dumps(doc,ensure_ascii=False,separators=(',',':')).encode('utf-8')
                if len(data)>1024*1024 or len(doc['points'])>12000:
                    raise ValueError('타일 크기 초과')
                relative = Path(t['file'])
                name = str(i)+'/'+(relative.parent/(relative.stem+'_'+hashlib.sha256(data).hexdigest()[:12]+'.json')).as_posix()
                (staging/name).parent.mkdir(parents=True,exist_ok=True)
                (staging/name).write_bytes(data)
                manifest['tiles'].append({**t,'file':name,'bytes':len(data)})
            manifest['provenance'].append(m.get('provenance',{}))
        text = json.dumps(manifest,ensure_ascii=False,indent=2)
        if len(text.encode('utf-8'))>1024*1024:
            raise ValueError('목록 1 MiB 초과: 지역별 목록 분할이 필요합니다')
        (staging/'manifest.json').write_text(text,encoding='utf-8')
        shutil.move(str(staging),str(output))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('inputs',nargs='+',type=Path); p.add_argument('--output',required=True,type=Path)
    a=p.parse_args(); merge(a.inputs,a.output)
