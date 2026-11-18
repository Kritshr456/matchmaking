import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createServer } from '../src/http.js';

test('chunked oversized requests receive JSON 413 before the upload finishes', {timeout:7000}, async t => {
  let called=false;
  const token='stream-limit-test-only-token-'.repeat(2);
  const server=createServer({token,route:()=>{called=true;return {};}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const response=await new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path:'/echo',method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
      res.on('end',()=>{resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString()});req.destroy();});
    });
    req.on('error',reject);req.setTimeout(3000,()=>req.destroy(Error('No response before upload completion')));
    req.write('{"text":"');req.write('x'.repeat(17000));
  });
  assert.equal(response.status,413);assert.match(JSON.parse(response.body).error,/16 KB/);
  assert.equal(response.headers.connection,'close');assert.equal(called,false);
});

test('an oversized Content-Length is rejected before accepting upload bytes', {timeout:7000}, async t => {
  const token='known-length-test-only-token-'.repeat(2),server=createServer({token,route:()=>assert.fail('Oversized request reached route')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const status=await new Promise((resolve,reject)=>{
    const req=request({host:'127.0.0.1',port:server.address().port,path:'/echo',method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Content-Length':'17000'}},res=>{
      res.resume();res.on('end',()=>{resolve(res.statusCode);req.destroy();});res.on('error',reject);
    });
    req.on('error',reject);req.setTimeout(3000,()=>req.destroy(Error('Server waited for an oversized body')));req.flushHeaders();
  });
  assert.equal(status,413);
});
