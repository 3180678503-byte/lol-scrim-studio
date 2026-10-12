"""Produce role-aware statistics for review; never auto-assign subjective awards."""
import argparse, collections, json
from pathlib import Path

def ratio(a, b):
    return a / b if b else None

def aggregate(matches, scope='all', role=None):
    groups = collections.defaultdict(list)
    for m in matches:
        for p in m['players']:
            if role and p['role'] != role or scope != 'all' and p['win'] != (scope == 'wins'):
                continue
            groups[p['key']].append((m, p))
    result = []
    for key, rows in groups.items():
        def total(k):
            return sum(p.get(k, 0) or 0 for m, p in rows)
        def mean(k):
            values = [p[k] for m, p in rows if p.get(k) is not None]
            return sum(values) / len(values) if values else None
        minutes = sum(m['duration'] / 60 for m, p in rows)
        k, d, a = total('kills'), total('deaths'), total('assists')
        result.append({'key': key, 'name': rows[-1][1]['name'], 'scope': scope, 'games': len(rows), 'matchNumbers': [m['number'] for m, p in rows], 'roles': dict(collections.Counter(p['role'] for m, p in rows)), 'wins': sum(p['win'] for m, p in rows), 'kills': k, 'deaths': d, 'assists': a, 'kda': ratio(k+a, d), 'perfect': d == 0, 'dpm': ratio(total('damage'), minutes), 'kp': ratio(k+a, total('teamKills')), 'damageShare': ratio(total('damage'), total('teamDamage')), 'goldShare': ratio(total('gold'), total('teamGold')), 'efficiency': ratio(total('damage')*1000, total('gold')), 'csm': ratio(total('cs'), minutes), 'vspm': ratio(total('vision'), minutes), 'damageTaken': total('damageTaken'), 'cc': total('cc'), 'gd15': mean('gd15'), 'csd15': mean('csd15'), 'xpd15': mean('xpd15'), 'gd15Samples': sum(p.get('gd15') is not None for m, p in rows)})
    return sorted(result, key=lambda p: p['dpm'] or 0, reverse=True)

def main():
    a = argparse.ArgumentParser(description=__doc__); a.add_argument('--site', required=True); a.add_argument('--games'); a.add_argument('--output', required=True)
    args = a.parse_args()
    data = json.loads((Path(args.site)/'data.json').read_text(encoding='utf-8'))
    wanted = set(map(int, args.games.split(','))) if args.games else {m['number'] for m in data['matches']}
    matches = [m for m in data['matches'] if m['number'] in wanted]
    if {m['number'] for m in matches} != wanted or not matches:
        a.error('Unknown or empty game selection')
    report = {'matchKeys': [m['matchKey'] for m in matches], 'scopes': {s: aggregate(matches, s) for s in ['all','wins','losses']}, 'positions': {r: aggregate(matches, role=r) for r in ['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY','UNKNOWN']}, 'perMatch': {m['matchKey']: aggregate([m]) for m in matches}, 'note': 'Statistics are evidence, not official MVP scores; review role, events and alternatives.'}
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps({'matches': len(matches), 'players': len(report['scopes']['all'])}))

if __name__ == '__main__':
    main()
