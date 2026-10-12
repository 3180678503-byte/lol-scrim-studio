"""Normalize private LCU/SGP exports and merge public matches without double counting."""
import argparse, copy, datetime as dt, json
from pathlib import Path

ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']
ZONE = dt.timezone(dt.timedelta(hours=8))

def load(p):
    return json.loads(Path(p).read_text(encoding='utf-8-sig'))

def save(p, value):
    path = Path(p)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    temp.replace(path)

def ratio(a, b):
    return a / b if b else None

def upgrade(data):
    data['schemaVersion'] = 2
    # LCU uses -1 for a skipped ban; it is not a champion or a BP appearance.
    data['champions'] = {k: v for k, v in data['champions'].items() if k.isdigit() and int(k) > 0}
    for m in data['matches']:
        for t in m['teams']:
            t['bans'] = [b for b in t.get('bans', []) if b.get('championId', 0) > 0]
        m.setdefault('platformId', 'HN1' if data.get('region') == '艾欧尼亚' else 'UNKNOWN')
        m.setdefault('matchKey', m['platformId'] + ':' + str(m['id']))
        m.setdefault('date', data.get('date', '未知日期'))
        m.setdefault('sessionId', m['date'])
        m.setdefault('createdAt', m['date'] + 'T' + m['start'] + ':00+08:00')
    # Freeze the old four-game review to its exact match set before adding new games.
    awards = data.setdefault('awards', {'matches': {}, 'collections': []})
    if awards.get('overall') and not awards.get('collections'):
        nums = set(n for r in awards['overall'] for n in r.get('matchNumbers', []))
        keys = [m['matchKey'] for m in data['matches'] if m['number'] in nums]
        awards['collections'] = [{'label': data.get('date', '') + ' 原始四场总评', 'matchKeys': keys, 'records': copy.deepcopy(awards['overall']), 'dailyComments': copy.deepcopy(awards.get('dailyComments', [])), 'scopeNote': awards.get('overallScope', '')}]
    return data

