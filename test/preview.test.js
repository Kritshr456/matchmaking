import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';
import { selectPairs } from '../src/pairing.js';
import { createApp } from '../src/app.js';

test('preview is read-only and agrees with creation for an unchanged queue',()=>{
 const s=openStore(':memory:',()=>60000);try{
  for(let n=0;n<5;n++){const p=s.register(`p${n}`);s.join(p.id);}
  const before=s.queue(),preview=s.preview();assert.equal(preview.pairs.length,2);assert.equal(preview.generatedAt,60000);
  assert.deepEqual(s.queue(),before);assert.deepEqual(s.recent(),[]);assert.deepEqual(s.preview(),preview);
  assert.deepEqual(s.make().map(m=>[m.a,m.b]),preview.pairs.map(p=>[p.a,p.b]));
  assert.equal(s.queue().length,1);
 }finally{s.close();}
});
test('pairing respects tolerance growth, the cap and deterministic oldest-player priority',()=>{
 const queue=[{id:2,joined:0,rating:1200},{id:1,joined:0,rating:1000}];
 assert.equal(selectPairs(queue,0).length,0);assert.equal(selectPairs(queue,60000).length,1);
 assert.equal(selectPairs(queue,-1000).length,0);assert.deepEqual(queue.map(p=>p.id),[2,1]);
 assert.equal(selectPairs([{id:1,joined:0,rating:1000},{id:2,joined:0,rating:1601}],3600000).length,0);
 const pair=selectPairs([{id:3,joined:2,rating:1000},{id:2,joined:1,rating:1000},{id:1,joined:0,rating:1000}],10)[0];
 assert.deepEqual([pair.a.id,pair.b.id],[1,2]);
});
test('preview endpoint requires authentication and does not create matches',async()=>{
 const s=openStore(),token='preview-test-only-token-'.repeat(3),app=createApp(s,token);
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${app.address().port}/api/matches/preview`;
 try{
  s.join(s.register('A').id);s.join(s.register('B').id);
  assert.equal((await fetch(url)).status,401);
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});assert.equal(response.status,200);
  assert.equal((await response.json()).pairs.length,1);assert.equal(s.recent().length,0);assert.equal(s.queue().length,2);
 }finally{await new Promise(resolve=>app.close(resolve));s.close();}
});
