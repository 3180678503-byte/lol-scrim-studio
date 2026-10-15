"""Enrich existing published matches from a local cache; never query a server."""
import argparse, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'skills/lol-scrim-update/scripts'))
import merge
import review_timeline


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', default=str(ROOT)); parser.add_argument('--cache', required=True)
    parser.add_argument('--summaries', nargs='*', default=[])
    parser.add_argument('--custom-export'); parser.add_argument('--sgp-export')
    args = parser.parse_args()
    root, cache = Path(args.site), Path(args.cache)
    teams = {}
    for path in args.summaries:
        for game in merge.load(path).get('games', []):
            summary = game['summary']
            teams[summary['platformId'] + ':' + str(summary['gameId'])] = {p['participantId']: p['teamId'] for p in summary['participants']}
    custom = {}
    if args.custom_export:
        for game in merge.load(args.custom_export).get('matches', []):
            custom[str(game['detail']['gameId'])] = game.get('timeline', {})
    if args.sgp_export:
        responses = merge.load(args.sgp_export)['responses']
        timeline = responses.get('details', {}).get('json', {})
        if timeline.get('frames'): custom[str(timeline['gameId'])] = timeline
    result = {}
    for directory in [root, root / 'friends', root / 'flex']:
        data = merge.load(directory / 'data.json'); enriched = 0
        for match in data['matches']:
            path = cache / (match['matchKey'].replace(':', '_') + '.json')
            if path.exists():
                # No names or identifiers from the raw cache enter the public projection.
                enriched += review_timeline.attach(match, merge.load(path), teams.get(match['matchKey']))
            elif directory == root and str(match['id']) in custom:
                enriched += review_timeline.attach(match, custom[str(match['id'])])
        merge.save(directory / 'data.json', data)
        result[directory.name] = {'matches': len(data['matches']), 'enriched': enriched}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
