import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { createApp } from '../src/app.js';

test('season rollover archives stats and preserves IDs, availability and match history',()=>{
 let now=1000;const s=openStore(':memory:',()=>now);
 try{
  const a=s.register('Alpha'),b=s.register('Beta');s.join(a.id);s.join(b.id);const m=s.make()[0];s.result(m.id,a.id);s.setActive(b.id,false);
  const first=s.currentSeason();assert.equal(m.season_id,first.id);
  now=2000;const rollover=s.startSeason('Season 2',first.id);
  assert.equal(rollover.previous.status,'closed');assert.equal(rollover.previous.ended,2000);
  assert.equal(rollover.current.id,2);assert.equal(s.player(a.id).rating,1000);assert.equal(s.player(a.id).wins,0);
  assert.equal(s.player(b.id).active,0);assert.equal(s.history(a.id)[0].winner,a.id);
  assert.throws(()=>s.startSeason('Duplicate attempt',first.id),error=>error.status===409);
  s.setActive(b.id,true);s.join(a.id);s.join(b.id);assert.equal(s.make()[0].season_id,2);
 }finally{s.close();}
});

test('rollover refuses unresolved matches, queued players and duplicate names without resets',()=>{
 const s=openStore();try{
  const a=s.register('A'),b=s.register('B'),id=s.currentSeason().id;
  s.join(a.id);assert.throws(()=>s.startSeason('New',id),/queue/);s.join(b.id);const m=s.make()[0];
  assert.throws(()=>s.startSeason('New',id),/pending/);assert.equal(s.currentSeason().id,id);
  s.result(m.id,a.id);const before=s.player(a.id);
  assert.throws(()=>s.startSeason('season 1',id),/already exists/);assert.deepEqual(s.player(a.id),before);
  for(const invalid of ['', ' '.repeat(3),'x'.repeat(49)])assert.throws(()=>s.startSeason(invalid,id));
  assert.throws(()=>s.startSeason('New',true));assert.equal(s.seasons().length,1);
 }finally{s.close();}
});

test('legacy migrations retain pending and completed matches and archive survives restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'league-seasons-')),path=join(dir,'app.sqlite');
 try{
  const db=new DatabaseSync(path);db.exec(`
   CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1);
   CREATE TABLE queue(player INTEGER PRIMARY KEY REFERENCES players(id),joined INTEGER NOT NULL);
   CREATE TABLE matches(id INTEGER PRIMARY KEY,a INTEGER NOT NULL REFERENCES players(id),b INTEGER NOT NULL REFERENCES players(id),status TEXT NOT NULL DEFAULT 'pending',winner INTEGER REFERENCES players(id),delta INTEGER,rating_a INTEGER NOT NULL,rating_b INTEGER NOT NULL,created INTEGER NOT NULL,finished INTEGER);
   INSERT INTO players VALUES(1,'A',1016,1,0,0,1),(2,'B',984,0,1,0,1);
   INSERT INTO matches VALUES(1,1,2,'completed',1,16,1000,1000,100,200),(2,1,2,'pending',NULL,NULL,1016,984,300,NULL);
  `);db.close();
  let s=openStore(path,()=>1000);assert.equal(s.currentSeason().legacy,1);assert.equal(s.currentSeason().started,null);
  assert.equal(s.player(1).rating,1016);assert.equal(s.match(1).season_id,1);assert.equal(s.match(2).status,'pending');
  s.cancel(2);s.startSeason('Second',1);s.close();
  s=openStore(path);assert.equal(s.currentSeason().id,2);assert.equal(s.seasons()[1].completed_matches,1);assert.equal(s.history(1).length,2);s.close();
  const check=new DatabaseSync(path);assert.equal(check.prepare('SELECT rating FROM season_standings WHERE season=1 AND player=1').get().rating,1016);check.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('failed reset rolls back snapshots and closing the old season',()=>{
 const dir=mkdtempSync(join(tmpdir(),'season-rollback-')),path=join(dir,'app.sqlite'),s=openStore(path);
 try{
  s.register('A');const db=new DatabaseSync(path);db.exec("CREATE TRIGGER deny_reset BEFORE UPDATE OF rating ON players BEGIN SELECT RAISE(ABORT,'reset unavailable'); END;");db.close();
  assert.throws(()=>s.startSeason('Second',1),/reset unavailable/);assert.equal(s.currentSeason().id,1);assert.equal(s.seasons().length,1);
  const check=new DatabaseSync(path);assert.equal(check.prepare('SELECT COUNT(*) AS n FROM season_standings').get().n,0);check.close();
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('future schema versions are refused without deleting data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'season-future-')),path=join(dir,'app.sqlite');
 try{const db=new DatabaseSync(path);db.exec("CREATE TABLE sentinel(value); INSERT INTO sentinel VALUES('keep'); PRAGMA user_version=2;");db.close();assert.throws(()=>openStore(path),/newer/);const check=new DatabaseSync(path);assert.equal(check.prepare('SELECT value FROM sentinel').get().value,'keep');check.close();}
 finally{rmSync(dir,{recursive:true,force:true});}
});

test('season API enforces auth and guards duplicate rollover requests',async()=>{
 const s=openStore(),token='season-api-test-only-token-'.repeat(2),app=createApp(s,token);await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${app.address().port}/api/seasons`;
 try{
  assert.equal((await fetch(url)).status,401);const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const state=await(await fetch(url,{headers})).json();assert.equal(state.current.id,1);
  const body=JSON.stringify({name:'Second',expectedSeasonId:1});assert.equal((await fetch(url,{method:'POST',headers,body})).status,200);
  assert.equal((await fetch(url,{method:'POST',headers,body})).status,409);
 }finally{await new Promise(resolve=>app.close(resolve));s.close();}
});
