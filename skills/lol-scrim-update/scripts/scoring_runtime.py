"""Use the same dependency-free scoring engine as the browser and report tools."""
import os
import shutil
import subprocess
from pathlib import Path

def update_scores(site):
    root = Path(__file__).resolve().parents[3]
    node = os.environ.get('SCRIM_NODE') or shutil.which('node')
    bundled = Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
    if not node and bundled.is_file():
        node = str(bundled)
    if not node:
        raise RuntimeError('Scoring v2 needs Node.js; set SCRIM_NODE to its executable.')
    subprocess.run([node, str(root/'tools/score-datasets.cjs'), '--site', str(Path(site).resolve())], check=True,
                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
