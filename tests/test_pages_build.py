"""배포용 ID 주입과 공개 파일 범위·원본/자료 보호를 검사한다. 실 API는 사용하지 않는다."""
import contextlib
import io
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from tools.build_pages import stage_pages


class PagesBuildTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.page='<meta name="naver-map-key-id" content=""><p>낚시광</p>'
        (self.root/'index.html').write_text(self.page,encoding='utf-8')
        for folder in ['static','data']:(self.root/folder).mkdir()
        (self.root/'static/fish.webp').write_bytes(b'asset')
        (self.root/'static/map.local.json').write_text('private',encoding='utf-8')
        (self.root/'data/meta.json').write_text('{"generated":"fixture"}',encoding='utf-8')
        (self.root/'.env').write_text('private',encoding='utf-8')
        (self.root/'src').mkdir()

    def test_artifact_only_injection_and_public_files(self):
        output=self.root/'artifact'
        capture=io.StringIO()
        with contextlib.redirect_stdout(capture):stage_pages(self.root,output,'fixture-key-not-real')
        self.assertIn('content="fixture-key-not-real"',(output/'index.html').read_text(encoding='utf-8'))
        self.assertEqual((self.root/'index.html').read_text(encoding='utf-8'),self.page)
        self.assertEqual((output/'data/meta.json').read_bytes(),(self.root/'data/meta.json').read_bytes())
        self.assertEqual((output/'static/fish.webp').read_bytes(),b'asset')
        self.assertFalse((output/'.env').exists())
        self.assertFalse((output/'src').exists())
        self.assertFalse((output/'static/map.local.json').exists())
        self.assertNotIn('fixture-key-not-real',capture.getvalue())

    def test_missing_invalid_key_blocks_output(self):
        for key in ['', ' ', '"><script>alert(1)</script>']:
            output=self.root/'invalid-artifact'
            with self.assertRaises(ValueError):stage_pages(self.root,output,key)
            self.assertFalse(output.exists())

    def test_protected_target_and_existing_folder_are_rejected(self):
        (self.root/'already').mkdir()
        for output in [self.root,self.root/'data/new',self.root/'static/new',self.root.parent/'outside',self.root/'src',self.root/'already']:
            with self.assertRaises(ValueError):stage_pages(self.root,output,'fixture-key-not-real')

    def test_missing_meta_rejected(self):
        (self.root/'index.html').write_text('<p>no config slot</p>',encoding='utf-8')
        with self.assertRaises(ValueError):stage_pages(self.root,self.root/'artifact','fixture-key-not-real')


if __name__=='__main__':unittest.main()
