import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';
import { createApp } from '../src/app.js';

function result(s,a,b,winner){s.join(a.id);s.join(b.id);return s.result(s.make()[0].id,winner);}

test('standings pagination and literal search preserve overall ranks',()=>{
 const s=openStore();try{
  for(let i=0;i<25;i++)s.register(i===23?'Literal_% player':`Player ${String(i).padStart(2,'0')}`);
  const first=s.standings(),second=s.standings({page:2});assert.equal(first.total,25);assert.equal(first.rows.length,20);assert.equal(second.rows.length,5);
  assert.equal(second.rows[0].rank,21);const found=s.standings({q:'_%'});assert.equal(found.total,1);assert.equal(found.rows[0].rank,24);
  assert.equal(s.standings({q:"' OR 1=1 --"}).total,0);
  s.setActive(1,false);assert.equal(s.standings().total,24);assert.equal(s.standings({includeInactive:true}).total,25);
  for(const options of [{page:0},{page:100001},{q:'x'.repeat(33)},{includeInactive:'true'}])assert.throws(()=>s.standings(options));
 }finally{s.close();}
});

test('closed standings remain unchanged when live ratings, activity and roster change',()=>{
 const s=openStore();try{
  const a=s.register('A'),b=s.register('B');result(s,a,b,a.id);s.startSeason('Second',1);
  const archived=s.standings({seasonId:1,includeInactive:true});assert.equal(archived.rows[0].rating,1016);
  result(s,a,b,b.id);s.setActive(a.id,false);s.register('New player');
  assert.deepEqual(s.standings({seasonId:1,includeInactive:true}),archived);assert.equal(s.standings().total,2);
  assert.throws(()=>s.standings({seasonId:999}),error=>error.status===404);
 }finally{s.close();}
});

test('profiles retain lifetime stats and season history without double counting',()=>{
 const s=openStore();try{
  const a=s.register('A'),b=s.register('B');result(s,a,b,a.id);result(s,a,b,null);s.startSeason('Second',1);result(s,a,b,b.id);
  const p=s.profile(a.id);assert.deepEqual(p.lifetime,{wins:1,losses:1,draws:1,played:3});assert.equal(p.seasons.length,2);
  assert.equal(p.player.losses,1);assert.equal(p.history.total,3);assert.equal(p.ratingTrail.length,1);
  assert.equal(p.ratingTrail[0].rating,p.player.rating);assert.equal(p.ratingTrail[0].before_rating,1000);
  assert.ok(p.history.rows.every(m=>m.a_name&&m.b_name&&m.season_name));
  assert.throws(()=>s.profile(999),error=>error.status===404);
 }finally{s.close();}
});

test('history combines season, status and player filters and supports older pages',()=>{
 const s=openStore();try{
  const a=s.register('A'),b=s.register('B'),c=s.register('C');
  for(let i=0;i<22;i++)result(s,a,b,null);
  s.startSeason('Second',1);s.join(a.id);s.join(c.id);const pending=s.make()[0];
  assert.equal(s.matchHistory().total,23);assert.equal(s.matchHistory({page:2}).rows.length,3);
  assert.equal(s.matchHistory({seasonId:1,status:'completed',playerId:b.id}).total,22);
  assert.equal(s.matchHistory({seasonId:2,status:'pending',playerId:b.id}).total,0);
  assert.equal(s.matchHistory({seasonId:2}).rows[0].id,pending.id);
  s.cancel(pending.id);assert.equal(s.matchHistory({status:'cancelled'}).total,1);
  assert.throws(()=>s.matchHistory({status:"all' OR 1=1"}));assert.throws(()=>s.matchHistory({page:0}));
 }finally{s.close();}
});

test('overview reports live queue waits, season counts and result activity',()=>{
 let now=Date.UTC(2026,0,1);const s=openStore(':memory:',()=>now);try{
  const a=s.register('A'),b=s.register('B');s.join(a.id);now+=10000;
  assert.equal(s.overview().queueWait.longestMs,10000);s.join(b.id);const m=s.make()[0];
  assert.equal(s.overview().counts.pending,1);s.result(m.id,a.id);
  const view=s.overview();assert.equal(view.counts.completed,1);assert.equal(view.counts.queued,0);assert.equal(view.counts.active,2);
  assert.equal(view.activity.at(-1).completed,1);assert.equal(view.topPlayers[0].id,a.id);
  s.startSeason('Second',1);assert.equal(s.overview().counts.completed,0);assert.equal(s.overview().counts.registered,2);
 }finally{s.close();}
});

test('league queries enforce authentication and validate URL filters',async()=>{
 const s=openStore(),token='league-query-test-only-token-'.repeat(2),app=createApp(s,token);s.register('A');
 await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.address().port}`;
 const get=(path,auth=true)=>fetch(base+path,{headers:auth?{Authorization:`Bearer ${token}`}:{}});
 try{
  for(const path of ['/api/overview','/api/standings','/api/matches/history','/api/profiles/1'])assert.equal((await get(path,false)).status,401);
  assert.equal((await get('/api/standings?page=1e1')).status,400);assert.equal((await get('/api/standings?inactive=yes')).status,400);
  assert.equal((await get('/api/standings?season=999')).status,404);assert.equal((await get('/api/matches/history?status=wrong')).status,400);
  assert.equal((await get('/api/standings?q=A')).status,200);assert.equal((await get('/api/profiles/1')).status,200);
 }finally{await new Promise(resolve=>app.close(resolve));s.close();}
});
