export function migrate(db, clock) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) throw Error('Database schema is newer than this version of matchmaking.');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,
        rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,
        draws INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS queue(player INTEGER PRIMARY KEY REFERENCES players(id),joined INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS matches(id INTEGER PRIMARY KEY,a INTEGER NOT NULL REFERENCES players(id),
        b INTEGER NOT NULL REFERENCES players(id),status TEXT NOT NULL DEFAULT 'pending',winner INTEGER REFERENCES players(id),
        delta INTEGER,rating_a INTEGER NOT NULL,rating_b INTEGER NOT NULL,created INTEGER NOT NULL,finished INTEGER);
      CREATE TABLE IF NOT EXISTS seasons(id INTEGER PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('open','closed')),started INTEGER,ended INTEGER,legacy INTEGER NOT NULL DEFAULT 0);
      CREATE UNIQUE INDEX IF NOT EXISTS one_open_season ON seasons(status) WHERE status='open';
      CREATE TABLE IF NOT EXISTS season_standings(season INTEGER NOT NULL REFERENCES seasons(id),
        player INTEGER NOT NULL REFERENCES players(id),name TEXT NOT NULL,rating INTEGER NOT NULL,
        wins INTEGER NOT NULL,losses INTEGER NOT NULL,draws INTEGER NOT NULL,active INTEGER NOT NULL,
        PRIMARY KEY(season,player));
    `);
    if (!db.prepare('PRAGMA table_info(players)').all().some(column => column.name === 'active'))
      db.exec('ALTER TABLE players ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
    if (!db.prepare('PRAGMA table_info(matches)').all().some(column => column.name === 'season_id'))
      db.exec('ALTER TABLE matches ADD COLUMN season_id INTEGER REFERENCES seasons(id)');
    if (!db.prepare('SELECT 1 FROM seasons').get()) {
      const legacy = db.prepare('SELECT EXISTS(SELECT 1 FROM players) OR EXISTS(SELECT 1 FROM matches) AS imported').get().imported;
      db.prepare("INSERT INTO seasons(name,status,started,legacy) VALUES('Season 1','open',?,?)").run(legacy ? null : clock(), legacy);
    }
    if (version === 0) {
      const season = db.prepare("SELECT id FROM seasons WHERE status='open'").get();
      db.prepare('UPDATE matches SET season_id=? WHERE season_id IS NULL').run(season.id);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS season_matches ON matches(season_id,status,created,id);
      CREATE INDEX IF NOT EXISTS player_a_matches ON matches(a,id);
      CREATE INDEX IF NOT EXISTS player_b_matches ON matches(b,id);
      PRAGMA user_version=1; COMMIT;`);
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
