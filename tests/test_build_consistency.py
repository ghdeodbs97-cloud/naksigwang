"""Windows CRLF와 Linux LF source가 동일한 index를 생성하는지 확인한다."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='naksigwang-build-') as temp:
    folder=Path(temp).resolve()
    outputs=[]
    for label,newline in [('lf','\n'),('crlf','\r\n')]:
        work=folder/label
        assert work.resolve().parent==folder
        (work/'static').mkdir(parents=True)
        (work/'src/app').mkdir(parents=True)
        shutil.copyfile(ROOT/'build.py',work/'build.py')
        for name in ['coast','ports','access','rocks','ban','fish_temp','gebco','osm','crnt']:
            (work/'static'/f'{name}.js').write_bytes(('// 고정 자료\nconst data = [];\n'.replace('\n',newline)).encode())
        (work/'src/template.html').write_bytes(('/*STATIC_SCRIPTS*/\n<script>/*APP*/</script>\n'.replace('\n',newline)).encode())
        (work/'src/app/00_test.js').write_bytes(('// 검사 코드\nconst value = 1;\n'.replace('\n',newline)).encode())
        subprocess.run([sys.executable,str(work/'build.py')],check=True,stdout=subprocess.PIPE)
        outputs.append((work/'index.html').read_bytes())
    assert outputs[0]==outputs[1],'CRLF/LF 빌드 불일치'
    assert b'\r\n' not in outputs[0],'출력 LF 고정'
print('빌드 플랫폼 일치 통과')
