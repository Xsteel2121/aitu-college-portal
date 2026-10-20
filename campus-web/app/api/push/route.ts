import {env} from "cloudflare:workers";
import {findGroup} from "../../../lib/campus";
import {actor,body,checkOrigin,db,hash,json,unavailable} from "../../../lib/server";
import {validSubscription} from "../../../lib/web-push";
export async function GET(request:Request){try{const who=await actor(request);const rows=await db().prepare("SELECT id,group_id,lessons,digest,active FROM subscriptions WHERE actor_id=? AND active=1").bind(who.id).all();return json({publicKey:env.PUSH_PUBLIC_KEY??null,subscriptions:rows.results},200,who.cookie);}catch(e){return unavailable(e);}}
export async function POST(request:Request){
  if(!checkOrigin(request))return json({error:"Недопустимый источник запроса"},403);
  try{const who=await actor(request);const value=await body(request);const group=findGroup(value.groupId);if(!group||!validSubscription(value.subscription))return json({error:"Подписка не поддерживается этим браузером"},400,who.cookie);
    if(!env.PUSH_PRIVATE_JWK)return json({error:"Отправка уведомлений ещё не настроена"},503,who.cookie);
    const id=await hash(value.subscription.endpoint);const existing=await db().prepare("SELECT actor_id FROM subscriptions WHERE id=?").bind(id).first();if(existing&&existing.actor_id!==who.id)return json({error:"Подписка принадлежит другому устройству. Удалите её в настройках браузера и включите снова."},403,who.cookie);
    const result=await db().prepare("INSERT INTO subscriptions(id,actor_id,group_id,subscription,lessons,digest,active,created_at) SELECT ?,?,?,?,?,?,1,? WHERE (SELECT COUNT(*) FROM subscriptions WHERE actor_id=?)<5 OR EXISTS(SELECT 1 FROM subscriptions WHERE id=?) ON CONFLICT(id) DO UPDATE SET group_id=excluded.group_id,subscription=excluded.subscription,lessons=excluded.lessons,digest=excluded.digest,active=1,created_at=excluded.created_at RETURNING id").bind(id,who.id,group.id,JSON.stringify(value.subscription),value.lessons===false?0:1,value.digest===false?0:1,Date.now(),who.id,id).first();
    return result?json({ok:true,id},200,who.cookie):json({error:"На этом устройстве уже пять подписок"},429,who.cookie);
  }catch(e){return unavailable(e);}
}
export async function DELETE(request:Request){if(!checkOrigin(request))return json({error:"Недопустимый источник запроса"},403);try{const who=await actor(request);await db().prepare("UPDATE subscriptions SET active=0 WHERE actor_id=?").bind(who.id).run();return json({ok:true},200,who.cookie);}catch(e){return unavailable(e);}}
