import {b64,unb64} from "./encoding";
const utf8=(s:string)=>new TextEncoder().encode(s);
const join=(...parts:Uint8Array[])=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;};
async function hkdf(ikm:Uint8Array,salt:Uint8Array,info:Uint8Array,length:number){const key=await crypto.subtle.importKey("raw",ikm as BufferSource,"HKDF",false,["deriveBits"]);return new Uint8Array(await crypto.subtle.deriveBits({name:"HKDF",hash:"SHA-256",salt:salt as BufferSource,info:info as BufferSource},key,length*8));}
export interface PushSubscriptionData {endpoint:string;keys:{p256dh:string;auth:string};}
export async function encryptedPayload(subscription:PushSubscriptionData,payload:unknown){
  const receiver=unb64(subscription.keys.p256dh);const auth=unb64(subscription.keys.auth);
  const ephemeral=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const sender=new Uint8Array(await crypto.subtle.exportKey("raw",ephemeral.publicKey));
  const receiverKey=await crypto.subtle.importKey("raw",receiver as BufferSource,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:receiverKey},ephemeral.privateKey,256));
  const ikm=await hkdf(shared,auth,join(utf8("WebPush: info\0"),receiver,sender),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const cek=await hkdf(ikm,salt,utf8("Content-Encoding: aes128gcm\0"),16);
  const nonce=await hkdf(ikm,salt,utf8("Content-Encoding: nonce\0"),12);
  const content=utf8(JSON.stringify(payload));if(content.length>3800)throw new Error("Push too large");
  const aes=await crypto.subtle.importKey("raw",cek as BufferSource,"AES-GCM",false,["encrypt"]);
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce as BufferSource},aes,join(content,new Uint8Array([2]))));
  const recordSize=new Uint8Array(4);new DataView(recordSize.buffer).setUint32(0,4096);
  return join(salt,recordSize,new Uint8Array([sender.length]),sender,encrypted);
}
export async function pushAuthorization(endpoint:string,jwk:JsonWebKey,contact:string){
  const header=b64(utf8(JSON.stringify({typ:"JWT",alg:"ES256"})));
  const claims=b64(utf8(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+43200,sub:contact})));
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,utf8(`${header}.${claims}`));
  const publicKey=b64(join(new Uint8Array([4]),unb64(jwk.x!),unb64(jwk.y!)));
  return `vapid t=${header}.${claims}.${b64(new Uint8Array(signature))}, k=${publicKey}`;
}
export async function sendPush(subscription:PushSubscriptionData,payload:unknown,jwk:JsonWebKey,contact:string){
  const encrypted=await encryptedPayload(subscription,payload);const authorization=await pushAuthorization(subscription.endpoint,jwk,contact);
  return fetch(subscription.endpoint,{method:"POST",headers:{"Authorization":authorization,"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream","TTL":"300","Urgency":"high"},body:encrypted as unknown as BodyInit});
}
export function validSubscription(value:unknown):value is PushSubscriptionData{
  try{const sub=value as PushSubscriptionData;const url=new URL(sub.endpoint);const host=url.hostname;const allowed=host==="fcm.googleapis.com"||host==="updates.push.services.mozilla.com"||host.endsWith(".push.apple.com")||host==="web.push.apple.com";
    return url.protocol==="https:"&&allowed&&!url.username&&!url.password&&sub.endpoint.length<2500&&unb64(sub.keys.p256dh).length===65&&unb64(sub.keys.auth).length===16;
  }catch{return false;}
}
