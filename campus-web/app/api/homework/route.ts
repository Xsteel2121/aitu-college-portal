import {moderator,clientKey,takeLimit} from "../../../lib/moderator";
import imported from "../../../lib/imported-homework.json";
import {almatyDate,findGroup} from "../../../lib/campus";
import {actor,asHomework,body,checkOrigin,db,json,unavailable} from "../../../lib/server";
import {FILE_COUNT,uuid,withAttachments} from "../../../lib/attachments";
export async function GET(request:Request) {
  try {
    const who=await actor(request),group=findGroup(new URL(request.url).searchParams.get("group")??"");
    if(!group)return json({error:"Группа не найдена"},400,who.cookie);
    if(group.id==="БҚ2604")await db().batch(imported.map(item=>db().prepare("INSERT OR IGNORE INTO homework(id,group_id,subject,body,author_id,author_name,assigned_date,created_at,done) VALUES (?,'БҚ2604',?,?,'legacy-import','Из Telegram-бота',?,?,?)").bind(item.id,item.subject,item.body,item.assignedDate,item.createdAt,item.done)));
    const mod=await moderator(request,group.id);
    const rows=await db().prepare("SELECT * FROM homework WHERE group_id=? AND done=0 AND (status='approved' OR author_id=? OR ?=1) ORDER BY assigned_date DESC,created_at DESC LIMIT 500").bind(group.id,who.id,mod?1:0).all();
    return json({moderator:Boolean(mod),items:(await withAttachments(rows.results)).map(r=>asHomework(r,who.id))},200,who.cookie);
  }catch(error){return unavailable(error);}
}
export async function POST(request:Request) {
  if(!checkOrigin(request))return json({error:"Запрос разрешён только с сайта"},403);
  try {
    const who=await actor(request),value=await body(request);
    const group=findGroup(value.groupId),subject=String(value.subject??""),text=String(value.body??"").trim(),name=String(value.authorName??"").trim();
    const files:unknown=value.attachments??[];
    if(!Array.isArray(files)||files.length>FILE_COUNT||files.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(files).size!==files.length)return json({error:"Прикрепите не больше пяти файлов"},400,who.cookie);
    if(!group||!group.subjects.includes(subject)||text.length<1||text.length>3000||name.length<1||name.length>60||!/^\d{4}-\d{2}-\d{2}$/.test(value.assignedDate??"")||!uuid.test(value.id??""))return json({error:"Проверьте предмет, текст, имя и дату задания"},400,who.cookie);
    const parsed=new Date(value.assignedDate+"T12:00:00Z");
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value.assignedDate)return json({error:"Некорректная дата"},400,who.cookie);
    if(value.assignedDate>almatyDate()||value.assignedDate<"2026-09-01")return json({error:"Дата задания должна быть между началом учебного года и сегодняшним днём"},400,who.cookie);
    const id=String(value.id),existing=await db().prepare("SELECT * FROM homework WHERE id=?").bind(id).first();
    if(existing)return existing.author_id===who.id?json({item:asHomework((await withAttachments([existing]))[0],who.id)},200,who.cookie):json({error:"Повторите сохранение"},409,who.cookie);
    if(!await takeLimit(`homework:${await clientKey(request)}`,60,3600000))return json({error:"Слишком много заданий. Повторите позже."},429,who.cookie);
    const placeholders=files.map(()=>"?").join(',');
    const fileCheck=files.length?`AND (SELECT COUNT(*) FROM homework_attachments WHERE id IN (${placeholders}) AND author_id=? AND homework_id IS NULL AND ready=1)=?`:'';
    const insert=db().prepare(`INSERT INTO homework(id,group_id,subject,body,author_id,author_name,assigned_date,created_at,status) SELECT ?,?,?,?,?,?,?,?,'pending' WHERE (SELECT COUNT(*) FROM homework WHERE author_id=? AND created_at>?)<30 ${fileCheck} RETURNING *`).bind(id,group.id,subject,text,who.id,name,value.assignedDate,Date.now(),who.id,Date.now()-86400000,...(files.length?[...files,who.id,files.length]:[]));
    // Files and homework are linked in one transaction before becoming available to moderation.
    const statements=[insert];
    if(files.length)statements.push(db().prepare(`UPDATE homework_attachments SET homework_id=? WHERE id IN (${placeholders}) AND author_id=? AND homework_id IS NULL AND ready=1 AND EXISTS(SELECT 1 FROM homework WHERE id=? AND author_id=? AND status='pending' AND done=0)`).bind(id,...files,who.id,id,who.id));
    const results=await db().batch<Record<string,unknown>>(statements),row=results[0].results[0];
    if(!row)return json({error:"Файлы недоступны или достигнут лимит 30 заданий в день. Проверьте вложения и повторите."},409,who.cookie);
    return json({item:asHomework((await withAttachments([row]))[0],who.id)},201,who.cookie);
  }catch(error){return unavailable(error);}
}
