"""V2.1 전체 회귀 실행. 기본은 전체, --resume은 기록된 통과 항목을 재사용한다."""
import subprocess,sys,json,os,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent
output=root/'test-output/bite_v21_suite.json';output.parent.mkdir(exist_ok=True)
commands=[['node','tests/boot_degradation.mjs'],[sys.executable,'build.py']]+[[sys.executable,str(p.relative_to(root))] for p in sorted((root/'tests').glob('test_*.py'))]+[[sys.executable,'tests/smoke.py'],[sys.executable,'tests/smoke_degradation.py']]
results=json.loads(output.read_text(encoding='utf-8')) if '--resume' in sys.argv and output.exists() else []
passed={r['test'] for r in results if r['exit']==0}
for cmd in commands:
 name=cmd[-1].replace('\\','/')
 if name in passed:continue
 results=[r for r in results if r['test']!=name];start=time.monotonic()
 (root/'test-output/bite_v21_active.txt').write_text(name,encoding='utf-8')
 try:
  process=subprocess.run(cmd,cwd=root,capture_output=True,timeout=7200,encoding='utf-8',errors='replace',env={**os.environ,'PYTHONUTF8':'1','PYTHONPATH':str(root/'.test-deps')})
  text=process.stdout+process.stderr;row={'test':name,'exit':process.returncode,'seconds':round(time.monotonic()-start,2),'output':text[-6000:]}
 except subprocess.TimeoutExpired:row={'test':name,'exit':124,'seconds':7200,'output':'7200초 제한'}
 results.append(row);output.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(name,row['exit'],flush=True)
sys.exit(any(r['exit'] for r in results))
