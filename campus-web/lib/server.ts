import { env } from "cloudflare:workers";
export function db() { if(!env.DB) throw new Error("Database unavailable"); return env.DB; }
export function b64(bytes: Uint8Array) { let str="";bytes.forEach(v=>str+=String.fromCharCode(v));return btoa(str).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); }
export function unb64(text:string) {const value=atob(text.replaceAll("-","+").replaceAll("_","/"));return Uint8Array.from(value,c=>c.charCodeAt(0));}
export async function hash(text:string){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text))));}
export async function actor(request:Request){
  let token=request.headers.get("cookie")?.split(";").map(x=>x.trim()).find(x=>x.startsWith("campus-session="))?.split("=")[1];
  const fresh=!token||!/^[A-Za-z0-9_-]{43}$/.test(token);
  if(fresh)token=b64(crypto.getRandomValues(new Uint8Array(32)));
  return {id:await hash(token!),cookie:fresh?`campus-session=${token}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${new URL(request.url).protocol==="https:"?"; Secure":""}`:null};
}
export function json(data:unknown,status=200,cookie:string|null=null){const headers=new Headers({"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","Vary":"Cookie"});if(cookie)headers.set("Set-Cookie",cookie);return new Response(JSON.stringify(data),{status,headers});}
export function checkOrigin(request:Request){return request.headers.get("origin")===new URL(request.url).origin&&request.headers.get("sec-fetch-site")!=="cross-site";}
export async function body(request:Request){if(Number(request.headers.get("content-length")??0)>16000)throw new Error("Payload too large");const text=await request.text();if(text.length>16000)throw new Error("Payload too large");return JSON.parse(text);}
export function unavailable(error:unknown){console.error("Campus storage error",error instanceof Error?error.name:"unknown");return json({error:"Не удалось связаться с хранилищем. Попробуйте ещё раз; текст задания останется в форме."},503);}
export function asHomework(row:Record<string,unknown>,actorId:string){return {id:row.id,groupId:row.group_id,subject:row.subject,body:row.body,authorName:row.author_name,assignedDate:row.assigned_date,createdAt:row.created_at,done:row.done,status:row.status,canEdit:row.author_id===actorId,attachments:row.attachments||[]};}
