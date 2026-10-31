"""기존 CI 명령 전체를 실행하고 종료코드와 출력을 남긴다."""
import json
import os
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parent.parent
commands=[['node','tests/boot_degradation.mjs'],[sys.executable,'build.py']]
commands += [[sys.executable,'tests/'+name] for name in ['test_collector_resilience.py','smoke.py','smoke_degradation.py','test_bite_confidence.py','test_depth_converter.py','test_depth_foundation.py','test_khoa_fetch.py','test_khoa_depth.py','test_khoa_coverage.py','test_khoa_coverage_browser.py']]
results=[]
for cmd in commands:
    try:
        result=subprocess.run(cmd,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240,encoding='utf-8',errors='replace')
        entry={'command':cmd[-1],'exit':result.returncode,'output':result.stdout[-6000:]}
    except subprocess.TimeoutExpired as e:entry={'command':cmd[-1],'exit':124,'output':'240초 시간 초과'}
    results.append(entry)
    (ROOT/'test-output/p3_suite_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    print(entry['command'],entry['exit'],flush=True)
sys.exit(any(r['exit'] for r in results))
