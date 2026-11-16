import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore,ratingChange } from '../src/store.js';
import { createApp } from '../src/app.js';
test('queue matching never duplicates players and blocks active requeue',()=>{
 const s=openStore();try{const p=Array.from({length:5},(_,i)=>s.register(`p${i}`));p.forEach(x=>s.join(x.id));assert.throws(()=>s.join(p[0].id));const matches=s.make();assert.equal(matches.length,2);assert.equal(new Set(matches.flatMap(m=>[m.a,m.b])).size,4);assert.equal(s.queue().length,1);assert.throws(()=>s.join(matches[0].a));s.cancel(matches[0].id);s.join(matches[0].a);}finally{s.close();}
});
test('results are atomic and exactly once, with zero-sum Elo and draw statistics',()=>{
 const s=openStore();try{const a=s.register('A'),b=s.register('B');s.join(a.id);s.join(b.id);const [m]=s.make();assert.throws(()=>s.result(m.id,999));assert.equal(s.match(m.id).status,'pending');s.result(m.id,a.id);assert.equal(s.player(a.id).rating,1016);assert.equal(s.player(b.id).rating,984);assert.throws(()=>s.result(m.id,a.id));assert.equal(s.player(a.id).wins,1);s.join(a.id);s.join(b.id);s.result(s.make()[0].id,null);assert.equal(s.player(a.id).draws,1);assert.equal(s.player(a.id).rating+s.player(b.id).rating,2000);}finally{s.close();}
});
test('closest opponent selected, long waits expand tolerance',()=>{
 let now=0;const s=openStore(':memory:',()=>now);try{
 const a=s.register('a'),b=s.register('b');
 for(let i=0;i<15;i++){s.join(a.id);s.join(b.id);let matches=s.make();if(!matches.length){now+=300000;matches=s.make();}s.result(matches[0].id,a.id);}
 s.join(a.id);s.join(b.id);assert.equal(s.make().length,0);now+=300000;assert.equal(s.make().length,1);
 }finally{s.close();}
});
test('validation and rankings',()=>{const s=openStore();try{assert.throws(()=>s.register(' '));s.register('Name');assert.throws(()=>s.register('name'));assert.throws(()=>s.join(-1));assert.equal(s.rankings()[0].played,0);assert.equal(ratingChange(1000,1000,1),16);}finally{s.close();}});
test('data survives reopening the database',()=>{const dir=mkdtempSync(join(tmpdir(),'ladder-'));try{const file=join(dir,'app.sqlite');let s=openStore(file);s.register('Persistent');s.join(1);s.close();s=openStore(file);assert.equal(s.queue()[0].name,'Persistent');s.close();}finally{rmSync(dir,{recursive:true,force:true});}});
test('HTTP authentication, validation and full match flow',async()=>{
 const s=openStore(),token='test-token-'.repeat(4),app=createApp(s,token);await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${app.address().port}`;
 const call=(path,body,auth=true)=>fetch(url+path,{method:body?'POST':'GET',headers:{...(auth?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 try{
 assert.equal((await call('/health',null,false)).status,200);assert.equal((await call('/api/players',null,false)).status,401);
 assert.equal((await call('/api/players',{name:' '})).status,400);
 const a=await(await call('/api/players',{name:'first'})).json(),b=await(await call('/api/players',{name:'second'})).json();
 await call('/api/queue/join',{playerId:a.id});await call('/api/queue/join',{playerId:b.id});
 const [m]=await(await call('/api/matches/make',{})).json();assert.ok(m.id);
 assert.equal((await call(`/api/matches/${m.id}/result`,{winnerId:a.id})).status,200);
 assert.equal((await call(`/api/matches/${m.id}/result`,{winnerId:a.id})).status,409);
 assert.equal((await(await call(`/api/players/${a.id}`)).json()).player.wins,1);
 const page=await call('/',null,false);assert.match(await page.text(),/Matchmaking desk/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 }finally{await new Promise(r=>app.close(r));s.close();}
});
test('the nearest compatible rating wins over queue insertion order',()=>{
 const s=openStore();try{const a=s.register('a'),b=s.register('b'),c=s.register('c');s.join(a.id);s.join(b.id);s.result(s.make()[0].id,a.id);s.join(a.id);s.join(b.id);s.join(c.id);assert.equal(s.make()[0].b,c.id);}finally{s.close();}
});
