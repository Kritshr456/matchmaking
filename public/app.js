import { $, node, action, badge, table, date, signed, duration, metrics, activityChart, ratingChart } from './views.js';

const state = {
  secret: '', connected: false, busy: false, view: 'overview', overview: null, seasons: [], queue: [], ready: [],
  standings: null, history: null, selectedMatch: null, profile: null,
  players: { season: 'current', q: '', inactive: false, page: 1 },
  matches: { season: 'current', status: 'all', player: '', page: 1 },
};
const titles = { overview: 'Overview', players: 'Players', queue: 'Queue', matches: 'Matches', seasons: 'Seasons' };
const params = values => new URLSearchParams(Object.entries(values).filter(([, value]) => value !== '')).toString();
function notice(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
async function api(path, body) {
  if (!state.secret) throw Error('Connect with your operator token first.');
  const response = await fetch(`/api/${path}`, {
    headers: { Authorization: `Bearer ${state.secret}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state.connected) disconnect();
    throw Error(data.error || 'Request failed.');
  }
  return data;
}
function go(view) {
  if (!titles[view] || !state.connected) return;
  state.view = view; $('view-title').textContent = titles[view];
  for (const [name] of Object.entries(titles)) $(`view-${name}`).hidden = name !== view;
  for (const b of document.querySelectorAll('[data-view]')) b.classList.toggle('active', b.dataset.view === view);
  updateControls();
}
function updateControls() {
  for (const b of document.querySelectorAll('button')) b.disabled = state.busy;
  for (const b of document.querySelectorAll('[data-view],[data-connected]')) b.disabled = state.busy || !state.connected;
  const archived = state.standings?.season.status === 'closed';
  for (const form of [$('register'), $('player-status')]) for (const e of form.elements) e.disabled = state.busy || archived;
  const pending = state.selectedMatch?.status === 'pending';
  for (const e of $('result').elements) e.disabled = state.busy || !pending;
  for (const [prefix, result] of [['players', state.standings], ['matches', state.history]]) {
    $(`${prefix}-prev`).disabled = state.busy || !result || result.page <= 1;
    $(`${prefix}-next`).disabled = state.busy || !result || result.page * result.limit >= result.total;
  }
  const counts = state.overview?.counts;
  for (const e of $('new-season').elements) e.disabled = state.busy || !counts || counts.pending > 0 || counts.queued > 0;
  if (state.profile) {
    const p = state.profile.history;
    const previous = document.querySelector('[data-profile-page=previous]'), next = document.querySelector('[data-profile-page=next]');
    if (previous) previous.disabled = state.busy || p.page <= 1;
    if (next) next.disabled = state.busy || p.page * p.limit >= p.total;
  }
}
async function run(fn) {
  if (state.busy) return;
  state.busy = true; updateControls(); notice('Working…');
  try { const message = await fn(); notice(message || 'Saved / refreshed.'); }
  catch (error) { notice(error.message, true); }
  finally { state.busy = false; updateControls(); }
}
function disconnect() {
  state.secret = ''; state.connected = false; state.overview = null; state.seasons = []; state.queue = []; state.ready = [];
  state.standings = null; state.history = null; state.profile = null; state.selectedMatch = null;
  state.players = { season: 'current', q: '', inactive: false, page: 1 };
  state.matches = { season: 'current', status: 'all', player: '', page: 1 };
  for (const id of ['metrics', 'top-players', 'recent-matches', 'players', 'queue', 'preview', 'matches', 'seasons-list', 'profile-content', 'match-content', 'overview-title', 'overview-subtitle', 'profile-title', 'match-title', 'queue-health', 'activity-chart', 'roster-count', 'match-total', 'rollover-help', 'players-page', 'matches-page', 'season-pill', 'player-season', 'match-season', 'result-match', 'result-winner', 'result-participants']) $(id).replaceChildren();
  for (const form of $('workspace').querySelectorAll('form')) form.reset();
  $('profile-dialog').close(); $('match-dialog').close(); $('token').value = '';
  $('workspace').hidden = true; $('connection-panel').hidden = false; $('disconnect').hidden = true; $('season-pill').hidden = true;
  $('queue-count').textContent = '0'; $('connection-state').textContent = 'Disconnected'; $('connection-dot').classList.remove('online');
  notice('Disconnected. Your token and loaded league data were cleared.'); updateControls();
}
async function reload() {
  const [consoleData, standings, history] = await Promise.all([
    api('console'), api('standings?' + params(state.players)), api('matches/history?' + params(state.matches)),
  ]);
  state.overview = consoleData.overview; state.seasons = consoleData.seasons; state.queue = consoleData.queue; state.ready = consoleData.pendingMatches;
  state.standings = standings; state.history = history;
  if (state.players.season === 'current' && standings.season.id !== state.overview.season.id)
    state.standings = await api('standings?' + params(state.players));
  if (state.matches.season === 'current' && history.seasonId !== state.overview.season.id)
    state.history = await api('matches/history?' + params(state.matches));
  if (state.selectedMatch && !state.ready.some(m => m.id === state.selectedMatch.id)) {
    const current = await api(`matches/${state.selectedMatch.id}`);
    state.selectedMatch = current.status === 'pending' && current.season_id === state.overview.season.id ? current : null;
  } else if (state.selectedMatch) state.selectedMatch = state.ready.find(m => m.id === state.selectedMatch.id);
  if (state.profile) state.profile = await api(`profiles/${state.profile.player.id}?page=${state.profile.history.page}`);
  render();
}
function playerName(id) {
  return state.queue.find(p => p.id === id)?.name || state.standings?.rows.find(p => p.id === id)?.name || `#${id}`;
}
function profileLink(p) {
  const b = action(p.name, () => run(() => openProfile(p.id))); b.setAttribute('aria-label', `View ${p.name}`); return b;
}
function matchRows(rows) {
  return rows.map(m => [m.id, `${m.a_name} (#${m.a})`, `${m.b_name} (#${m.b})`, badge(m.status),
    m.status === 'completed' ? m.winner_name || (m.winner ? playerName(m.winner) : 'Draw') : '—',
    m.delta === null ? '—' : `${signed(m.delta)} / ${signed(-m.delta)}`, m.season_name, date(m.created),
    m.status === 'pending' && m.season_id === state.overview.season.id ? action('Report', () => run(async () => {
      state.selectedMatch = m; state.matches = { season: 'current', status: 'pending', player: '', page: 1 }; await reload(); go('matches');
      $('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    })) : action('Details', () => run(() => openMatch(m.id))) ]);
}
const matchHeadings = ['Match', 'Side A', 'Side B', 'Status', 'Winner', 'Elo A / B', 'Season', 'Created', ''];
function seasonOptions(select, value, all = false) {
  const option = (id, text) => { const e = node('option', text); e.value = id; return e; };
  select.replaceChildren(option('current', `Current · ${state.overview.season.name}`),
    ...(all ? [option('all', 'All seasons')] : []),
    ...state.seasons.filter(s => s.status === 'closed').map(s => option(s.id, s.name)));
  select.value = value;
  if (!select.value) select.value = 'current';
}
function renderOverview() {
  const { season, counts, queueWait, activity, topPlayers, recentMatches } = state.overview;
  $('overview-title').textContent = season.name;
  $('overview-subtitle').textContent = season.started === null ? 'Imported league · original start date not recorded' : `Started ${date(season.started)}`;
  metrics($('metrics'), [['Active players', counts.active, `${counts.inactive} inactive`], ['In queue', counts.queued, 'Ready for pairing'],
    ['Pending matches', counts.pending, 'Awaiting a result'], ['Completed matches', counts.completed, 'This season']]);
  activityChart($('activity-chart'), activity);
  $('queue-health').replaceChildren(...[['Longest wait', duration(queueWait.longestMs)], ['Average wait', duration(queueWait.averageMs)], ['Cancelled matches', counts.cancelled]].map(([label, value]) => {
    const row = node('div', '', 'queue-stat'); row.append(node('span', label), node('strong', value)); return row;
  }));
  table($('top-players'), ['Rank', 'Player', 'Rating', 'W / L / D'], topPlayers.map(p => [p.rank, profileLink(p), p.rating, `${p.wins} / ${p.losses} / ${p.draws}`]), 'Register your first player to start the ladder.');
  table($('recent-matches'), matchHeadings, matchRows(recentMatches), 'No matches this season yet.');
}
function renderPlayers() {
  const result = state.standings;
  seasonOptions($('player-season'), state.players.season);
  $('player-search').value = state.players.q; $('include-inactive').checked = state.players.inactive;
  $('roster-count').textContent = `${result.total} players`;
  $('archive-notice').hidden = result.season.status !== 'closed';
  table($('players'), ['Rank', 'ID', 'Player', 'Rating', 'Wins', 'Losses', 'Draws', 'Played', 'Status', ''], result.rows.map(p => {
    const buttons = node('div', '', 'button-row');
    if (result.season.status === 'open') {
      if (p.active) buttons.append(action('Queue', () => run(async () => { await api('queue/join', { playerId: p.id }); await reload(); return `${p.name} joined the queue.`; })));
      buttons.append(action(p.active ? 'Deactivate' : 'Restore', () => run(() => setAvailability(p.id, !p.active))));
    }
    return [p.rank, p.id, profileLink(p), p.rating, p.wins, p.losses, p.draws, p.played, badge(p.active ? 'active' : 'inactive'), buttons];
  }), 'No players match these filters.');
  $('players-page').textContent = `Page ${result.page} of ${Math.max(1, Math.ceil(result.total / result.limit))} · ${result.season.name}`;
}
function renderQueue() {
  $('queue-count').textContent = String(state.overview.counts.queued); $('queue-total').textContent = `${state.queue.length} queued`;
  table($('queue'), ['ID', 'Player', 'Rating', 'Waiting', ''], state.queue.map(p => [p.id, profileLink(p), p.rating,
    duration(Math.max(0, state.overview.generatedAt - p.joined)), action('Remove', () => run(async () => { await api('queue/leave', { playerId: p.id }); await reload(); }))]), 'The queue is empty. Add players by ID or from the player directory.');
  $('preview').replaceChildren(node('p', 'Preview compatible players before creating matches.', 'empty'));
}
function renderResult() {
  if (!state.selectedMatch) state.selectedMatch = state.ready[0] || null;
  const ready = [...state.ready];
  if (state.selectedMatch && !ready.some(m => m.id === state.selectedMatch.id)) ready.push(state.selectedMatch);
  const select = $('result-match');
  select.replaceChildren(...(ready.length ? ready.map(m => { const e = node('option', `#${m.id} · ${m.a_name} vs ${m.b_name}`); e.value = String(m.id); return e; }) : [node('option', 'No pending matches')]));
  if (state.selectedMatch) select.value = String(state.selectedMatch.id);
  renderOutcome();
  $('result-section').hidden = state.matches.season !== 'current';
}
function renderOutcome() {
  const m = state.selectedMatch, winner = $('result-winner');
  const option = (value, label) => { const e = node('option', label); e.value = value; return e; };
  winner.replaceChildren(option('', 'Choose an outcome'), ...(m ? [option(m.a, `${m.a_name} wins`), option(m.b, `${m.b_name} wins`), option('draw', 'Draw')] : []));
  $('result-participants').textContent = m ? `${m.a_name} (#${m.a}) · ${m.rating_a} Elo  vs  ${m.b_name} (#${m.b}) · ${m.rating_b} Elo` : 'Create a match from the queue to report a result.';
}
function renderMatches() {
  seasonOptions($('match-season'), state.matches.season, true); $('match-status').value = state.matches.status; $('match-player').value = state.matches.player;
  const result = state.history; $('match-total').textContent = `${result.total} matches`;
  table($('matches'), matchHeadings, matchRows(result.rows), 'No matches match these filters.');
  $('matches-page').textContent = `Page ${result.page} of ${Math.max(1, Math.ceil(result.total / result.limit))}`;
  renderResult();
}
function renderSeasons() {
  table($('seasons-list'), ['Season', 'Status', 'Started', 'Ended', 'Completed', ''], state.seasons.map(s => [s.name,
    badge(s.status), date(s.started), date(s.ended), s.completed_matches, action('Standings', () => run(async () => {
      state.players = { season: s.status === 'open' ? 'current' : String(s.id), q: '', inactive: true, page: 1 }; await reload(); go('players');
    }))]));
  const counts = state.overview.counts;
  $('rollover-help').textContent = counts.pending || counts.queued ? `Resolve ${counts.pending} pending match(es) and clear ${counts.queued} queued player(s) before rollover.` : `${state.overview.season.name} is ready to archive. Its standings will be kept.`;
}
function render() {
  if (!state.overview) return;
  $('season-pill').textContent = state.overview.season.name;
  renderOverview(); renderPlayers(); renderQueue(); renderMatches(); renderSeasons();
  if (state.profile) renderProfile(); updateControls();
}
async function openProfile(id, page = 1) {
  state.profile = await api(`profiles/${id}?page=${page}`); renderProfile();
  if (!$('profile-dialog').open) $('profile-dialog').showModal();
}
function renderProfile() {
  const data = state.profile, p = data.player; $('profile-title').textContent = p.name;
  const container = $('profile-content'); container.replaceChildren();
  const meta = node('div', '', 'profile-meta'); meta.append(badge(p.active ? 'active' : 'inactive'), node('span', `Player #${p.id} · ${data.currentSeason.name}`, 'muted'));
  const summary = node('div', '', 'metrics profile-metrics'); metrics(summary, [['Current Elo', p.rating], ['Season played', p.wins + p.losses + p.draws], ['Lifetime played', data.lifetime.played]]);
  container.append(meta, summary, node('p', `Season: ${p.wins} W / ${p.losses} L / ${p.draws} D. Lifetime: ${data.lifetime.wins} W / ${data.lifetime.losses} L / ${data.lifetime.draws} D.`, 'muted'));
  const actions = node('div', '', 'button-row');
  if (p.active && !data.queueEntry && !data.pendingMatch) actions.append(action('Add to queue', () => run(async () => { await api('queue/join', { playerId: p.id }); await reload(); return `${p.name} joined the queue.`; }), 'secondary'));
  actions.append(action(p.active ? 'Deactivate player' : 'Restore player', () => run(() => setAvailability(p.id, !p.active)), 'secondary'));
  if (data.pendingMatch) actions.append(node('span', `Pending match #${data.pendingMatch}`, 'tag'));
  if (data.queueEntry) actions.append(node('span', 'In queue', 'tag'));
  container.append(actions, node('h3', 'Current-season rating history'));
  const chart = node('div', '', 'chart'); ratingChart(chart, data.ratingTrail); container.append(chart, node('h3', 'Season record'));
  const seasons = node('div', '', 'table-wrap'); table(seasons, ['Season', 'State', 'Rating', 'W', 'L', 'D'], data.seasons.map(s => [s.season_name, badge(s.status), s.rating, s.wins, s.losses, s.draws])); container.append(seasons);
  container.append(node('h3', 'Match history')); const history = node('div', '', 'table-wrap');
  table(history, ['Match', 'Opponent', 'Outcome', 'Elo change', 'Season'], data.history.rows.map(m => [m.id,
    m.a === p.id ? m.b_name : m.a_name, badge(m.status === 'completed' ? m.winner === null ? 'draw' : m.winner === p.id ? 'win' : 'loss' : m.status),
    m.delta === null ? '—' : signed(m.a === p.id ? m.delta : -m.delta), m.season_name])); container.append(history);
  const pages = node('div', '', 'pagination profile-history-nav');
  const previous = action('Previous profile matches', () => run(() => openProfile(p.id, data.history.page - 1)), 'secondary');
  const next = action('Next profile matches', () => run(() => openProfile(p.id, data.history.page + 1)), 'secondary');
  previous.dataset.profilePage = 'previous'; next.dataset.profilePage = 'next';
  pages.append(previous, node('span', `Page ${data.history.page} · ${data.history.total} matches`), next); container.append(pages);
}
async function openMatch(id) {
  const m = await api(`matches/${id}`); $('match-title').textContent = `Match #${m.id}`;
  const content = $('match-content'); content.replaceChildren(badge(m.status), node('h3', `${m.a_name} vs ${m.b_name}`), node('p', m.season_name, 'muted'));
  const grid = node('div', '', 'detail-grid');
  const outcome = m.status === 'completed' ? m.winner === null ? 'Draw' : `${m.winner === m.a ? m.a_name : m.b_name} won` : m.status;
  for (const [label, value] of [['Outcome', outcome], ['Created', date(m.created)], ['Finished', date(m.finished)],
    ['Rating before', `${m.rating_a} / ${m.rating_b}`], ['Elo change (A / B)', m.delta === null ? '—' : `${signed(m.delta)} / ${signed(-m.delta)}`],
    ['Rating after', m.delta === null ? '—' : `${m.rating_a + m.delta} / ${m.rating_b - m.delta}`]]) {
    const cell = node('div'); cell.append(node('small', label), node('strong', value)); grid.append(cell);
  }
  content.append(grid); if (!$('match-dialog').open) $('match-dialog').showModal();
}
async function setAvailability(id, active) {
  const p = await api(`players/${id}/status`, { active }); await reload();
  return `${p.name} is ${active ? 'active' : 'inactive'}. Ratings and history are preserved.`;
}
document.addEventListener('submit', e => { if (state.busy) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
$('connect-form').onsubmit = e => {
  e.preventDefault(); run(async () => {
    state.secret = $('token').value.trim();
    try { await reload(); } catch (error) { state.secret = ''; throw error; }
    state.connected = true; $('token').value = ''; $('workspace').hidden = false; $('connection-panel').hidden = true;
    $('disconnect').hidden = false; $('season-pill').hidden = false; $('connection-state').textContent = 'Connected'; $('connection-dot').classList.add('online'); go(state.view);
    return 'Connected to your league.';
  });
};
$('refresh').onclick = () => run(reload); $('disconnect').onclick = disconnect;
for (const b of document.querySelectorAll('[data-view]')) b.onclick = () => go(b.dataset.view);
for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => go(b.dataset.go);
document.querySelector('.brand').onclick = e => { e.preventDefault(); go('overview'); };
$('player-filters').onsubmit = e => { e.preventDefault(); state.players = { season: $('player-season').value, q: $('player-search').value, inactive: $('include-inactive').checked, page: 1 }; run(reload); };
$('clear-player-filters').onclick = () => { state.players = { season: 'current', q: '', inactive: false, page: 1 }; run(reload); };
$('match-filters').onsubmit = e => { e.preventDefault(); state.matches = { season: $('match-season').value, status: $('match-status').value, player: $('match-player').value, page: 1 }; run(reload); };
$('clear-match-filters').onclick = () => { state.matches = { season: 'current', status: 'all', player: '', page: 1 }; run(reload); };
for (const [prefix, filter] of [['players', 'players'], ['matches', 'matches']]) {
  $(`${prefix}-prev`).onclick = () => { state[filter].page--; run(reload); };
  $(`${prefix}-next`).onclick = () => { state[filter].page++; run(reload); };
}
$('register').onsubmit = e => {
  e.preventDefault(); const name = new FormData(e.target).get('name');
  run(async () => { const p = await api('players', { name }); state.players = { season: 'current', q: p.name, inactive: false, page: 1 }; await reload(); e.target.reset(); return `Registered ${p.name} as player #${p.id}.`; });
};
$('player-status').onsubmit = e => { e.preventDefault(); const form = new FormData(e.target), active = e.submitter.value === 'restore'; run(() => setAvailability(Number(form.get('playerId')), active)); };
$('profile-lookup').onsubmit = e => { e.preventDefault(); run(() => openProfile(Number(new FormData(e.target).get('playerId')))); };
$('queue-form').onsubmit = e => {
  e.preventDefault(); const form = new FormData(e.target), operation = e.submitter.value;
  run(async () => { await api(`queue/${operation}`, { playerId: Number(form.get('playerId')) }); await reload(); });
};
$('preview-matches').onclick = () => run(async () => {
  const preview = await api('matches/preview');
  table($('preview'), ['Side A', 'Rating', 'Side B', 'Rating', 'Gap'], preview.pairs.map(p => [playerName(p.a), p.rating_a, playerName(p.b), p.rating_b, p.rating_gap]), 'No compatible pairs yet. Players may need more time in the queue.');
  return `Preview: ${preview.pairs.length} compatible pair(s). No matches created.`;
});
$('make').onclick = () => run(async () => {
  const created = await api('matches/make', {});
  state.matches = { season: 'current', status: 'pending', player: '', page: 1 }; await reload(); if (created.length) go('matches');
  return `Created ${created.length} match(es).`;
});
$('result-match').onchange = () => {
  state.selectedMatch = [...state.ready, ...(state.selectedMatch ? [state.selectedMatch] : [])].find(m => String(m.id) === $('result-match').value) || null;
  renderOutcome(); updateControls();
};
$('result').onsubmit = e => {
  e.preventDefault(); const form = new FormData(e.target);
  run(async () => { await api(`matches/${Number(form.get('matchId'))}/result`, { winnerId: form.get('winnerId') === 'draw' ? null : Number(form.get('winnerId')) }); await reload(); return 'Result recorded. Ratings and standings updated.'; });
};
$('cancel-match').onclick = () => {
  if (!state.selectedMatch || !confirm('Cancel this match? Players will not be requeued automatically.')) return;
  const id = state.selectedMatch.id;
  run(async () => { await api(`matches/${id}/cancel`, {}); await reload(); return 'Match cancelled. Ratings were not changed.'; });
};
$('new-season').onsubmit = e => {
  e.preventDefault(); const name = new FormData(e.target).get('name'), expectedSeasonId = state.overview.season.id;
  if (!confirm(`Archive ${state.overview.season.name} and start ${name}? Ratings reset to 1000. Previous standings and history are preserved.`)) return;
  run(async () => { const result = await api('seasons', { name, expectedSeasonId }); state.players = { season: 'current', q: '', inactive: false, page: 1 }; state.matches = { season: 'current', status: 'all', player: '', page: 1 }; state.selectedMatch = null; await reload(); e.target.reset(); return `Started ${result.current.name}. Previous standings archived.`; });
};
$('profile-close').onclick = () => $('profile-dialog').close(); $('profile-dialog').onclose = () => { if (!$('profile-dialog').open) state.profile = null; };
$('match-close').onclick = () => $('match-dialog').close();
updateControls();
