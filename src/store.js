import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HttpError, text, positiveId } from './http.js';
export function ratingChange(a,b,score){
  return Math.round(32*(score-1/(1+10**((b-a)/400))));
}
export function openStore(path=':memory:',clock=()=>Date.now()){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS players(id INTEGER PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,
      rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS queue(player INTEGER PRIMARY KEY REFERENCES players(id),joined INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS matches(id INTEGER PRIMARY KEY,a INTEGER NOT NULL REFERENCES players(id),b INTEGER NOT NULL REFERENCES players(id),
      status TEXT NOT NULL DEFAULT 'pending',winner INTEGER REFERENCES players(id),delta INTEGER,
      rating_a INTEGER NOT NULL,rating_b INTEGER NOT NULL,created INTEGER NOT NULL,finished INTEGER);`);
  if(!db.prepare('PRAGMA table_info(players)').all().some(column=>column.name==='active'))
    db.exec('ALTER TABLE players ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
  const player=id=>{const p=db.prepare('SELECT * FROM players WHERE id=?').get(positiveId(id));if(!p)throw new HttpError(404,'Player not found.');return p;};
  const match=id=>{const m=db.prepare('SELECT * FROM matches WHERE id=?').get(positiveId(id));if(!m)throw new HttpError(404,'Match not found.');return m;};
  const active=id=>db.prepare("SELECT 1 FROM matches WHERE status='pending' AND (a=? OR b=?)").get(id,id);
  return {
    close:()=>db.close(),player,match,
    register(name){
      name=text(name,32);
      if(db.prepare('SELECT 1 FROM players WHERE name=? COLLATE NOCASE').get(name))throw new HttpError(409,'That player name is already registered.');
      return player(Number(db.prepare('INSERT INTO players(name) VALUES(?)').run(name).lastInsertRowid));
    },
    setActive(id,enabled){return transaction(()=>{
      if(typeof enabled!=='boolean')throw new HttpError(400,'Active must be true or false.');
      const p=player(id);
      if(!enabled&&active(p.id))throw new HttpError(409,'Finish or cancel the active match before deactivating this player.');
      if(!enabled)db.prepare('DELETE FROM queue WHERE player=?').run(p.id);
      db.prepare('UPDATE players SET active=? WHERE id=?').run(enabled?1:0,p.id);
      return player(p.id);
    });},
    inactive:()=>db.prepare('SELECT * FROM players WHERE active=0 ORDER BY id DESC LIMIT 100').all(),
    join(id){return transaction(()=>{const p=player(id);if(!p.active)throw new HttpError(409,'This player is inactive. Restore them before joining the queue.');if(active(p.id))throw new HttpError(409,'Finish or cancel the active match first.');if(db.prepare('SELECT 1 FROM queue WHERE player=?').get(p.id))throw new HttpError(409,'Player is already queued.');db.prepare('INSERT INTO queue VALUES(?,?)').run(p.id,clock());return p;});},
    leave(id){player(id);db.prepare('DELETE FROM queue WHERE player=?').run(Number(id));return {left:true};},
    queue:()=>db.prepare('SELECT p.*,q.joined FROM queue q JOIN players p ON p.id=q.player ORDER BY q.joined,p.id').all(),
    make(){return transaction(()=>{
      const queue=this.queue();const matches=[];const used=new Set();const now=clock();
      for(const a of queue){
        if(used.has(a.id))continue;
        // Older entries widen their rating window; closest compatible opponent wins.
        const tolerance=Math.min(600,100+Math.floor(Math.max(0,now-a.joined)/30000)*50);
        const candidates=queue.filter(b=>b.id!==a.id&&!used.has(b.id)&&Math.abs(a.rating-b.rating)<=tolerance)
          .sort((x,y)=>Math.abs(a.rating-x.rating)-Math.abs(a.rating-y.rating)||x.joined-y.joined||x.id-y.id);
        const b=candidates[0];if(!b)continue;
        const id=Number(db.prepare('INSERT INTO matches(a,b,rating_a,rating_b,created) VALUES(?,?,?,?,?)').run(a.id,b.id,a.rating,b.rating,now).lastInsertRowid);
        db.prepare('DELETE FROM queue WHERE player IN (?,?)').run(a.id,b.id);
        used.add(a.id);used.add(b.id);matches.push(match(id));
      }
      return matches;
    });},
    result(id,winner){return transaction(()=>{
      const m=match(id);if(m.status!=='pending')throw new HttpError(409,'Match has already been resolved.');
      if(winner!==null)winner=positiveId(winner);
      if(winner!==null&&winner!==m.a&&winner!==m.b)throw new HttpError(400,'Winner must be a participant, or null for a draw.');
      const a=player(m.a),b=player(m.b),score=winner===null?0.5:winner===m.a?1:0;
      const delta=Math.max(-a.rating,Math.min(b.rating,ratingChange(a.rating,b.rating,score)));
      const update=db.prepare('UPDATE players SET rating=rating+?,wins=wins+?,losses=losses+?,draws=draws+? WHERE id=?');
      update.run(delta,score===1?1:0,score===0?1:0,score===0.5?1:0,a.id);
      update.run(-delta,score===0?1:0,score===1?1:0,score===0.5?1:0,b.id);
      db.prepare("UPDATE matches SET status='completed',winner=?,delta=?,finished=? WHERE id=?").run(winner,delta,clock(),m.id);
      return match(m.id);
    });},
    cancel(id){return transaction(()=>{const m=match(id);if(m.status!=='pending')throw new HttpError(409,'Only pending matches can be cancelled.');db.prepare("UPDATE matches SET status='cancelled',finished=? WHERE id=?").run(clock(),m.id);return match(m.id);});},
    rankings:()=>db.prepare('SELECT *,wins+losses+draws AS played FROM players WHERE active=1 ORDER BY rating DESC,wins DESC,id LIMIT 100').all(),
    history(id){player(id);return db.prepare('SELECT * FROM matches WHERE a=? OR b=? ORDER BY id DESC LIMIT 50').all(Number(id),Number(id));},
    recent:()=>db.prepare('SELECT * FROM matches ORDER BY id DESC LIMIT 100').all(),
  };
}
