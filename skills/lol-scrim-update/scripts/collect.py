"""Bounded, read-only LCU/SGP collection; authentication never leaves memory/files."""
import argparse, base64, datetime, json, os, re, ssl, subprocess, urllib.request, urllib.error, urllib.parse
from pathlib import Path

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

def opener(local=False):
    ctx = ssl._create_unverified_context() if local else ssl.create_default_context()
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=ctx), NoRedirect())

def read(client, url, auth):
    try:
        with client.open(urllib.request.Request(url, headers={'Authorization': auth, 'Accept': 'application/json'}, method='GET'), timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError('HTTP ' + str(e.code)) from None
    except (OSError, ValueError):
        raise RuntimeError('Connection or JSON error') from None

def credentials():
    command = "Get-CimInstance Win32_Process -Filter \"Name='LeagueClientUx.exe' OR Name='LeagueClient.exe'\" | Select-Object CommandLine,ExecutablePath | ConvertTo-Json -Compress"
    raw = subprocess.run(['powershell', '-NoProfile', '-Command', command], capture_output=True, text=True, encoding='utf-8', errors='replace', check=True).stdout.strip()
    ps = json.loads(raw) if raw else []
    for p in (ps if isinstance(ps, list) else [ps]):
        line = p.get('CommandLine') or ''
        port, token = re.search(r'--app-port=(\d+)', line), re.search(r'--remoting-auth-token=([^\s"]+)', line)
        if port and token:
            return port[1], token[1]
        exe = p.get('ExecutablePath')
        if exe:
            for path in [Path(exe).parent / 'lockfile', Path(exe).parent.parent / 'lockfile']:
                if path.exists():
                    parts = path.read_text().split(':')
                    if len(parts) >= 5 and parts[2].isdigit():
                        return parts[2], parts[3]
    raise RuntimeError('No logged-in League client found')

def strip_secrets(v):
    denied = {'token', 'jwt', 'mucjwtdto', 'accesstoken', 'refreshtoken', 'idtoken', 'authorization', 'password', 'roompassword'}
    if isinstance(v, dict):
        return {k: strip_secrets(x) for k, x in v.items() if k.lower() not in denied}
    if isinstance(v, list):
        return [strip_secrets(x) for x in v]
    return v

def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--output', required=True)
    a.add_argument('--history-count', type=int, default=60)
    a.add_argument('--max-games', type=int, default=20)
    a.add_argument('--game-ids', default='')
    a.add_argument('--allow-sgp', action='store_true')
    a.add_argument('--platform')
    a.add_argument('--akari-config', default=str(Path(os.environ.get('APPDATA', '')) / 'league-akari/AkariConfig/akari-api-main/config/v1/sgp/league-servers.json'))
    args = a.parse_args()
    if not 1 <= args.history_count <= 200 or not 1 <= args.max_games <= 40:
        a.error('history-count 1..200; max-games 1..40')
    target = Path(args.output)
    if target.exists():
        a.error('Output exists; choose a new timestamped private filename')
    port, password = credentials()
    local = opener(True)
    authorization = 'Basic ' + base64.b64encode(('riot:' + password).encode()).decode()
    def lcu(path):
        return read(local, 'https://127.0.0.1:' + port + path, authorization)
    history = []
    for start in range(0, args.history_count, 20):
        h = lcu('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=' + str(start) + '&endIndex=' + str(min(start + 19, args.history_count - 1)))
        games = h.get('games', {})
        page = games.get('games', []) if isinstance(games, dict) else games
        history.extend(page)
        if len(page) < min(20, args.history_count - start):
            break
    requested = [s.strip() for s in args.game_ids.split(',') if s.strip()]
    if any(not s.isdigit() for s in requested) or len(requested) > args.max_games:
        a.error('game-ids must be numeric and within max-games')
    ids = requested or list(dict.fromkeys(str(g['gameId']) for g in history if g.get('gameType') == 'CUSTOM_GAME'))[:args.max_games]
    export = {'collectedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'matches': [], 'champions': {}}
    try:
        export['champions'] = {str(c['id']): {k: c[k] for k in ['id', 'name', 'alias'] if k in c} for c in lcu('/lol-game-data/assets/v1/champion-summary.json') if c.get('id', 0) > 0}
    except RuntimeError:
        pass
    remote = opener()
    bearer = None
    if args.allow_sgp:
        bearer = 'Bearer ' + lcu('/entitlements/v1/token')['accessToken']
        config = json.loads(Path(args.akari_config).read_text(encoding='utf-8'))
    for gid in ids:
        detail = lcu('/lol-match-history/v1/games/' + gid)
        if detail.get('gameType') != 'CUSTOM_GAME' or len(detail.get('participants', [])) != 10:
            continue
        platform = (detail.get('platformId') or args.platform or '').upper()
        if not re.fullmatch('[A-Z0-9]+', platform):
            raise RuntimeError('Missing platformId; pass --platform with the actual region')
        item = {'detail': detail, 'timeline': {}, 'platformId': platform}
        try:
            item['timeline'] = lcu('/lol-match-history/v1/game-timelines/' + gid)
        except RuntimeError as e:
            item['timelineError'] = str(e)
        if bearer:
            server = config.get('servers', {}).get('TENCENT_' + platform, {})
            base = server.get('matchHistory', '')
            parsed = urllib.parse.urlparse(base)
            if parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.lol.qq.com') or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise RuntimeError('Unrecognized Tencent server configuration; inspect before querying')
            for label, endpoint in [('sgp_summary', 'SUMMARY'), ('sgp_details', 'DETAILS')]:
                try:
                    item[label] = read(remote, base.rstrip('/') + '/match-history-query/v1/products/lol/' + platform + '_' + gid + '/' + endpoint, bearer)
                except RuntimeError as e:
                    item[label + '_error'] = str(e)
        export['matches'].append(strip_secrets(item))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(export, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({'customMatches': len(export['matches']), 'gameIds': [str(m['detail']['gameId']) for m in export['matches']], 'sgpEnabled': args.allow_sgp}))

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, KeyError, ValueError, OSError) as e:
        raise SystemExit(type(e).__name__ + ': ' + (str(e) if isinstance(e, RuntimeError) else 'Check local client/configuration; no credentials were saved'))
