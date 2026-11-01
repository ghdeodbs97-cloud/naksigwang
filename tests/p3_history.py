"""rebase 뒤에도 같은 기능 도입 전 빌드를 찾는다."""
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent

def before_added(path):
    commit=subprocess.check_output(['git','log','-1','--format=%H','--diff-filter=A','HEAD','--',path],cwd=ROOT,text=True).strip()
    if not commit:
        raise RuntimeError('기능 도입 커밋을 찾지 못함: '+path)
    return subprocess.check_output(['git','rev-parse',commit+'^'],cwd=ROOT,text=True).strip()
