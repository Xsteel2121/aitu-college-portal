import {brokerLogin,brokerRefresh,brokerStatus,createDeviceCode,claimDeviceCode} from '../../../lib/smartnation-broker.server';
import {after} from 'next/server';
import {recordSync} from '../../../lib/portal.server';
import {clearSessionCookie,hasSmartNationSession,sessionCookie,SyncError,syncFailure} from '../../../lib/smartnation.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const attempts=new Map<string,{count:number;until:number}>();
function response(data:unknown,status=200,cookie?:string[]){const headers=new Headers({'Cache-Control':'private,no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'});for(const value of cookie||[])headers.append('Set-Cookie',value);return Response.json(data,{status,headers});}
function sameOrigin(request:Request){return request.headers.get('origin')===new URL(request.url).origin&&request.headers.get('sec-fetch-site')!=='cross-site';}
function permit(request:Request,login=false){
  const key=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local')+(login?':login':':refresh');
  const now=Date.now();for(const [k,v]of attempts)if(v.until<now)attempts.delete(k);
  if(attempts.size>5000)throw new SyncError('Сервис занят. Попробуйте позже.',429);
  const value=attempts.get(key)||{count:0,until:now+15*60000};value.count++;attempts.set(key,value);
  if(value.count>(login?8:20))throw new SyncError('Слишком много попыток. Попробуйте через 15 минут или используйте импорт.',429);
}
async function synchronize(request:Request,login:boolean){
  if(!sameOrigin(request))return response({error:'Недопустимый источник запроса'},403);
  const secure=new URL(request.url).protocol==='https:';
  try{
    permit(request,login);let result;
    if(login){if(Number(request.headers.get('content-length')||0)>2048)return response({error:'Слишком длинный запрос'},413);const text=await request.text();if(text.length>2048)return response({error:'Слишком длинный запрос'},413);let input;try{input=JSON.parse(text);}catch{return response({error:'Некорректный запрос'},400);}
      if(!input||typeof input!=='object'||typeof input.login!=='string'||typeof input.password!=='string'||input.login.trim().length<3||input.login.length>120||input.password.length<1||input.password.length>200)return response({error:'Введите логин и пароль SmartNation'},400);
      result=await brokerLogin(input.login.trim(),input.password,input.remember===true);
    }else result=await brokerRefresh(request);
    return response({snapshot:result.snapshot},200,sessionCookie(result.session,secure));
  }catch(cause){const error=syncFailure(cause,login?'login-broker':'refresh-broker'),known=true;console.error('smartnation-sync-failed',JSON.stringify({operation:login?'login':'refresh',status:error.status,code:error.code,stage:error.stage}));let cookie:string[]|undefined;if(known&&error.status===401&&(!login||!hasSmartNationSession(request)))cookie=clearSessionCookie(secure);else if(known&&error.session){try{cookie=sessionCookie(error.session,secure);}catch{}}return response({error:known?error.message:'Не удалось синхронизировать оценки. Попробуйте быстрый импорт.',needsReconnect:known&&error.status===409,hasSession:Boolean(known&&error.session&&cookie||login&&hasSmartNationSession(request)),canRetry:Boolean(known&&error.session&&cookie&&error.status!==409)},known?error.status:502,cookie);}
}
export async function POST(request:Request){const started=Date.now(),result=await synchronize(request,true);after(()=>recordSync('login',result.ok,Date.now()-started));return result;}
export async function PATCH(request:Request){const started=Date.now(),result=await synchronize(request,false);after(()=>recordSync('refresh',result.ok,Date.now()-started));return result;}
export async function GET(request:Request){if(request.headers.get('sec-fetch-site')==='cross-site')return response({error:'Недопустимый источник запроса'},403);return response(await brokerStatus(request));}
export function DELETE(request:Request){if(!sameOrigin(request))return response({error:'Недопустимый источник запроса'},403);return response({ok:true},200,clearSessionCookie(new URL(request.url).protocol==='https:'));}

export async function PUT(request:Request){
 if(!sameOrigin(request))return response({error:'Недопустимый источник запроса'},403);const secure=new URL(request.url).protocol==='https:';
 try{permit(request,true);const text=await request.text();if(text.length>1000)return response({error:'Слишком длинный запрос'},413);const input=JSON.parse(text);if(input?.action==='create-device-code'){const result=await createDeviceCode(request);return response({code:result.code,expiresAt:result.expiresAt},200,sessionCookie(result.session,secure));}
 if(input?.action==='claim-device-code'&&typeof input.code==='string'&&input.code.length<=50){const result=await claimDeviceCode(input.code,input.remember===true);return response({snapshot:result.snapshot},200,sessionCookie(result.session,secure));}return response({error:'Неизвестное действие'},400);
 }catch(error){const known=error instanceof SyncError,cookie=known&&error.session?sessionCookie(error.session,secure):undefined;return response({error:known?error.message:'Не удалось подключить устройство. Повторите попытку.',needsReconnect:known&&error.status===409,hasSession:Boolean(cookie),canRetry:Boolean(cookie&&known&&error.status!==409)},known?error.status:502,cookie);}
}
