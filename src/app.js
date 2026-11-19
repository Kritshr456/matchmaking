import { createServer, positiveId, HttpError } from './http.js';
export function createApp(store,token){
  return createServer({token,publicDir:new URL('../public/',import.meta.url),route(method,path,body,query){
    const page=()=>positiveId(query.get('page')||'1');
    const selectedSeason=(all=false)=>{
      const value=query.get('season');
      if(all&&value==='all')return null;
      return !value||value==='current'?store.currentSeason().id:positiveId(value);
    };
    if(method==='GET'&&path==='/api/console')return {overview:store.overview(),seasons:store.seasons(),queue:store.queue(),pendingMatches:store.matchHistory({seasonId:store.currentSeason().id,status:'pending'}).rows};
    if(method==='GET'&&path==='/api/overview')return store.overview();
    if(method==='GET'&&path==='/api/standings'){
      const inactive=query.get('inactive')||'false';
      if(!['true','false'].includes(inactive))throw new HttpError(400,'inactive must be true or false.');
      return store.standings({seasonId:selectedSeason(),q:query.get('q')||'',includeInactive:inactive==='true',page:page()});
    }
    if(method==='GET'&&path==='/api/matches/history')return store.matchHistory({seasonId:selectedSeason(true),status:query.get('status')||'all',playerId:query.has('player')?positiveId(query.get('player')):null,page:page()});
    const profile=path.match(/^\/api\/profiles\/(\d+)$/);
    if(method==='GET'&&profile)return store.profile(positiveId(profile[1]),page());
    if(method==='GET'&&path==='/api/seasons')return {current:store.currentSeason(),rows:store.seasons()};
    if(method==='POST'&&path==='/api/seasons')return store.startSeason(body.name,body.expectedSeasonId);
    if(method==='GET'&&path==='/api/players')return store.rankings();
    if(method==='GET'&&path==='/api/players/inactive')return store.inactive();
    if(method==='POST'&&path==='/api/players')return store.register(body.name);
    if(method==='GET'&&path==='/api/queue')return store.queue();
    if(method==='POST'&&path==='/api/queue/join')return store.join(positiveId(body.playerId));
    if(method==='POST'&&path==='/api/queue/leave')return store.leave(positiveId(body.playerId));
    if(method==='GET'&&path==='/api/matches/preview')return store.preview();
    if(method==='GET'&&path==='/api/matches')return store.recent();
    if(method==='POST'&&path==='/api/matches/make')return store.make();
    const detail=path.match(/^\/api\/matches\/(\d+)$/);
    if(method==='GET'&&detail){const m=store.match(positiveId(detail[1]));return {...m,a_name:store.player(m.a).name,b_name:store.player(m.b).name,season_name:store.season(m.season_id).name};}
    let match=path.match(/^\/api\/matches\/(\d+)\/(result|cancel)$/);
    if(method==='POST'&&match)return match[2]==='result'?store.result(positiveId(match[1]),body.winnerId):store.cancel(positiveId(match[1]));
    match=path.match(/^\/api\/players\/(\d+)\/status$/);
    if(method==='POST'&&match)return store.setActive(positiveId(match[1]),body.active);
    match=path.match(/^\/api\/players\/(\d+)$/);
    if(method==='GET'&&match)return {player:store.player(positiveId(match[1])),matches:store.history(positiveId(match[1]))};
  }});
}
