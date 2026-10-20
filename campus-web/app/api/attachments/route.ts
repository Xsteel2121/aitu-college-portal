import { actor, checkOrigin, db, json, unavailable } from '../../../lib/server';
import { clientKey, takeLimit } from '../../../lib/moderator';
import { bucket, contentType, fileInfo, FILE_LIMIT, uuid } from '../../../lib/attachments';

export async function POST(request:Request) {
  if (!checkOrigin(request)) return json({error:'Недопустимый источник запроса'},403);
  if (Number(request.headers.get('content-length')||0)>FILE_LIMIT+16384) return json({error:'Файл должен быть не больше 4 МБ'},413);
  try {
    const who = await actor(request);
    const form = await request.formData();
    const file = form.get('file'), id = String(form.get('id')||'');
    if (!(file instanceof File)||!uuid.test(id)) return json({error:'Выберите файл для задания'},400,who.cookie);
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g,'').trim().slice(0,180);
    if (!name||file.size===0||file.size>FILE_LIMIT) return json({error:'Выберите непустой файл размером до 4 МБ'},413,who.cookie);
    const old = await db().prepare('SELECT * FROM homework_attachments WHERE id=?').bind(id).first();
    if (old) return old.author_id===who.id&&old.homework_id===null&&old.ready?json({file:fileInfo(old)},200,who.cookie):json({error:'Файл уже использован или ещё загружается'},409,who.cookie);
    if (!await takeLimit(`upload:${await clientKey(request)}`,100,3600000)) return json({error:'Слишком много загрузок. Повторите позже.'},429,who.cookie);
    const bytes = new Uint8Array(await file.arrayBuffer()), type = contentType(name,bytes);
    if (!type) return json({error:'Поддерживаются фото, PDF, Word, Excel, презентации, TXT, CSV и ZIP. Формат или содержимое файла не распознаны.'},400,who.cookie);
    const key = `homework/${who.id}/${id}`;
    // Reserve quota before writing bytes. Only the owner can see unlinked uploads.
    const row = await db().prepare(`INSERT INTO homework_attachments(id,author_id,name,content_type,size,storage_key,created_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM homework_attachments WHERE author_id=? AND created_at>?)<50 RETURNING *`).bind(id,who.id,name,type,file.size,key,Date.now(),who.id,Date.now()-86400000).first();
    if (!row) return json({error:'Лимит — 50 файлов в день с этого устройства'},429,who.cookie);
    try { await bucket().put(key,bytes,{httpMetadata:{contentType:type}}); await db().prepare('UPDATE homework_attachments SET ready=1 WHERE id=? AND homework_id IS NULL').bind(id).run(); }
    catch (error) { await db().prepare('DELETE FROM homework_attachments WHERE id=? AND homework_id IS NULL').bind(id).run(); throw error; }
    return json({file:fileInfo(row)},201,who.cookie);
  } catch(error) { return unavailable(error); }
}
