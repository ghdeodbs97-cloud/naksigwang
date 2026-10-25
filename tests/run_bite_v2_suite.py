"""기존·V2 검사 전체 실행. 긴 지도 반복검사를 줄이지 않으며 --resume으로 통과 항목을 재사용한다."""
import subprocess,sys,json,os
from pathlib import Path
root=Path(__file__).resolve().parent.parent
commands=[['node','tests/boot_degradation.mjs'],[sys.executable,'build.py']]
commands += [[sys.executable,str(p.relative_to(root))] for p in sorted((root/'tests').glob('test_*.py'))]
commands += [[sys.executable,'tests/smoke.py'],[sys.executable,'tests/smoke_degradation.py']]
results=json.loads((root/'test-output/bite_v2_suite.json').read_text(encoding='utf-8')) if '--resume' in sys.argv and (root/'test-output/bite_v2_suite.json').exists() else []
passed={r['test'] for r in results if r['exit']==0}
for cmd in commands:
 if cmd[-1] in passed:continue
 results=[r for r in results if r['test']!=cmd[-1]]
 try:
  r=subprocess.run(cmd,cwd=root,capture_output=True,timeout=3600,encoding='utf-8',errors='replace',env={**os.environ,'PYTHONUTF8':'1','PYTHONPATH':str(root/'.test-deps')})
  row={'test':cmd[-1],'exit':r.returncode,'output':(r.stdout+r.stderr)[-6000:]}
 except subprocess.TimeoutExpired: row={'test':cmd[-1],'exit':124,'output':'3600초 시간 초과'}
 results.append(row);print(row['test'],row['exit'],flush=True)
 (root/'test-output/bite_v2_suite.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
sys.exit(any(r['exit'] for r in results))
