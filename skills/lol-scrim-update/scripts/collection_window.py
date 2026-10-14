"""Timezone-aware, half-open collection windows for incremental history queries."""
import datetime as dt

def parse_window(since=None, until=None):
    if not since and not until:
        return None
    if not since or not until:
        raise ValueError('Provide both --since and --until')
    def timestamp(value):
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError('Collection timestamps must include a timezone')
        return round(parsed.timestamp() * 1000)
    start, end = timestamp(since), timestamp(until)
    if start >= end:
        raise ValueError('Collection window must have start < end')
    return {'start': since, 'end': until, 'startMs': start, 'endMs': end, 'timeZone': 'Asia/Shanghai'}

def in_window(summary, window):
    if window is None:
        return True
    created = summary.get('gameCreation')
    return isinstance(created, (int, float)) and window['startMs'] <= created < window['endMs']

def before_window(page, window):
    # Only stop at an entirely older page; a mixed boundary page must be retained.
    return bool(window and page) and all(isinstance(s.get('gameCreation'), (int, float)) and s['gameCreation'] < window['startMs'] for s in page)