def normalize(item, champion_names, summaries, details, overrides):
    d = item['detail']
    if d.get('gameType') != 'CUSTOM_GAME' or len(d.get('participants', [])) != 10:
        raise ValueError('Only verified CUSTOM_GAME 5v5 matches are supported')
    gid = str(d['gameId'])
    platform = d.get('platformId') or item.get('platformId')
    if not platform:
        raise ValueError('Missing platformId for ' + gid)
    key = platform + ':' + gid
    s = item.get('sgp_summary') or summaries.get(gid, {})
    sp = {p['participantId']: p for p in s.get('participants', [])}
    lcu_timeline = item.get('timeline') or {}
    sgp_timeline = item.get('sgp_details') or details.get(gid, {})
    source = 'SGP' if sgp_timeline.get('frames') and sum(len(f.get('events', [])) for f in sgp_timeline['frames']) >= sum(len(f.get('events', [])) for f in lcu_timeline.get('frames', [])) else 'LCU'
    timeline = sgp_timeline if source == 'SGP' else lcu_timeline
    frames = timeline.get('frames', [])
    identities = {p['participantId']: p.get('player', {}) for p in d.get('participantIdentities', [])}
    duration = d['gameDuration']
    if duration <= 0:
        raise ValueError('Non-positive game duration')
    teams, rows, champions = [], [], {}
    for t in d['teams']:
        ps = [p.get('stats', p) for p in d['participants'] if p['teamId'] == t['teamId']]
        team = {'id': t['teamId'], 'win': t['win'] in ('Win', True), 'kills': sum(p.get('kills', 0) for p in ps), 'deaths': sum(p.get('deaths', 0) for p in ps), 'gold': sum(p.get('goldEarned', 0) for p in ps), 'damage': sum(p.get('totalDamageDealtToChampions', 0) for p in ps)}
        for name, field in [('towers', 'towerKills'), ('dragons', 'dragonKills'), ('barons', 'baronKills'), ('heralds', 'riftHeraldKills'), ('grubs', 'hordeKills'), ('firstBlood', 'firstBlood'), ('firstTower', 'firstTower')]:
            team[name] = t.get(field, False if name.startswith('first') else 0)
        team['bans'] = [{'championId': b['championId'], 'turn': b.get('pickTurn')} for b in t.get('bans', []) if b.get('championId', 0) > 0]
        teams.append(team)
    if sorted(t['id'] for t in teams) != [100, 200] or any(sum(p['teamId'] == t['id'] for p in d['participants']) != 5 for t in teams) or sum(t['win'] for t in teams) != 1:
        raise ValueError('Expected two 5-player sides and one winner')
    for p in d['participants']:
        st, sg = p.get('stats', p), sp.get(p['participantId'], {})
        identity = identities.get(p['participantId'], {})
        name = identity.get('gameName') or sg.get('riotIdGameName') or identity.get('summonerName') or ('选手' + str(p['participantId']))
        tag = identity.get('tagLine') or sg.get('riotIdTagline') or ''
        player_key = name + '#' + tag
        corrected = overrides.get(key, {}).get(player_key) or overrides.get(key, {}).get(str(p['participantId']))
        role = corrected or sg.get('teamPosition') or sg.get('individualPosition') or 'UNKNOWN'
        if role not in ROLES:
            role = 'UNKNOWN'
        team = next(t for t in teams if t['id'] == p['teamId'])
        cid = p['championId']
        champions[str(cid)] = {'id': cid, 'name': champion_names.get(str(cid), str(cid)), 'title': champion_names.get(str(cid), str(cid)), 'alias': sg.get('championName', '')}
        row = {'id': p['participantId'], 'key': player_key, 'name': name, 'team': p['teamId'], 'championId': cid, 'role': role, 'roleSource': '人工确认' if corrected else 'SGP teamPosition' if role != 'UNKNOWN' else '未确认'}
        for public, original in [('kills', 'kills'), ('deaths', 'deaths'), ('assists', 'assists'), ('gold', 'goldEarned'), ('damage', 'totalDamageDealtToChampions'), ('vision', 'visionScore'), ('wards', 'wardsPlaced'), ('wardsKilled', 'wardsKilled'), ('controlWards', 'visionWardsBoughtInGame'), ('damageTaken', 'totalDamageTaken'), ('healing', 'totalHeal'), ('cc', 'timeCCingOthers'), ('firstBlood', 'firstBloodKill')]:
            row[public] = st.get(original, 0)
        row.update(cs=st.get('totalMinionsKilled', 0) + st.get('neutralMinionsKilled', 0), win=team['win'], items=[st.get('item' + str(i), 0) for i in range(7)], teamKills=team['kills'], teamGold=team['gold'], teamDamage=team['damage'])
        row.update(kp=ratio(row['kills'] + row['assists'], team['kills']), damageShare=ratio(row['damage'], team['damage']), goldShare=ratio(row['gold'], team['gold']), dpm=row['damage'] / (duration / 60), vspm=row['vision'] / (duration / 60), csm=row['cs'] / (duration / 60))
        rows.append(row)
    for p in rows:
        same = [q for q in rows if q['team'] == p['team'] and q['role'] == p['role']]
        opposite = [q for q in rows if q['team'] != p['team'] and q['role'] == p['role']]
        opponent = opposite[0] if p['role'] != 'UNKNOWN' and len(same) == len(opposite) == 1 else None
        p['opponentId'] = opponent['id'] if opponent else None
        for minute in [10, 15]:
            for metric in ['gd', 'csd', 'xpd', 'sampleTime']:
                p[metric + str(minute)] = None
            f = min(frames, key=lambda f: abs(f['timestamp'] - minute * 60000)) if frames else None
            if not opponent or not f or duration < minute * 60 or abs(f['timestamp'] - minute * 60000) > 5000:
                continue
            pf = f.get('participantFrames', {})
            a, b = pf.get(str(p['id'])), pf.get(str(opponent['id']))
            if a and b:
                p['gd' + str(minute)] = a['totalGold'] - b['totalGold']
                p['csd' + str(minute)] = a.get('minionsKilled', 0) + a.get('jungleMinionsKilled', 0) - b.get('minionsKilled', 0) - b.get('jungleMinionsKilled', 0)
                p['xpd' + str(minute)] = a['xp'] - b['xp']
                p['sampleTime' + str(minute)] = f['timestamp'] / 1000
    public_frames, events = [], []
    for f in frames:
        pf = {pid: {'gold': p['totalGold'], 'xp': p['xp'], 'cs': p.get('minionsKilled', 0) + p.get('jungleMinionsKilled', 0), 'level': p['level']} for pid, p in f.get('participantFrames', {}).items()}
        if all(str(p['id']) in pf for p in rows):
            blue = sum(pf[str(p['id'])]['gold'] for p in rows if p['team'] == 100)
            red = sum(pf[str(p['id'])]['gold'] for p in rows if p['team'] == 200)
            public_frames.append({'seconds': f['timestamp'] / 1000, 'blue': blue, 'red': red, 'gap': blue - red, 'players': pf})
        for e in f.get('events', []):
            if e['type'] not in ['CHAMPION_KILL', 'BUILDING_KILL', 'ELITE_MONSTER_KILL']:
                continue
            killer = next((p for p in rows if p['id'] == e.get('killerId')), None)
            events.append({'type': e['type'], 'seconds': e['timestamp'] / 1000, 'team': killer['team'] if killer else e.get('killerTeamId'), 'killer': e.get('killerId'), 'victim': e.get('victimId'), 'assists': e.get('assistingParticipantIds', []), 'monster': e.get('monsterType', ''), 'subtype': e.get('monsterSubType', ''), 'building': e.get('buildingType', ''), 'lane': e.get('laneType', '')})
    when = dt.datetime.fromtimestamp(d['gameCreation'] / 1000, ZONE)
    near15 = min(public_frames, key=lambda f: abs(f['seconds'] - 900)) if public_frames else None
    result = {'id': gid, 'platformId': platform, 'matchKey': key, 'date': when.date().isoformat(), 'createdAt': when.isoformat(), 'sessionId': when.date().isoformat(), 'start': when.strftime('%H:%M'), 'duration': duration, 'patch': d.get('gameVersion', ''), 'winner': next(t['id'] for t in teams if t['win']), 'teams': teams, 'players': rows, 'frames': public_frames, 'events': events, 'timelineSource': source if frames else '缺失', 'detailedEventCount': sum(len(f.get('events', [])) for f in frames), 'peakBlue': max([0] + [f['gap'] for f in public_frames]), 'peakRed': max([0] + [-f['gap'] for f in public_frames]), 'gd15Blue': near15['gap'] if duration >= 900 and near15 and abs(near15['seconds'] - 900) <= 5 else None}
    for t in teams:
        for b in t['bans']:
            cid = b['championId']
            champions.setdefault(str(cid), {'id': cid, 'name': champion_names.get(str(cid), str(cid)), 'title': champion_names.get(str(cid), str(cid)), 'alias': ''})
    return result, champions

