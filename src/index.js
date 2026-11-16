import { openStore } from './store.js';
import { createApp } from './app.js';
const store=openStore(process.env.DATABASE_PATH||'./data/app.sqlite');
const server=createApp(store,process.env.API_TOKEN);
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Matchmaking listening on port ${port}`));
server.on('error',()=>{console.error('Could not start HTTP server.');store.close();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>store.close()));
