import { HttpError, positiveId, text } from './http.js';

export function createSeasons(db, clock, transaction) {
  const currentSeason = () => db.prepare("SELECT * FROM seasons WHERE status='open'").get();
  const season = id => {
    const result = id === undefined || id === null ? currentSeason() : db.prepare('SELECT * FROM seasons WHERE id=?').get(positiveId(id));
    if (!result) throw new HttpError(404, 'Season not found.');
    return result;
  };
  return {
    currentSeason, season,
    seasons: () => db.prepare(`SELECT s.*,
      (SELECT COUNT(*) FROM matches m WHERE m.season_id=s.id AND m.status='completed') AS completed_matches
      FROM seasons s ORDER BY s.id DESC`).all(),
    startSeason(name, expectedSeasonId) {
      name = text(name, 48); expectedSeasonId = positiveId(expectedSeasonId);
      return transaction(() => {
        const previous = currentSeason();
        if (previous.id !== expectedSeasonId) throw new HttpError(409, 'The active season changed. Refresh before starting another season.');
        if (db.prepare("SELECT 1 FROM matches WHERE status='pending'").get())
          throw new HttpError(409, 'Finish or cancel all pending matches before closing the season.');
        if (db.prepare('SELECT 1 FROM queue').get())
          throw new HttpError(409, 'Clear the player queue before closing the season.');
        if (db.prepare('SELECT 1 FROM seasons WHERE name=? COLLATE NOCASE').get(name))
          throw new HttpError(409, 'That season name already exists.');
        db.prepare(`INSERT INTO season_standings(season,player,name,rating,wins,losses,draws,active)
          SELECT ?,id,name,rating,wins,losses,draws,active FROM players`).run(previous.id);
        const now = clock();
        db.prepare("UPDATE seasons SET status='closed',ended=? WHERE id=?").run(now, previous.id);
        const nextId = Number(db.prepare("INSERT INTO seasons(name,status,started) VALUES(?,'open',?)").run(name, now).lastInsertRowid);
        db.exec('UPDATE players SET rating=1000,wins=0,losses=0,draws=0');
        return { previous: season(previous.id), current: season(nextId) };
      });
    },
  };
}