def enrich(old, new):
    result = copy.deepcopy(old)
    richer = (len(new['frames']), new['detailedEventCount']) > (len(old.get('frames', [])), old.get('detailedEventCount', 0))
    if richer:
        for k in ['frames', 'events', 'timelineSource', 'detailedEventCount', 'peakBlue', 'peakRed', 'gd15Blue']:
            result[k] = new[k]
    for row in result['players']:
        fresh = next((p for p in new['players'] if p['id'] == row['id']), None)
        if fresh and fresh['role'] != 'UNKNOWN' and (row.get('role') == 'UNKNOWN' or fresh['roleSource'] == '人工确认' or row.get('roleSource') != '人工确认'):
            for k in ['role', 'roleSource', 'opponentId', 'gd10', 'csd10', 'xpd10', 'sampleTime10', 'gd15', 'csd15', 'xpd15', 'sampleTime15']:
                if fresh.get(k) is not None:
                    row[k] = fresh[k]
    result['createdAt'] = new['createdAt']
    # Recompute every matchup from retained richest frames and corrected roles.
    for p in result['players']:
        same = [q for q in result['players'] if q['team'] == p['team'] and q['role'] == p['role']]
        opposite = [q for q in result['players'] if q['team'] != p['team'] and q['role'] == p['role']]
        opponent = opposite[0] if p['role'] != 'UNKNOWN' and len(same) == len(opposite) == 1 else None
        p['opponentId'] = opponent['id'] if opponent else None
        for minute in [10, 15]:
            for k in ['gd', 'csd', 'xpd', 'sampleTime']:
                p[k + str(minute)] = None
            frames = result.get('frames', [])
            f = min(frames, key=lambda f: abs(f['seconds'] - minute * 60)) if frames else None
            if not opponent or not f or result['duration'] < minute * 60 or abs(f['seconds'] - minute * 60) > 5:
                continue
            a, b = f['players'].get(str(p['id'])), f['players'].get(str(opponent['id']))
            if a and b:
                p['gd' + str(minute)] = a['gold'] - b['gold']
                p['csd' + str(minute)] = a['cs'] - b['cs']
                p['xpd' + str(minute)] = a['xp'] - b['xp']
                p['sampleTime' + str(minute)] = f['seconds']
    return result

