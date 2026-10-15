"""Small, allow-listed review evidence derived from private timeline frames."""
import math

VERSION = 1


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def attach(match, timeline, participant_teams=None):
    frames = sorted(timeline.get('frames', []), key=lambda f: f.get('timestamp', 0))
    if not frames:
        return False
    teams = participant_teams or {p['id']: p['team'] for p in match['players']}
    events = []
    for frame in frames:
        for event in frame.get('events', []):
            kind = event.get('type')
            if kind not in ['CHAMPION_KILL', 'BUILDING_KILL', 'ELITE_MONSTER_KILL']:
                continue
            seconds = event.get('timestamp', -1) / 1000
            if not 0 <= seconds <= match['duration'] + 2:
                continue
            team = teams.get(event.get('killerId')) or event.get('killerTeamId')
            if kind == 'BUILDING_KILL' and not team:
                team = 300 - event['teamId'] if event.get('teamId') in [100, 200] else None
            public = {'type': kind, 'seconds': seconds, 'team': team}
            if kind == 'CHAMPION_KILL':
                public.update(killer=event.get('killerId'), victim=event.get('victimId'), assists=event.get('assistingParticipantIds', []))
                if event.get('shutdownBounty', 0): public['shutdown'] = event['shutdownBounty']
            elif kind == 'ELITE_MONSTER_KILL':
                public.update(monster=event.get('monsterType', ''), subtype=event.get('monsterSubType', ''))
            else:
                public['building'] = event.get('buildingType', '')
            events.append(public)
    seen_kills, unique = set(), []
    for event in events:
        key = (event['seconds'], event.get('killer'), event.get('victim'))
        if event['type'] == 'CHAMPION_KILL':
            if key in seen_kills: continue
            seen_kills.add(key)
        unique.append(event)
    events = unique
    events.sort(key=lambda e: e['seconds'])
    match['reviewTimeline'] = {
        'version': VERSION, 'source': match.get('timelineSource', 'SGP'), 'events': events,
        'coverage': {'frames': len(frames), 'killEvents': sum(e['type'] == 'CHAMPION_KILL' and e['team'] in [100, 200] for e in events),
                     'expectedKills': sum(t['kills'] for t in match['teams'])}}
    for player in match['players']:
        samples = [(f['timestamp'] / 1000, f.get('participantFrames', {}).get(str(player['id']))) for f in frames]
        samples = [(t, p) for t, p in samples if p and 0 <= t <= match['duration']]
        phases = []
        for lo, hi in [(0, 900), (900, 1500), (1500, match['duration'])]:
            if hi <= lo:
                continue
            if not samples:
                continue
            first = min(samples, key=lambda row: abs(row[0] - lo))
            last = [row for row in samples if row[0] <= hi + 5]
            if not last or abs(first[0] - lo) > 5:
                continue
            start, a = first; end, b = last[-1]
            if end - start < 55:
                continue
            minutes = (end - start) / 60
            da = a.get('damageStats', {}).get('totalDamageDoneToChampions')
            db = b.get('damageStats', {}).get('totalDamageDoneToChampions')
            ga, gb = a.get('totalGold'), b.get('totalGold')
            phases.append({'start': start, 'end': end,
                           'dpm': round((db - da) / minutes, 2) if number(da) and number(db) and db >= da else None,
                           'gpm': round((gb - ga) / minutes, 2) if number(ga) and number(gb) and gb >= ga else None})
        player['reviewPhases'] = phases
    redact(match)
    return True


def redact(match):
    """Keep participant references only for the published roster, also after exclusions."""
    allowed = {p['id'] for p in match['players']}
    for event in match.get('reviewTimeline', {}).get('events', []):
        for field in ['killer', 'victim']:
            if field in event and event[field] not in allowed:
                event[field] = None
        if 'assists' in event: event['assists'] = [pid for pid in event['assists'] if pid in allowed]


def preserve(old, new):
    previous = old.get('reviewTimeline')
    fresh = new.get('reviewTimeline')
    quality = lambda value: (value.get('coverage', {}).get('killEvents', 0), value.get('coverage', {}).get('frames', 0))
    if previous and (not fresh or quality(previous) > quality(fresh)):
        import copy
        new['reviewTimeline'] = copy.deepcopy(previous)
        for p in new['players']:
            before = next((q for q in old['players'] if q['id'] == p['id']), {})
            p['reviewPhases'] = copy.deepcopy(before.get('reviewPhases', []))
    redact(new)
