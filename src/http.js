import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export class HttpError extends Error {
  constructor(status,message){super(message);this.status=status;}
}
export function positiveId(value){
  const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new HttpError(400,'Invalid ID.');return n;
}
export function text(value,max=64){
  if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new HttpError(400,`Use 1–${max} characters.`);
  if(/[\u0000-\u001f\u007f]/.test(value))throw new HttpError(400,'Control characters are not allowed.');
  return value.trim();
}
export function createServer({token,route,publicDir}){
  if(typeof token!=='string'||token.length<32)throw Error('API_TOKEN must contain at least 32 characters.');
  const expected=Buffer.from(`Bearer ${token}`);
  const buckets=new Map();
  const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET' && url.pathname==='/health')return send(200,{ok:true});
      if(req.method==='GET' && files[url.pathname] && publicDir){
        const [name,type]=files[url.pathname];const body=await readFile(new URL(name,publicDir));
        res.writeHead(200,{'Content-Type':type});return res.end(body);
      }
      const now=Date.now();
      for(const [key,bucket] of buckets)if(now-bucket.start>60000)buckets.delete(key);
      const ip=req.socket.remoteAddress||'unknown';
      const bucket=buckets.get(ip)||{start:now,count:0};
      if(buckets.size>=10000&&!buckets.has(ip))throw new HttpError(503,'Server is busy.');
      buckets.set(ip,bucket);if(++bucket.count>120)throw new HttpError(429,'Too many requests. Retry after one minute.');
      const supplied=Buffer.from(req.headers.authorization||'');
      if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw new HttpError(401,'A valid bearer token is required.');
      let body={};
      if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
        if(!(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Use application/json.');
        let size=0;const chunks=[];
        for await(const chunk of req){size+=chunk.length;if(size>16384)throw new HttpError(413,'Request body exceeds 16 KB.');chunks.push(chunk);}
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new HttpError(400,'Invalid JSON.');}
        if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'Expected a JSON object.');
      }
      const result=await route(req.method,url.pathname,body);
      if(result===undefined)throw new HttpError(404,'Route not found.');
      send(200,result);
    }catch(error){
      const status=error.status||500;
      if(status===500)console.error('Request failed',{code:error.code||'unknown'});
      if(!res.headersSent&&!res.destroyed)send(status,{error:status===500?'Internal server error.':error.message});
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
  return server;
}
