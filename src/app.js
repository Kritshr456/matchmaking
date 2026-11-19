import { createServer, positiveId } from './http.js';
export function createApp(store,token){
  return createServer({token,publicDir:new URL('../public/',import.meta.url),route(method,path,body){
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
    let match=path.match(/^\/api\/matches\/(\d+)\/(result|cancel)$/);
    if(method==='POST'&&match)return match[2]==='result'?store.result(positiveId(match[1]),body.winnerId):store.cancel(positiveId(match[1]));
    match=path.match(/^\/api\/players\/(\d+)\/status$/);
    if(method==='POST'&&match)return store.setActive(positiveId(match[1]),body.active);
    match=path.match(/^\/api\/players\/(\d+)$/);
    if(method==='GET'&&match)return {player:store.player(positiveId(match[1])),matches:store.history(positiveId(match[1]))};
  }});
}
