"""Build a portable deployment ZIP from public sources only; never include secrets."""
import argparse
import pathlib
import subprocess
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True, type=pathlib.Path)
args = parser.parse_args()
files = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
backend = {'backend/worker.mjs', 'backend/schema.sql', 'backend/manifest.json', 'backend/moments-core.mjs', 'backend/moments-worker.mjs', 'backend/moments-archive.mjs', 'backend/moments-schema.sql'}
args.output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(args.output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in sorted(set(files)):
        if not name:
            continue
        p = pathlib.PurePosixPath(name)
        if name in backend or name == 'server/serve.mjs':
            archive.write(root / name, 'app/' + name)
        elif p.parts[0] not in {'backend', 'server', 'tests', 'tools', 'docs', '.github', '.openai'} and not any(part.startswith('.') for part in p.parts) and p.suffix.lower() in {'.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.txt', '.csv'}:
            archive.write(root / name, 'app/public/' + name)
    archive.write(root / 'community-core.js', 'app/community-core.js')
    for name in ['Dockerfile', 'compose.yaml', 'Caddyfile', 'DEPLOY.md']:
        archive.write(root / 'server' / name, name)
    archive.writestr('.env.example', 'STUDIO_DOMAIN=studio.example.com\nSITE_ORIGIN=https://studio.example.com\nGROUP_CODE=\nSESSION_SECRET=\nADMIN_KEY=\nARCHIVE_KEY=\nIMPORT_SQL=/data/import.sql\n')
print('Deployment package created: ' + str(args.output.resolve()))
