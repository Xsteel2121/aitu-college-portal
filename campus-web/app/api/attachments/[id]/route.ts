import { actor,checkOrigin,db,json,unavailable } from '../../../../lib/server';
import { moderator } from '../../../../lib/moderator';
import { bucket,uuid } from '../../../../lib/attachments';
type Context = {params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context) {
  try {
    const {id}=await params; if(!uuid.test(id))return json({error:'Файл не найден'},404);
    const who=await actor(request);
    const row=await db().prepare('SELECT a.*,h.group_id,h.status,h.done FROM homework_attachments a LEFT JOIN homework h ON h.id=a.homework_id WHERE a.id=?').bind(id).first();
    const visible=row&&row.ready&&(row.author_id===who.id||row.homework_id&&row.status==='approved'&&!row.done||row.group_id&&await moderator(request,String(row.group_id)));
    if(!visible)return json({error:'Файл не найден или недоступен'},404,who.cookie);
    const object=await bucket().get(String(row.storage_key));if(!object)return json({error:'Файл не найден'},404,who.cookie);
    const type=String(row.content_type), inline=new URL(request.url).searchParams.get('view')==='1'&&['image/jpeg','image/png','image/webp','image/gif'].includes(type);
    const headers=new Headers({'Content-Type':type,'Content-Length':String(row.size),'Cache-Control':'private,no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':`${inline?'inline':'attachment'}; filename="attachment.${String(row.name).split('.').at(-1)?.replace(/[^a-zA-Z0-9]/g,'')||'bin'}"; filename*=UTF-8''${encodeURIComponent(String(row.name)).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`});
    if(who.cookie)headers.set('Set-Cookie',who.cookie);
    return new Response(object.body,{headers});
  }catch(error){return unavailable(error);}
}
export async function DELETE(request:Request,{params}:Context) {
  if(!checkOrigin(request))return json({error:'Недопустимый источник запроса'},403);
  try {
    const {id}=await params;const who=await actor(request);
    // Linked files are immutable; moderation applies to the whole assignment.
    const row=await db().prepare('DELETE FROM homework_attachments WHERE id=? AND author_id=? AND homework_id IS NULL RETURNING storage_key').bind(id,who.id).first();
    if(!row)return json({error:'Удалить можно только своё вложение до отправки ДЗ'},403,who.cookie);
    await bucket().delete(String(row.storage_key));return json({ok:true},200,who.cookie);
  }catch(error){return unavailable(error);}
}
