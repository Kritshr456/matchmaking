const $=id=>document.getElementById(id);
async function api(path,body){
 const response=await fetch(`/api/${path}`,{headers:{Authorization:`Bearer ${$('token').value}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok)throw Error(data.error);return data;
}
async function refresh(){const [players,queue,matches]=await Promise.all([api('players'),api('queue'),api('matches')]);for(const [id,data]of Object.entries({players,queue,matches}))$(id).textContent=JSON.stringify(data,null,2);}
async function run(fn){try{await fn();$('status').textContent='Saved / refreshed.';}catch(error){$('status').textContent=error.message;}}
$('refresh').onclick=()=>run(refresh);
$('register').onsubmit=e=>{e.preventDefault();run(async()=>{await api('players',{name:new FormData(e.target).get('name')});e.target.reset();await refresh();});};
$('queue-form').onsubmit=e=>{e.preventDefault();const id=Number(new FormData(e.target).get('playerId'));run(async()=>{await api(`queue/${e.submitter.value}`,{playerId:id});await refresh();});};
$('make').onclick=()=>run(async()=>{await api('matches/make',{});await refresh();});
$('result').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);run(async()=>{await api(`matches/${Number(f.get('matchId'))}/${e.submitter.value}`,{winnerId:f.get('winnerId')?Number(f.get('winnerId')):null});await refresh();});};
$('history').onsubmit=e=>{e.preventDefault();run(async()=>{$('history-output').textContent=JSON.stringify(await api(`players/${Number(new FormData(e.target).get('playerId'))}`),null,2);});};
