import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HttpError, text, positiveId } from './http.js';
import { selectPairs } from './pairing.js';
import { migrate } from './migrations.js';
import { createSeasons } from './seasons.js';
export function ratingChange(a,b,score){
  return Math.round(32*(score-1/(1+10**((b-a)/400))));
}
export function openStore(path=':memory:',clock=()=>Date.now()){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  try { db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;'); migrate(db,clock); }
  catch(error){db.close();throw error;}
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}};
  const player=id=>{const p=db.prepare('SELECT * FROM players WHERE id=?').get(positiveId(id));if(!p)throw new HttpError(404,'Player not found.');return p;};
  const match=id=>{const m=db.prepare('SELECT * FROM matches WHERE id=?').get(positiveId(id));if(!m)throw new HttpError(404,'Match not found.');return m;};
  const seasons=createSeasons(db,clock,transaction);
  const active=id=>db.prepare("SELECT 1 FROM matches WHERE status='pending' AND (a=? OR b=?)").get(id,id);
  return {
    close:()=>db.close(),player,match,...seasons,
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
    preview(){
      const now=clock();
      return {generatedAt:now,pairs:selectPairs(this.queue(),now).map(({a,b})=>({a:a.id,b:b.id,rating_a:a.rating,rating_b:b.rating,
        rating_gap:Math.abs(a.rating-b.rating),waiting_a_ms:Math.max(0,now-a.joined),waiting_b_ms:Math.max(0,now-b.joined)}))};
    },
    make(){return transaction(()=>{
      const now=clock(),matches=[];
      for(const {a,b} of selectPairs(this.queue(),now)){
        const id=Number(db.prepare('INSERT INTO matches(a,b,rating_a,rating_b,created,season_id) VALUES(?,?,?,?,?,?)').run(a.id,b.id,a.rating,b.rating,now,seasons.currentSeason().id).lastInsertRowid);
        db.prepare('DELETE FROM queue WHERE player IN (?,?)').run(a.id,b.id);
        matches.push(match(id));
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
