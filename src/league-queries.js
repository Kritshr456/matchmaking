import { HttpError, positiveId, text } from './http.js';

const pageNumber = page => {
  if (!Number.isInteger(page) || page < 1 || page > 100000) throw new HttpError(400, 'Page must be between 1 and 100000.');
  return page;
};
export function createLeagueQueries(db, clock, { player, season, currentSeason }) {
  function standings({ seasonId = null, q = '', includeInactive = false, page = 1 } = {}) {
    pageNumber(page);
    if (typeof q !== 'string' || typeof includeInactive !== 'boolean') throw new HttpError(400, 'Invalid standings filters.');
    q = q.trim() ? text(q, 32) : '';
    const selected = season(seasonId), args = [];
    const source = selected.status === 'open' ? 'SELECT id,name,rating,wins,losses,draws,active FROM players' :
      'SELECT player AS id,name,rating,wins,losses,draws,active FROM season_standings WHERE season=?';
    if (selected.status === 'closed') args.push(selected.id);
    const base = `WITH roster AS (${source}), ranked AS (
      SELECT *,wins+losses+draws AS played,ROW_NUMBER() OVER(ORDER BY rating DESC,wins DESC,id) AS rank
      FROM roster ${includeInactive ? '' : 'WHERE active=1'})`;
    const pattern = `%${q.replace(/[\\%_]/g, value => `\\${value}`)}%`;
    args.push(pattern);
    const where = "WHERE name LIKE ? ESCAPE '\\'";
    const total = db.prepare(`${base} SELECT COUNT(*) AS total FROM ranked ${where}`).get(...args).total;
    const rows = db.prepare(`${base} SELECT * FROM ranked ${where} ORDER BY rank LIMIT 20 OFFSET ?`).all(...args, (page - 1) * 20);
    return { season: selected, q, includeInactive, page, limit: 20, total, rows };
  }
  function matchHistory({ seasonId = null, status = 'all', playerId = null, page = 1 } = {}) {
    pageNumber(page);
    if (!['all', 'pending', 'completed', 'cancelled'].includes(status)) throw new HttpError(400, 'Invalid match status.');
    const clauses = [], args = [];
    if (seasonId !== null) { const s = season(seasonId); clauses.push('m.season_id=?'); args.push(s.id); }
    if (status !== 'all') { clauses.push('m.status=?'); args.push(status); }
    if (playerId !== null) { const p = player(playerId); clauses.push('(m.a=? OR m.b=?)'); args.push(p.id, p.id); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) AS total FROM matches m ${where}`).get(...args).total;
    const rows = db.prepare(`SELECT m.*,pa.name AS a_name,pb.name AS b_name,s.name AS season_name,
      CASE WHEN m.winner=m.a THEN pa.name WHEN m.winner=m.b THEN pb.name END AS winner_name
      FROM matches m JOIN players pa ON pa.id=m.a JOIN players pb ON pb.id=m.b
      JOIN seasons s ON s.id=m.season_id ${where} ORDER BY m.id DESC LIMIT 20 OFFSET ?`).all(...args, (page - 1) * 20);
    return { seasonId, status, playerId, page, limit: 20, total, rows };
  }
  function overview() {
    const active = currentSeason(), now = clock();
    const players = db.prepare('SELECT COUNT(*) AS registered,COALESCE(SUM(active=1),0) AS active,COALESCE(SUM(active=0),0) AS inactive FROM players').get();
    const queue = db.prepare('SELECT COUNT(*) AS queued,MIN(joined) AS oldest,AVG(joined) AS average FROM queue').get();
    const states = Object.fromEntries(db.prepare('SELECT status,COUNT(*) AS n FROM matches WHERE season_id=? GROUP BY status').all(active.id).map(r => [r.status, r.n]));
    const start = Math.floor(now / 86400000) * 86400000 - 6 * 86400000;
    const results = db.prepare(`SELECT strftime('%Y-%m-%d',finished/1000,'unixepoch') AS day,COUNT(*) AS n FROM matches
      WHERE season_id=? AND status='completed' AND finished>=? GROUP BY day`).all(active.id, start);
    const activity = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start + i * 86400000).toISOString().slice(0, 10);
      return { day, completed: results.find(r => r.day === day)?.n || 0 };
    });
    return { season: active, generatedAt: now,
      counts: { ...players, queued: queue.queued, pending: states.pending || 0, completed: states.completed || 0, cancelled: states.cancelled || 0 },
      queueWait: { longestMs: queue.oldest === null ? 0 : Math.max(0, now - queue.oldest), averageMs: queue.average === null ? 0 : Math.max(0, Math.round(now - queue.average)) },
      topPlayers: standings().rows.slice(0, 5), recentMatches: matchHistory({ seasonId: active.id }).rows.slice(0, 5), activity };
  }
  function profile(id, page = 1) {
    const p = player(id), active = currentSeason(); pageNumber(page);
    const past = db.prepare(`SELECT s.id AS season_id,s.name AS season_name,s.status,ss.rating,ss.wins,ss.losses,ss.draws,ss.active
      FROM season_standings ss JOIN seasons s ON s.id=ss.season WHERE ss.player=? ORDER BY s.id DESC`).all(p.id);
    const seasons = [{ season_id: active.id, season_name: active.name, status: active.status, rating: p.rating,
      wins: p.wins, losses: p.losses, draws: p.draws, active: p.active }, ...past];
    const lifetime = seasons.reduce((total, s) => ({ wins: total.wins + s.wins, losses: total.losses + s.losses, draws: total.draws + s.draws }), { wins: 0, losses: 0, draws: 0 });
    lifetime.played = lifetime.wins + lifetime.losses + lifetime.draws;
    const ratingTrail = db.prepare(`SELECT id,finished,
      CASE WHEN a=? THEN rating_a ELSE rating_b END AS before_rating,
      CASE WHEN a=? THEN rating_a+delta ELSE rating_b-delta END AS rating
      FROM matches WHERE season_id=? AND status='completed' AND (a=? OR b=?) ORDER BY id DESC LIMIT 30`)
      .all(p.id, p.id, active.id, p.id, p.id).reverse();
    return { player: p, currentSeason: active, lifetime, seasons, ratingTrail, history: matchHistory({ playerId: p.id, page }) };
  }
  return { standings, matchHistory, overview, profile };
}
