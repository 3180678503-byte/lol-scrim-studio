export const SOURCE_URL = 'https://lolesports.com/en-US/leagues/worlds';

// Read the official page's serialized Apollo data. Never evaluate page scripts.
export function parseOfficialPage(html) {
  const events = new Map();
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const script = match[1];
    if (!script.includes('ApolloSSRDataTransport')) continue;
    // Apollo includes megabytes of unrelated cached fields. Extract only complete
    // EventMatch objects to stay within a scheduled Worker's CPU budget.
    const starts = [...script.matchAll(/\{\s*"__typename"\s*:\s*"EventMatch"\s*,/g)];
    if(starts.length>1000)throw new Error('官方比赛数量异常');
    const tokens = /"(?:\\.|[^"\\])*"|[{}]/g;
    const json = text => JSON.parse(text.includes('undefined') ? text.replace(/"(?:\\.|[^"\\])*"|\bundefined\b/g, token => token === 'undefined' ? 'null' : token) : text);
    for(let i=0;i<starts.length;i++) {
      const start = starts[i].index;
      // Match.strategy precedes the large games/VOD payload. Parse the complete
      // JSON prefix through strategy, closing only its match and event objects.
      // If upstream changes field order, use the full balanced-object reader.
      const prefix=script.slice(start,Math.min(starts[i+1]?.index||script.length,start+20000));
      // The page serializes the same normalized event again with reordered keys.
      // Retain the first complete official record and skip that duplicate cache.
      const headerId=prefix.slice(0,220).match(/"id"\s*:\s*"(\d+)"/)?.[1];
      if(headerId&&events.has(headerId))continue;
      const games=prefix.search(/,\s*"games"\s*:/);
      if(games>=0){
        try{const event=json(prefix.slice(0,games)+'}}');if(event.match?.strategy){events.set(event.id,event);continue;}}catch{}
      }
      tokens.lastIndex = start;
      let depth = 0, end = -1, token;
      while ((token = tokens.exec(script))) {
        if (token[0] === '{') depth++;
        else if (token[0] === '}' && --depth === 0) { end = tokens.lastIndex; break; }
      }
      if (end < 0) throw new Error('官方页面数据不完整');
      const event = json(script.slice(start, end));
      events.set(event.id,event);
    }
  }
  const worlds = [...events.values()].filter(e => e.league?.slug === 'worlds' && /^\d{4}$/.test(e.tournament?.name));
  if (!worlds.length) throw new Error('官方页面未找到 Worlds 赛程，保留上次数据');
  const year = Math.max(...worlds.map(e => Number(e.tournament.name)));
  return worlds.filter(e => Number(e.tournament.name) === year).map(normalizeEvent).sort((a, b) => a.startAt - b.startAt || a.id.localeCompare(b.id));
}

function normalizeEvent(e) {
  const startAt = Date.parse(e.startTime), bestOf = e.match?.strategy?.count;
  if (!/^\d{10,30}$/.test(e.id) || !Number.isFinite(startAt) || ![1, 3, 5].includes(bestOf) || e.matchTeams?.length !== 2) throw new Error('官方比赛结构发生变化');
  const teams = e.matchTeams.map(t => ({
    id: String(t.teamId || ''), code: String(t.code || 'TBD'), name: String(t.name || '待定'),
    image: /^https?:\/\/static\.lolesports\.com\//.test(t.image || '') ? t.image.replace(/^http:/, 'https:') : '',
    wins: Number.isInteger(t.result?.gameWins) ? t.result.gameWins : 0,
    outcome: t.result?.outcome || null
  }));
  const rawStates = [e.state, e.match?.state];
  const state = rawStates.some(s => ['canceled', 'cancelled', 'aborted'].includes(s)) ? 'void'
    : rawStates.includes('completed') ? 'completed'
    : rawStates.every(s => s === 'unstarted') ? 'unstarted' : 'inProgress';
  const ready = teams.every(t => /^\d+$/.test(t.id) && !/^(TBD|TBC|待定)$/i.test(t.code)) && teams[0].id !== teams[1].id;
  const needed = Math.floor(bestOf / 2) + 1;
  const winner = teams.find(t => t.outcome === 'win'), loser = teams.find(t => t !== winner);
  const settled = state === 'completed' && ready && winner?.wins === needed && loser?.wins >= 0 && loser.wins < needed && loser.outcome === 'loss';
  return { id: e.id, tournament: e.tournament.id, season: e.tournament.name, stage: String(e.blockName || 'Worlds'), startAt, bestOf, state, teams, ready,
    signature: [...teams.map(t => t.id)].sort().join(':') + ':' + bestOf,
    winnerId: settled ? winner.id : null, loserWins: settled ? loser.wins : null };
}

export async function fetchOfficial(fetcher = fetch) {
  const response = await fetcher(SOURCE_URL, {headers: {'Accept': 'text/html'}, signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error('官方赛程读取失败 HTTP ' + response.status);
  const text = await response.text();
  if (text.length > 10000000) throw new Error('官方页面超出大小限制');
  return parseOfficialPage(text);
}
