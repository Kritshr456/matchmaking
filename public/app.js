const $=id=>document.getElementById(id);
let playerNames=new Map();
async function api(path,body){
 const response=await fetch(`/api/${path}`,{headers:{Authorization:`Bearer ${$('token').value}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error);return data;
}
function table(target,headers,rows){
 const container=$(target);container.replaceChildren();
 if(!rows.length){container.textContent='No entries yet.';return;}
 const grid=document.createElement('table');
 const head=document.createElement('thead'),heading=document.createElement('tr');
 for(const label of headers){const cell=document.createElement('th');cell.scope='col';cell.textContent=label;heading.append(cell);}
 head.append(heading);grid.append(head);
 const body=document.createElement('tbody');
 for(const values of rows){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=String(value??'—');row.append(cell);}body.append(row);}
 grid.append(body);container.append(grid);
}
const name=id=>playerNames.has(id)?`${playerNames.get(id)} (#${id})`:`#${id}`;
const matches=rows=>rows.map(m=>[m.id,name(m.a),name(m.b),m.status,m.status==='completed'?(m.winner?name(m.winner):'Draw'):'—',m.delta===null?'—':`${m.delta>=0?'+':''}${m.delta} / ${m.delta<=0?'+':''}${-m.delta}`,new Date(m.created).toLocaleString()]);
async function refresh(){
 const [players,queue,history]=await Promise.all([api('players'),api('queue'),api('matches')]);
 playerNames=new Map(players.map(p=>[p.id,p.name]));for(const p of queue)playerNames.set(p.id,p.name);
 table('players',['Rank','ID','Player','Rating','Wins','Losses','Draws','Played'],players.map((p,index)=>[index+1,p.id,p.name,p.rating,p.wins,p.losses,p.draws,p.played]));
 table('queue',['ID','Player','Rating','Waiting'],queue.map(p=>[p.id,p.name,p.rating,`${Math.max(0,Math.floor((Date.now()-p.joined)/1000))}s`]));
 table('matches',['Match','Side A','Side B','Status','Winner','Elo A / B','Created'],matches(history));
}
async function run(fn){try{await fn();$('status').textContent='Saved / refreshed.';}catch(error){$('status').textContent=error.message;}}
$('refresh').onclick=()=>run(refresh);
$('register').onsubmit=e=>{e.preventDefault();run(async()=>{await api('players',{name:new FormData(e.target).get('name')});e.target.reset();await refresh();});};
$('queue-form').onsubmit=e=>{e.preventDefault();const id=Number(new FormData(e.target).get('playerId'));run(async()=>{await api(`queue/${e.submitter.value}`,{playerId:id});await refresh();});};
$('make').onclick=()=>run(async()=>{const created=await api('matches/make',{});await refresh();$('status').textContent=`Created ${created.length} match(es).`;});
$('result').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);run(async()=>{await api(`matches/${Number(f.get('matchId'))}/${e.submitter.value}`,{winnerId:f.get('winnerId')?Number(f.get('winnerId')):null});await refresh();});};
$('history').onsubmit=e=>{e.preventDefault();run(async()=>{
 const {player,matches:history}=await api(`players/${Number(new FormData(e.target).get('playerId'))}`);
 playerNames.set(player.id,player.name);
 $('player-summary').textContent=`${player.name} • ${player.rating} Elo • ${player.wins} wins / ${player.losses} losses / ${player.draws} draws`;
 table('history-output',['Match','Side A','Side B','Status','Winner','Elo A / B','Created'],matches(history));
});};
