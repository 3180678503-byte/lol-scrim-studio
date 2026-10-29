import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch,Mock

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('publishing_io',ROOT/'tools/publishing_io.py')
io=importlib.util.module_from_spec(spec);spec.loader.exec_module(io)

class PublishingIO(unittest.TestCase):
    def test_proxy_formats(self):
        self.assertEqual(io.parse_proxy('127.0.0.1:7897'),'http://127.0.0.1:7897')
        self.assertEqual(io.parse_proxy('http=127.0.0.1:1;https=127.0.0.1:2'),'http://127.0.0.1:2')
        self.assertIsNone(io.parse_proxy('bad\nproxy'))
    def test_explicit_git_proxy_is_preserved(self):
        with patch.object(io.subprocess,'run',return_value=Mock(returncode=0,stdout='')):
            self.assertEqual(io.git_proxy('git','https://github.com/x/y',{}),'')
    def test_system_proxy_fallback(self):
        with patch.object(io.subprocess,'run',return_value=Mock(returncode=1)),patch.object(io,'system_proxy',return_value='http://127.0.0.1:7897'):
            self.assertEqual(io.git_proxy('git','https://github.com/x/y',{}),'http://127.0.0.1:7897')
    def test_atomic_copy_and_path_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);source=base/'source';target=base/'target';source.mkdir();target.mkdir()
            rel=Path('报告/日报.json');(source/rel).parent.mkdir();(source/rel).write_bytes(b'{"score":50}')
            io.copy_publication_files(source,target,[rel]);self.assertEqual((target/rel).read_bytes(),b'{"score":50}')
            self.assertFalse(list(target.rglob('*.tmp')))
            with self.assertRaises(ValueError):io.copy_publication_files(source,target,[Path('../outside')])
            with self.assertRaisesRegex(RuntimeError,'missing.json'):io.copy_publication_files(source,target,[Path('missing.json')])

if __name__=='__main__':unittest.main()
