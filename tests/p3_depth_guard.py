"""P3 PR base와 비교하여 production 수심 변경을 차단한다."""
import subprocess
import sys

base=sys.argv[1]
# 이번 사용자 요청은 단면 상태 분류/renderer 수정을 명시적으로 허용한다. 운영 수심 자료·query 엔진 보호는 유지한다.
paths=subprocess.check_output(['git','diff','--name-only',base,'HEAD','--','static/depth/','src/app/04_depth.js','src/app/04b_depth_tiles.js','data/'],text=True).splitlines()
if paths:
    print('P3 수심 변경 금지:',*paths,sep='\n')
    sys.exit(1)
print('P3 수심 production 무변경 통과')
