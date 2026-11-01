"""단면 상태 분류와 실제 Canvas 수심 stroke를 검사한다."""
import json
import base64
import subprocess
import sys
from pathlib import Path
from depth_probe import PROBE, run
from p3_history import before_added

ROOT=Path(__file__).resolve().parent.parent
(ROOT/'test-output').mkdir(exist_ok=True)
probe=PROBE+(ROOT/'tests/section_state_checks.js').read_text(encoding='utf-8')
previous='--previous' in sys.argv
baseline_ref=before_added('src/app/17b_section_surface.js')
old_html=subprocess.check_output(['git','show',baseline_ref+':index.html']).decode('utf-8')
html=old_html if previous else None
def routes(page):page.route('https://**/*',lambda r:r.abort())
if previous:
    try:run(probe,'window.sectionStateTest()',routes=routes,html_source=html)
    except Exception as error:
        assert 'rock_exposed' in str(error),str(error)
        print('수정 전 갯바위 분류 실패 재현:',str(error).splitlines()[0])
    else:raise AssertionError('이전 빌드 실패 재현 안 됨')
else:
    output=[]
    for size in [{'width':390,'height':844},{'width':1280,'height':900}]:
        result=run(probe,'window.sectionStateTest()',routes=routes,viewport=size)
        for i,row in enumerate(result):
            image=row.pop('image',None)
            if image:(ROOT/f'test-output/section-{size["width"]}-{i}.png').write_bytes(base64.b64decode(image.split(',',1)[1]))
        old_water=run(probe,'window.sectionStateTest({onlyWater:true})',routes=routes,html_source=old_html,viewport=size)
        new_water=run(probe,'window.sectionStateTest({onlyWater:true})',routes=routes,viewport=size)
        assert old_water==new_water,'기존 순수 바다 301개 수심·provenance·실제 Canvas 경로 변경'
        output.append({'viewport':size,'cases':result,'pureWaterGoldenEqual':True})
        print(size,json.dumps(result,ensure_ascii=False))
    (ROOT/'test-output/section_states.json').write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
