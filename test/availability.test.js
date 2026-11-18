import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { createApp } from '../src/app.js';

test('deactivation removes queued entries and preserves completed history and ratings',()=>{
 const s=openStore();try{
  const a=s.register('Alpha'),b=s.register('Beta');s.join(a.id);s.join(b.id);s.result(s.make()[0].id,a.id);
  const before=s.player(a.id);s.join(a.id);s.setActive(a.id,false);
  assert.equal(s.queue().length,0);assert.equal(s.rankings().length,1);assert.equal(s.inactive()[0].id,a.id);
  assert.equal(s.player(a.id).rating,before.rating);assert.equal(s.player(a.id).wins,1);assert.equal(s.history(a.id).length,1);
  assert.throws(()=>s.join(a.id),/inactive/);
  s.setActive(a.id,true);assert.equal(s.player(a.id).rating,before.rating);assert.equal(s.queue().length,0);s.join(a.id);
 }finally{s.close();}
});
test('pending matches prevent deactivation and invalid flags never mutate a player',()=>{
 const s=openStore();try{
  const a=s.register('A'),b=s.register('B');s.join(a.id);s.join(b.id);const m=s.make()[0];
  assert.throws(()=>s.setActive(a.id,false),/active match/);assert.equal(s.player(a.id).active,1);
  for(const flag of [0,1,'false',null])assert.throws(()=>s.setActive(a.id,flag));
  s.cancel(m.id);assert.equal(s.setActive(a.id,false).active,0);assert.equal(s.match(m.id).status,'cancelled');
 }finally{s.close();}
});
test('availability upgrades preserve old player statistics and survive restart',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ladder-availability-')),path=join(dir,'app.sqlite');
 try{
  const db=new DatabaseSync(path);db.exec("CREATE TABLE players(id INTEGER PRIMARY KEY,name TEXT UNIQUE COLLATE NOCASE NOT NULL,rating INTEGER NOT NULL DEFAULT 1000,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,draws INTEGER NOT NULL DEFAULT 0); INSERT INTO players VALUES(1,'Existing player',1120,4,2,1);");db.close();
  let s=openStore(path);assert.equal(s.player(1).active,1);assert.equal(s.player(1).rating,1120);s.setActive(1,false);s.close();
  s=openStore(path);assert.equal(s.player(1).active,0);assert.equal(s.player(1).wins,4);s.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('availability API requires authentication and validates boolean flags',async()=>{
 const s=openStore(),token='test-only-availability-token-'.repeat(2),app=createApp(s,token);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.address().port}`;
 try{
  const p=s.register('API player');
  const call=(active,authenticated=true)=>fetch(`${base}/api/players/${p.id}/status`,{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({active})});
  assert.equal((await call(false,false)).status,401);assert.equal((await call('false')).status,400);
  assert.equal((await call(false)).status,200);
  const inactive=await fetch(base+'/api/players/inactive',{headers:{Authorization:`Bearer ${token}`}});
  assert.equal((await inactive.json())[0].id,p.id);assert.equal((await call(true)).status,200);
 }finally{await new Promise(resolve=>app.close(resolve));s.close();}
});
