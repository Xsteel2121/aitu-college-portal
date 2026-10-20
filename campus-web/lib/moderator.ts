import {env} from 'cloudflare:workers';
import {groups} from './campus';
import {db,hash} from './server';
export function constantEqual(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
export function codes():Record<string,string>{try{return JSON.parse(env.MODERATOR_CODES_JSON||'{}');}catch{return {};}}
export function moderatorCookie(groupId:string){return `campus-mod-${groups.findIndex(g=>g.id===groupId)}`;}
export async function moderator(request:Request,groupId:string){const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(moderatorCookie(groupId)+'='))?.split('=')[1];if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const tokenHash=await hash(token);const row=await db().prepare('SELECT token_hash,code_version FROM moderator_sessions WHERE token_hash=? AND group_id=? AND expires_at>?').bind(tokenHash,groupId,Date.now()).first();return row&&row.code_version===codes()[groupId]?tokenHash:null;}
export async function clientKey(request:Request){let ip=request.headers.get('cf-connecting-ip')||'local';const proxy=request.headers.get('x-campus-proxy');if(env.BACKEND_PROXY_SECRET&&proxy&&constantEqual(proxy,env.BACKEND_PROXY_SECRET))ip=request.headers.get('x-campus-client-ip')||ip;return hash(ip);}
export async function takeLimit(key:string,max:number,windowMs:number){const window=Math.floor(Date.now()/windowMs);const row=await db().prepare('INSERT INTO access_attempts(key,attempts,window) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window=excluded.window THEN attempts+1 ELSE 1 END,window=excluded.window RETURNING attempts').bind(key,window).first();return Number(row?.attempts||0)<=max;}
