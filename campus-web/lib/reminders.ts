import {env} from "cloudflare:workers";
import {almatyDate,groups,teachingDate,weekday} from "./campus";
import {db} from "./server";
import {sendPush,type PushSubscriptionData} from "./web-push";
import {cleanDraftAttachments} from "./attachments";
export function eventWindows(now:number){
  const date=almatyDate(new Date(now));if(!groups.some(g=>teachingDate(date,g.course)))return [];
  const times=Array.from(new Set(['14:30',...groups.flatMap(g=>g.days[weekday(date)]??[]).flatMap(l=>l.start&&l.end?[l.start,l.end]:[])]));
  return times.map(time=>({date,time,when:new Date(`${date}T${time}:00+05:00`).getTime()})).filter(event=>now>=event.when&&now-event.when<=((event.time==="14:30")?3600000:600000));
}
export async function runReminders(){
  const now=Date.now();let queued=0;let sent=0;let failed=0;
  await cleanDraftAttachments();
  if(!env.PUSH_PRIVATE_JWK)return {configured:false,queued,sent,failed,pending:0};
  for(const event of eventWindows(now)){
    const isDigest=event.time==="14:30";
    for(const group of groups){
      if(!teachingDate(event.date,group.course))continue;
      const eventId=`${event.date}:${event.time}:${group.id}`;
      const exists=await db().prepare("SELECT id FROM notification_events WHERE id=?").bind(eventId).first();if(exists)continue;
      let payload:Record<string,unknown>;
      if(isDigest){const rows=await db().prepare("SELECT subject,body FROM homework WHERE status='approved' AND group_id=? AND assigned_date=? AND created_at<=? AND (done=0 OR done_at>?) ORDER BY created_at").bind(group.id,event.date,event.when,event.when).all();
        const text=rows.results.map(r=>`${r.subject}: ${r.body}`).join("\n");
        payload={title:`ДЗ за сегодня · ${group.id}`,body:text?text.slice(0,850):"Сегодня пока нет записанных заданий.",url:`/?tab=homework&group=${encodeURIComponent(group.id)}`,tag:eventId};
      }else{const lesson=group.days[weekday(event.date)].find(l=>l.start===event.time||l.end===event.time);if(!lesson)continue;const start=lesson.start===event.time;payload={title:`${start?"Начало":"Конец"} ${lesson.slot}-й пары · ${group.id}`,body:`${lesson.subject}\n${lesson.teacher}\n${lesson.room}`,url:`/?group=${encodeURIComponent(group.id)}`,tag:eventId};}
      // Atomic event + outbox insertion. ID uniqueness deduplicates racing invocations.
      const results=await db().batch([
        db().prepare("INSERT OR IGNORE INTO notification_events(id,created_at) VALUES (?,?)").bind(eventId,now),
        db().prepare(`INSERT OR IGNORE INTO notification_outbox(id,event_id,subscription_id,payload,expires_at) SELECT ? || ':' || id,?,id,?,? FROM subscriptions WHERE group_id=? AND active=1 AND ${isDigest?"digest":"lessons"}=1 AND created_at<=?`).bind(eventId,eventId,JSON.stringify(payload),event.when+(isDigest?3600000:600000),group.id,event.when),
      ]);queued+=results[1].meta.changes??0;
    }
  }
  await db().prepare("UPDATE notification_outbox SET status='expired' WHERE expires_at<? AND status IN ('pending','sending')").bind(now).run();
  const rows=await db().prepare("UPDATE notification_outbox SET status='sending',lease_until=?,attempts=attempts+1 WHERE id IN (SELECT o.id FROM notification_outbox o JOIN subscriptions s ON s.id=o.subscription_id WHERE s.active=1 AND ((o.status='pending' AND o.next_attempt<=?) OR (o.status='sending' AND o.lease_until<?)) AND o.expires_at>? LIMIT 4) RETURNING *").bind(now+120000,now,now,now).all();
  const jwk=JSON.parse(env.PUSH_PRIVATE_JWK) as JsonWebKey;
  for(const row of rows.results){
    const sub=await db().prepare("SELECT subscription FROM subscriptions WHERE id=? AND active=1").bind(row.subscription_id).first();
    if(!sub){await db().prepare("UPDATE notification_outbox SET status='cancelled' WHERE id=?").bind(row.id).run();continue;}
    try{const response=await sendPush(JSON.parse(String(sub.subscription)) as PushSubscriptionData,JSON.parse(String(row.payload)),jwk,env.PUSH_CONTACT??"https://aitu-campus-schedule.qejrjdjjd.chatgpt.site");
      if(response.ok){await db().prepare("UPDATE notification_outbox SET status='sent' WHERE id=?").bind(row.id).run();sent++;}
      else if(response.status===404||response.status===410){await db().batch([db().prepare("UPDATE subscriptions SET active=0 WHERE id=?").bind(row.subscription_id),db().prepare("UPDATE notification_outbox SET status='failed' WHERE id=?").bind(row.id)]);failed++;}
      else{await db().prepare("UPDATE notification_outbox SET status='pending',next_attempt=? WHERE id=?").bind(now+60000,row.id).run();failed++;}
    }catch{await db().prepare("UPDATE notification_outbox SET status='pending',next_attempt=? WHERE id=?").bind(now+60000,row.id).run();failed++;}
  }
  await db().prepare("DELETE FROM notification_outbox WHERE expires_at<?").bind(now-7*86400000).run();
  await db().prepare("DELETE FROM notification_events WHERE created_at<?").bind(now-7*86400000).run();
  const count=await db().prepare("SELECT COUNT(*) AS n FROM notification_outbox o JOIN subscriptions s ON s.id=o.subscription_id WHERE s.active=1 AND o.status IN ('pending','sending') AND o.expires_at>?").bind(now).first();
  return {configured:true,queued,sent,failed,pending:Number(count?.n??0),serverTime:new Date(now).toISOString()};
}