def validate_awards(records, matches, scope_keys):
    from report import aggregate
    if sorted(r.get('category', '') for r in records) != sorted(['mvp', 'svp', 'winWorst', 'loseWorst']):
        raise ValueError('Each review needs exactly four distinct award categories')
    selected = [m for m in matches if m['matchKey'] in scope_keys]
    for r in records:
        for k in ['key', 'name', 'team', 'title', 'reason', 'roast', 'alternative', 'stats', 'scope', 'matchNumbers']:
            if k not in r:
                raise ValueError('Missing award field: ' + k)
        if r['scope'] not in ['all', 'wins', 'losses']:
            raise ValueError('Invalid award scope')
        if any(k not in r['stats'] for k in ['games', 'kills', 'deaths', 'assists', 'dpm', 'kp', 'gd15']):
            raise ValueError('Missing award statistics')
        wanted = 'losses' if r['category'] in ['svp', 'loseWorst'] else 'wins' if r['category'] == 'winWorst' else 'all'
        ps = [(m, p) for m in selected for p in m['players'] if p['key'] == r['key'] and (wanted == 'all' or p['win'] == (wanted == 'wins'))]
        if not ps or (len(selected) == 1 and (r['category'] == 'mvp' and not ps[0][1]['win'])):
            raise ValueError('Award player or win/loss scope is invalid')
        if sorted(r['matchNumbers']) != sorted(m['number'] for m, p in ps):
            raise ValueError('Award matchNumbers do not match its actual scope')
        if len(selected) > 1 and r['scope'] != wanted:
            raise ValueError('Collection award scope must match category')
        if r['name'] != ps[-1][1]['name']:
            raise ValueError('Award name does not match player')
        sides = {p['team'] for m, p in ps}
        if r['team'] != (next(iter(sides)) if len(sides) == 1 else None):
            raise ValueError('Award team does not match player sides')
        if len(selected) == 1 and r.get('championId') != ps[0][1]['championId']:
            raise ValueError('Award champion does not match this game')
        if len(selected) > 1 and r.get('championId') is not None:
            raise ValueError('Collection award must not imply a single champion')
        expected = next(p for p in aggregate(selected, wanted) if p['key'] == r['key'])
        if len(selected) == 1:
            expected = next(p for p in aggregate(selected) if p['key'] == r['key'])
        for k in ['games', 'dpm', 'kp', 'gd15', 'csd15', 'damageShare', 'goldShare']:
            if k in r['stats']:
                actual, truth = r['stats'][k], expected[k]
                if (actual is None) != (truth is None) or actual is not None and abs(actual - truth) > 0.005 * max(1, abs(truth)):
                    raise ValueError('Award statistic mismatch: ' + k)
        for k in ['kills', 'deaths', 'assists']:
            if r['stats'].get(k) != sum(p[k] for m, p in ps):
                raise ValueError('Award stats disagree with actual games: ' + k)

def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--site', required=True); a.add_argument('--input'); a.add_argument('--sgp'); a.add_argument('--roles'); a.add_argument('--awards')
    args = a.parse_args()
    site = Path(args.site)
    data = upgrade(load(site / 'data.json'))
    known = {m['matchKey']: m for m in data['matches']}
    added, repeated = [], []
    summaries, details = {}, {}
    if args.sgp:
        sgp = load(args.sgp).get('responses', {})
        for g in sgp.get('history', {}).get('games', []):
            s = g.get('json', g)
            summaries[str(s['gameId'])] = s
        for field, target in [('summary', summaries), ('details', details)]:
            if sgp.get(field):
                s = sgp[field].get('json', sgp[field]); target[str(s['gameId'])] = s
    if args.input:
        raw = load(args.input)
        names = raw.get('champion_names', {})
        for cid, c in raw.get('champions', {}).items():
            names.setdefault(cid, c.get('name', cid))
        overrides = load(args.roles) if args.roles else {}
        for item in raw['matches']:
            m, champions = normalize(item, names, summaries, details, overrides)
            for cid, c in champions.items():
                data['champions'].setdefault(cid, c)
            if m['matchKey'] in known:
                known[m['matchKey']] = enrich(known[m['matchKey']], m); repeated.append(m['matchKey'])
            else:
                m['number'] = max([0] + [x['number'] for x in known.values()]) + 1
                known[m['matchKey']] = m; added.append(m['matchKey'])
    data['matches'] = sorted(known.values(), key=lambda m: (m['createdAt'], m['number']))
    data['sampleSize'] = len(data['matches'])
    data['sessions'] = [{'id': sid, 'label': sid + ' 内战', 'date': sid, 'matchKeys': [m['matchKey'] for m in data['matches'] if m['sessionId'] == sid]} for sid in sorted({m['sessionId'] for m in data['matches']})]
    data['rosters'] = {str(t): sorted({p['name'] for m in data['matches'] for p in m['players'] if p['team'] == t}) for t in [100, 200]}
    if args.awards:
        updates = load(args.awards)
        for key, records in updates.get('matches', {}).items():
            m = next((m for m in data['matches'] if key in [m['matchKey'], str(m['number'])]), None)
            if not m:
                raise ValueError('Unknown award match: ' + key)
            validate_awards(records, data['matches'], [m['matchKey']])
            data['awards'].setdefault('matches', {})[str(m['number'])] = records
        for collection in updates.get('collections', []):
            keys = collection['matchKeys']
            if not keys or len(set(keys)) != len(keys) or not set(keys).issubset(known):
                raise ValueError('Invalid collection matchKeys')
            validate_awards(collection['records'], data['matches'], keys)
            collections = data['awards'].setdefault('collections', [])
            collections[:] = [c for c in collections if set(c['matchKeys']) != set(keys)]
            collections.append(collection)
    save(site / 'data.json', data)
    print(json.dumps({'total': len(known), 'added': added, 'duplicates': repeated}, ensure_ascii=False))

if __name__ == '__main__':
    main()
