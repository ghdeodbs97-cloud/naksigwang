"""P3 PR base와 비교하여 production 수심 변경을 차단한다."""
import subprocess
import sys

base=sys.argv[1]
paths=subprocess.check_output(['git','diff','--name-only',base,'HEAD','--','static/depth/','src/app/04_depth.js','src/app/04b_depth_tiles.js','src/app/18_section.js'],text=True).splitlines()
if paths:
    print('P3 수심 변경 금지:',*paths,sep='\n')
    sys.exit(1)
print('P3 수심 production 무변경 통과')
