"""고정된 이전 빌드와 현재 빌드를 같은 60프레임 burst로 비교한다. 실 SDK 계측이 아니다."""
import json
from pathlib import Path
import subprocess
from depth_probe import PROBE,run
from p3_baseline import CHECK
from p3_history import before_added

ROOT=Path(__file__).resolve().parent.parent
REF=before_added('src/app/15d_render_state.js')
results={}
for label in ['before','after']:
    def source(name):
        return subprocess.check_output(['git','show',REF+':'+name],cwd=ROOT).decode('utf-8') if label=='before' else (ROOT/name).read_text(encoding='utf-8')
    html=source('index.html')
    probe=PROBE+CHECK+source('tests/p3_provider_checks.js')+(ROOT/'tests/p3_perf_baseline.js').read_text(encoding='utf-8')
    results[label]=[]
    for w,h in [(390,844),(1280,900),(1920,1080)]:
        result=run(probe,'window.p3PerfBaseline()',routes=lambda page:page.route('https://**/*',lambda r:r.abort()),html_source=html,viewport={'width':w,'height':h})
        results[label].append({'viewport':[w,h],**result})
        print(label,w,'pan FPS',round(result['pan']['fps'],2),'base',result['pan']['counts'].get('renderBase',0),flush=True)
out=ROOT/'test-output/p3_perf_comparison.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
for result in results['after']:
    for name in ['providerSync','providerCheck','renderBase','getImageData','drawUI','drawSection']:
        assert not result['stationary']['counts'].get(name),name
    assert not result['pan']['counts'].get('renderBase')
    assert result['afterPan']['counts'].get('renderBase')==1,result['afterPan']
    assert not result['afterPan']['moving'] and not result['afterPan']['heavyHidden']
