import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer,positiveId } from '../src/http.js';
const token='test-only-operator-token-'.repeat(2);
async function fixture(t){
 const server=createServer({token,route:(method,path,body)=>path==='/echo'?body:undefined});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}`;
 return (body,headers={},path='/echo')=>fetch(url+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body});
}
test('HTTP rejects weak tokens and requires bearer authentication',async t=>{
 assert.throws(()=>createServer({token:'short',route:()=>({})}));
 const request=await fixture(t);assert.equal((await request('{}',{Authorization:'Bearer incorrect'})).status,401);
});
test('HTTP validates JSON objects, media type and unknown routes',async t=>{
 const request=await fixture(t);
 assert.equal((await request('[]')).status,400);
 assert.equal((await request('null')).status,400);
 assert.equal((await request('{broken')).status,400);
 assert.equal((await request('{}',{'Content-Type':'text/plain'})).status,415);
 assert.equal((await request('{}',{'Content-Type':'application/jsonp'})).status,415);
 assert.equal((await request('{}',{'Content-Type':'APPLICATION/JSON; charset=utf-8'})).status,200);
 assert.equal((await request('{}',{},'/missing')).status,404);
 const good=await request('{"text":"<script>literal</script>"}');
 assert.equal(good.status,200);assert.equal((await good.json()).text,'<script>literal</script>');assert.equal(good.headers.get('x-content-type-options'),'nosniff');
});
test('HTTP returns 413 for oversized JSON without processing it',async t=>{
 const request=await fixture(t);
 assert.equal((await request(JSON.stringify({text:'x'.repeat(17000)}))).status,413);
});
test('HTTP rate-limits repeated requests per remote address',async t=>{
 const request=await fixture(t);for(let i=0;i<120;i++)assert.equal((await request('{}')).status,200);
 assert.equal((await request('{}')).status,429);
});

test('IDs reject coercible values and unsafe integers',()=>{
 for(const value of [true,false,[1],[],{},null,undefined,'',' 1','1 ','01','1e2','0x10',0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'9007199254740992'])
  assert.throws(()=>positiveId(value),error=>error.status===400);
 for(const value of [1,'1',42,'42',Number.MAX_SAFE_INTEGER])assert.equal(positiveId(value),Number(value));
});
