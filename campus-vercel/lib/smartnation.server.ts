import {createCipheriv,createDecipheriv,createHash,createHmac,randomBytes} from 'node:crypto';
import {load} from 'cheerio';
import {parseGradeJSON,parseGradeText,dateValue} from './grade-import';
import type {GradeSnapshot,GradeSubject,StudentProfile} from './grades';
const ORIGIN='https://college.smartnation.kz';
export const SMARTNATION_LOGIN=ORIGIN+'/ru/mng/login';
export const SMARTNATION_JOURNALS=ORIGIN+'/ru/mng/control/journals';
const COOKIE='aitu-smartnation';
export class SyncError extends Error{session?:UpstreamSession;constructor(message:string,public status=502){super(message);}}
export interface UpstreamSession {needsReconnect?:boolean;owner?:string;vault?:{owner:string;epoch:string};cookies:Record<string,string>;token?:string;expires:number;remember:boolean;csrf?:string;journalsURL?:string;context?:Record<string,string>;}
function secret(){const value=process.env.SMARTNATION_SESSION_SECRET;if(!value||value.length<32)throw new SyncError('Прямой вход пока не настроен. Оценки можно загрузить через «Быстрый импорт».',503);return createHash('sha256').update('aitu-smartnation-session-v1:'+value).digest();}
export function sessionCookie(session:UpstreamSession,secure:boolean){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',secret(),iv),encrypted=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final()]);
  const value=Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
  if(value.length>7400)throw new SyncError('Сессия SmartNation слишком большая. Используйте быстрый импорт.');
  const base=`; Path=/api/smartnation; HttpOnly; SameSite=Strict${secure?'; Secure':''}`,suffix=base+(session.remember?'; Max-Age=604800':'');
  return [`${COOKIE}=${value.slice(0,3700)}${suffix}`,`${COOKIE}-part=${value.slice(3700)}${value.length>3700?suffix:base+'; Max-Age=0'}`];
}
export function clearSessionCookie(secure:boolean){return [COOKIE,COOKIE+'-part'].map(name=>`${name}=; Path=/api/smartnation; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`);}
export function readSmartNationSession(request:Request):UpstreamSession{
  const cookies=request.headers.get('cookie')?.split(';').map(v=>v.trim())||[],first=cookies.find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1),part=cookies.find(v=>v.startsWith(COOKIE+'-part='))?.slice(COOKIE.length+6)||'';
  if(!first)throw new SyncError('Войдите снова в SmartNation. Сохранённые оценки доступны без входа.',401);const value=first+part;
  try{const bytes=Buffer.from(value,'base64url');const decipher=createDecipheriv('aes-256-gcm',secret(),bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));const data=JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8')) as UpstreamSession;if(data.expires<Date.now()||!data.cookies)throw new Error();return data;}catch{throw new SyncError('Сессия закончилась. Войдите снова или импортируйте оценки.',401);}
}
export function hasSmartNationSession(request:Request){try{readSmartNationSession(request);return true;}catch{return false;}}
export function smartNationOwner(session:UpstreamSession){
  try{const payload=JSON.parse(Buffer.from(session.token!.split('.')[1],'base64url').toString('utf8'));if((typeof payload.sub==='string'||typeof payload.sub==='number')&&String(payload.sub).length>0&&String(payload.sub).length<=250)return createHmac('sha256',secret()).update('smartnation-account:'+String(payload.iss||ORIGIN)+':'+String(payload.sub)).digest('base64url');}catch{}
  return session.owner;
}
function safeURL(path:string){const url=new URL(path,ORIGIN);if(url.origin!==ORIGIN||url.username||url.password)throw new SyncError('SmartNation перенаправил на другой домен. Используйте быстрый импорт.');return url;}
function coreConfiguration(html:string):Record<string,unknown>{
  const marker=/window\.core_project\s*=\s*/.exec(html);if(!marker)return {};const start=marker.index+marker[0].length;if(html[start]!=='{')return {};
  let depth=0,quoted=false,escaped=false;for(let i=start;i<html.length;i++){const char=html[i];if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;}else if(char==='"')quoted=true;else if(char==='{')depth++;else if(char==='}'&&--depth===0){try{return JSON.parse(html.slice(start,i+1));}catch{return {};}}}return {};
}
export function parseStudentProfile(value:unknown):StudentProfile {
  if(!value||typeof value!=='object')return {};const root=value as Record<string,unknown>;
  const own=(root.currentUser??root.authUser??root.user??root.student??root.profile??{}) as Record<string,unknown>;if(!own||typeof own!=='object'||Array.isArray(own))return {};
  function text(v:unknown):string|undefined{if(v&&typeof v==='object'){const r=v as Record<string,unknown>;return text(r.name??r.title??r.label??r.value);}if(typeof v!=='string'&&typeof v!=='number')return;const clean=load('<span>'+String(v)+'</span>')('body').text().replace(/\s+/g,' ').trim();return clean&&clean.length<=250&&!/^\d{12}$/.test(clean)?clean:undefined;}
  const result:StudentProfile={};const name=text(own.full_name??own.fullName??own.fio??own.name)??[text(own.last_name??own.lastName),text(own.first_name??own.firstName),text(own.middle_name??own.middleName)].filter(Boolean).join(' ');
  if(name)result.name=name;const group=text(own.group_name??own.groupName??own.group??own.study_group);if(group)result.group=group;const course=text(own.course??own.course_number);if(course)result.course=course;const specialty=text(own.specialty??own.speciality??own.specialty_name);if(specialty)result.specialty=specialty;return result;
}
class SmartNationClient {
  profile:StudentProfile={};
  private accessToken?:string;
  private renewing?:Promise<void>;
  constructor(public session:UpstreamSession,private fetcher:typeof fetch=fetch){}
  async request(path:string,options:RequestInit={},hop=0):Promise<{html:string;url:string;status:number;json?:Record<string,unknown>}> {
    if(hop>4)throw new SyncError('SmartNation возвращает слишком много перенаправлений.');
    const url=safeURL(path),headers=new Headers(options.headers);
    headers.set('Cookie',Object.entries(this.session.cookies).map(([key,value])=>`${key}=${value}`).join('; '));headers.set('Accept-Language','ru');headers.set('User-Agent','AITU-College-Grade-Sync/1.0');
    for(const [key,value]of Object.entries(this.session.context||{}))headers.set(key,value);
    if(this.accessToken||this.session.token)headers.set('Authorization','Bearer '+(this.accessToken||this.session.token));
    if(options.method&&options.method!=='GET'){headers.set('Origin',ORIGIN);headers.set('Referer',SMARTNATION_LOGIN);if(this.session.csrf)headers.set('X-CSRF-TOKEN',this.session.csrf);}
    let response:Response;
    try{response=await this.fetcher(url,{...options,headers,redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw new SyncError('SmartNation не ответил. Ваши оценки сохранены; доступен быстрый импорт.',504);}
    for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],index=pair.indexOf('=');if(index>0)this.session.cookies[pair.slice(0,index)]=pair.slice(index+1);}
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new SyncError('Неизвестный ответ SmartNation.');return this.request(safeURL(new URL(location,url).href).href,{},hop+1);}
    if(response.status===403||response.status===429)throw new SyncError('SmartNation ограничил прямое подключение. Откройте кабинет и используйте «Быстрый импорт».',response.status===429?429:502);
    if(Number(response.headers.get('content-length')||0)>4000000)throw new SyncError('Журнал слишком большой. Импортируйте выгрузку за семестр.');
    const html=await response.text();if(html.length>4000000)throw new SyncError('Слишком большой ответ SmartNation.');
    const config=coreConfiguration(html);this.profile={...this.profile,...parseStudentProfile(config)};if(typeof config.csrfToken==='string')this.session.csrf=config.csrfToken;
    for(const [key,header]of Object.entries({organizationId:'X-Organization-Id',roleKey:'X-Role-Key',locality:'X-LocalityId',department:'X-DepartmentId',region:'X-RegionId'})){const value=config[key];if(value&&(typeof value==='string'||typeof value==='number')&&String(value).length<=120&&!/[\r\n]/.test(String(value))){this.session.context||={};this.session.context[header]=String(value);}}
    let json:Record<string,unknown>|undefined;try{const result=JSON.parse(html);if(result&&typeof result==='object')json=result;}catch{}
    return {html,url:url.href,status:response.status,json};
  }
  async ajax(path:string,retry=true):ReturnType<SmartNationClient['request']>{
    const result=await this.request(path,{headers:{Accept:'application/json, text/html','X-Requested-With':'XMLHttpRequest','X-RegionId':this.session.context?.['X-RegionId']||'12'}});
    if(result.status===401&&retry){await this.renewAccessToken();return this.ajax(path,false);}return result;
  }
  renewAccessToken(){if(!this.renewing)this.renewing=this.request(ORIGIN+'/auth/token',{method:'POST',headers:{Accept:'application/json','X-Requested-With':'XMLHttpRequest','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams()}).then(renewed=>{const token=renewed.json?.access_token;if(renewed.status>=400||typeof token!=='string')throw new SyncError('Сессия SmartNation завершена. Войдите заново.',401);this.accessToken=token;this.session.token=token;}).finally(()=>{this.renewing=undefined;});return this.renewing;}
  async data(path:string){const result=await this.ajax(path);if(result.status===401)throw new SyncError('Сессия SmartNation завершена. Войдите заново.',401);if(!result.json||result.status>=400)throw new SyncError('Не удалось прочитать журнал. Используйте быстрый импорт.');return (result.json.data&&!Array.isArray(result.json.data)&&typeof result.json.data==='object'?result.json.data:result.json) as Record<string,unknown>;}
}
function apiConfiguration(html:string){const $=load(html);let config:Record<string,string>|null=null,journalId='';$('*').each((_,element)=>{if(!('attribs' in element))return;for(const [name,value]of Object.entries(element.attribs)){if(name===':api-config'||name==='v-bind:api-config'){try{config=JSON.parse(value);}catch{}}if(name===':journal-id'||name==='journal-id')journalId=value;}});return {config:config as Record<string,string>|null,journalId};}
export function parseJournalList(html:string,base=SMARTNATION_JOURNALS){
  const $=load(html),journals=new Map<string,{url:string;name:string;teacher:string}>();let home='',next='';
  $('a[href]').each((_,anchor)=>{let url:URL;try{url=safeURL(new URL($(anchor).attr('href')||'',base).href);}catch{return;}
    if(!/^\/(?:ru|kz|en)\/[a-z0-9_-]+\/control\/journals(?:\/\d+)?\/?$/.test(url.pathname))return;
    const row=$(anchor).closest('tr');
    if(/\/journals\/\d+\/?$/.test(url.pathname)&&row.length){url.hash='';const cells=row.find('td').toArray().map(c=>$(c).text().replace(/\s+/g,' ').trim());journals.set(url.href,{url:url.href,name:(cells.at(-3)||'').replace(/^Дисциплина\s*/,''),teacher:(cells.at(-2)||'').replace(/^Преподаватель\s*/,'' )});}
    else if(!/\/journals\/\d+/.test(url.pathname)){const context=new URL(base).pathname.split('/').slice(0,3).join('/');if(!url.search&&(!home||url.pathname.startsWith(context+'/')))home=url.href;const current=Number(new URL(base).searchParams.get('page')||1);if($(anchor).attr('rel')?.split(/\s+/).includes('next')||Number(url.searchParams.get('page'))===current+1)next=url.href;}
  });
  return {journals:[...journals.values()],home,next};
}
export function parseJournalListData(payload:Record<string,unknown>,base:string){
  const rows=Array.isArray(payload.data)?payload.data:Array.isArray(payload.rows)?payload.rows:[];
  const meta=payload.meta&&typeof payload.meta==='object'?payload.meta as Record<string,unknown>:{};
  const columns=(Array.isArray(payload.cols)?payload.cols:Array.isArray(meta.columns)?meta.columns:[]).flat(2).filter(v=>v&&typeof v==='object') as Record<string,unknown>[];
  const text=(value:unknown,depth=0):string=>{if(depth>5||value===null||value===undefined)return '';if(typeof value==='string'||typeof value==='number')return load('<span>'+String(value)+'</span>')('body').text().replace(/\s+/g,' ').trim();if(Array.isArray(value))return value.slice(0,15).map(v=>text(v,depth+1)).filter(Boolean).join(', ');if(typeof value==='object'){const obj=value as Record<string,unknown>;for(const key of ['value','label','text','name','title','fullName','full_name','fio'])if(obj[key]!==undefined)return text(obj[key],depth+1);}return '';};
  const field=(pattern:RegExp,fallback:string)=>{const column=columns.find(c=>pattern.test(text(c.label)));return String(column?.attribute||column?.name||fallback);};
  const read=(row:Record<string,unknown>,path:string):unknown=>{let values:unknown[]=[row];for(const key of path.split('.'))values=values.flatMap(value=>key==='*'?Array.isArray(value)?value:[]:value&&typeof value==='object'?[(value as Record<string,unknown>)[key]]:[]);return values.length===1?values[0]:values;};
  const subjectKey=field(/Дисциплин|Предмет|discipline|subject|Пән/i,'discipline'),teacherKey=field(/Преподавател|teacher|оқытушы/i,'teacher');
  const journals:{url:string;name:string;teacher:string}[]=[];
  for(const raw of rows.slice(0,100)){if(!raw||typeof raw!=='object')continue;const row=raw as Record<string,unknown>,strings:string[]=[];let visited=0;
    function walk(value:unknown,depth=0){if(depth>7||visited++>2000)return;if(typeof value==='string'){strings.push(value);}else if(value&&typeof value==='object')for(const child of Object.values(value))walk(child,depth+1);}
    walk(row);let url='';for(const value of strings){const candidates=value.includes('<')?load(value)('a[href]').toArray().map(e=>load(value)(e).attr('href')||''):[value];for(const candidate of candidates){try{const target=safeURL(new URL(candidate,base).href);if(/^\/(?:ru|kz|en)\/[a-z0-9_-]+\/control\/journals\/\d+\/?$/.test(target.pathname)){target.hash='';url=target.href;break;}}catch{}}if(url)break;}
    if(url)journals.push({url,name:text(read(row,subjectKey))||text(row.subject??row.name),teacher:text(read(row,teacherKey))||text(row.teachers)});
  }
  const links=payload.links&&typeof payload.links==='object'?payload.links as Record<string,unknown>:{};let next='';if(typeof links.next==='string'){try{const target=safeURL(new URL(links.next,base).href);if(target.pathname===new URL(base).pathname)next=target.href;}catch{}}
  return {journals,home:'',next};
}
export function parseJournalPayload(payload:Record<string,unknown>,students:Record<string,unknown>,name:string,teacher:string,id:string):GradeSubject {
  if(payload.isStudent!==true)throw new SyncError('Подключение доступно для личного кабинета студента. Используйте индивидуальную выгрузку.',403);
  const people=students.students;if(!Array.isArray(people)||people.length!==1)throw new SyncError('Не удалось однозначно выбрать личные оценки. Используйте быстрый импорт.');
  const person=people[0] as Record<string,unknown>,days=payload.days;
  if(!Array.isArray(days))throw new SyncError('Формат журнала изменился. Используйте быстрый импорт.');
  const grades:{value:number;date?:string;kind?:string;sourceId:string}[]=[];
  for(const raw of days){const day=raw as Record<string,unknown>;const points=(day.points||{}) as Record<string,unknown>;const entry=points[String(person.id)];const point=entry&&typeof entry==='object'?entry as Record<string,unknown>:null;
    if(!point||point.absented||point.point===null||point.point===''||point.point===undefined)continue;
    const value=Number(point.point);if(!Number.isFinite(value))continue;grades.push({value,date:dateValue(day.date??day.fullDate??day.label),kind:typeof point.type_label==='string'?point.type_label:typeof day.type_label==='string'?day.type_label:typeof point.type==='string'?point.type:typeof day.type==='string'?day.type:undefined,sourceId:String(day.id??day.date??day.label??grades.length)});
  }
  const subject=parseGradeJSON([{name,teacher,scale:payload.typeOfEvaluation==='percent'?100:5,grades}]).subjects[0];return {...subject,id,grades:subject.grades.map((g,i)=>({...g,id:id+':'+grades[i].sourceId,kind:grades[i].kind}))};
}
export function parseJournalTeacher(info:Record<string,unknown>):string{
  const entry=Object.entries(info).find(([key,value])=>/teacher|преподавател/i.test(key)||value&&typeof value==='object'&&/teacher|преподавател|оқытушы/i.test(String((value as Record<string,unknown>).label||'')));
  function text(value:unknown,depth=0):string{if(depth>4||value===null||value===undefined)return '';if(typeof value==='string')return load('<span>'+value.replace(/<br\s*\/?>/gi,', ')+'</span>')('body').text().replace(/\s+/g,' ').replace(/\s*\(\d+(?:[.,]\d+)?\)\s*$/,'').trim();if(Array.isArray(value))return value.map(v=>text(v,depth+1)).filter(Boolean).join(', ');if(typeof value==='object'){const item=value as Record<string,unknown>;return text(item.value??item.name??item.full_name??item.fullName??item.text,depth+1);}return '';}
  return entry?text(entry[1]):'';
}
async function syncJournals(client:SmartNationClient):Promise<GradeSnapshot>{
  const journals=new Map<string,{url:string;name:string;teacher:string}>();
  let address=client.session.journalsURL||SMARTNATION_JOURNALS;
  for(let page=1;page<=7;page++){
    let result=await client.request(address);
    if(coreConfiguration(result.html).isAuth===false&&client.session.token){await client.renewAccessToken();result=await client.request(address);}
    if(/\/login(?:\?|$)/.test(result.url)||result.html.includes('<v-login-form'))throw new SyncError('Сессия SmartNation завершена. Войдите заново.',401);
    let parsed=result.json?parseJournalListData(result.json,result.url):parseJournalList(result.html,result.url);
    if(!parsed.journals.length){const $=load(result.html);let endpoint=$('[uri-get-items]').first().attr('uri-get-items')||'';if(!endpoint)$('*').each((_,e)=>{if(!('attribs'in e))return;for(const [key,value]of Object.entries(e.attribs))if(key===':uri-get-items'||key==='v-bind:uri-get-items'){if(value.startsWith("'")&&value.endsWith("'"))endpoint=value.slice(1,-1);else{try{const literal=JSON.parse(value);if(typeof literal==='string')endpoint=literal;}catch{}}}});const ajax=await client.ajax(new URL(endpoint||result.url,result.url).href);if(ajax.json)parsed=parseJournalListData(ajax.json,ajax.url);const fragments=[ajax.html,...Object.values(ajax.json||{}).filter((v):v is string=>typeof v==='string'&&v.includes('<'))];for(const fragment of fragments){const table=parseJournalList(fragment,ajax.url);if(table.journals.length){parsed=table;break;}}if(parsed.journals.length)result=ajax;else console.warn('smartnation-list-ajax',JSON.stringify({status:ajax.status,path:new URL(ajax.url).pathname.replace(/\d{4,}/g,':id'),keys:Object.keys(ajax.json||{}),rowKeys:Array.isArray(ajax.json?.data)&&ajax.json.data[0]?Object.keys(ajax.json.data[0]):[],html:ajax.html.includes('<table')}));}
    if(!parsed.journals.length&&parsed.home&&new URL(parsed.home).pathname!==new URL(result.url).pathname){result=await client.request(parsed.home);parsed=parseJournalList(result.html,result.url);}
    if(!parsed.journals.length&&!journals.size){const $=load(result.html),components=new Set<string>();$('*').each((_,e)=>{if('tagName'in e&&e.tagName.startsWith('v-'))components.add(e.tagName);});console.warn('smartnation-list-unavailable',JSON.stringify({status:result.status,path:new URL(result.url).pathname.replace(/\d{4,}/g,':id'),tables:$('table').length,anchors:$('a[href]').length,isAuth:result.html.match(/"isAuth"\s*:\s*(true|false)/)?.[1]||'unknown',json:Boolean(result.json),components:[...components]}));}
    let found=0;for(const journal of parsed.journals)if(!journals.has(journal.url)){journals.set(journal.url,journal);found++;}
    if(!found||!parsed.next)break;address=parsed.next;
  }
  if(!journals.size)throw new SyncError('Журналы не найдены. Проверьте кабинет или используйте быстрый импорт.');
  const subjects:GradeSubject[]=[],warnings:string[]=[];
  // Small parallel batches keep the UI responsive without flooding the college portal.
  const list=[...journals.values()];
  for(let offset=0;offset<list.length;offset+=3){const batch=await Promise.all(list.slice(offset,offset+3).map(async journal=>{
    const page=await client.request(journal.url);const {config,journalId}=apiConfiguration(page.html);
    if(!config?.mainTable||!config.students){try{return parseGradeText(load(page.html)('body').text()).subjects[0];}catch{throw new SyncError('Вёрстка SmartNation изменилась. Доступен быстрый импорт.');}}
    const url=config.mainTable.replace(/:journalId|\{journalId\}/g,journalId);
    const main=new URL(url,ORIGIN);main.searchParams.delete('year_month');
    const [payload,students,info]=await Promise.all([client.data(main.href),client.data(config.students.replace(/:journalId|\{journalId\}/g,journalId)),(!journal.teacher||!client.profile.group||!client.profile.specialty)&&config.infoTable?client.data(config.infoTable.replace(/:journalId|\{journalId\}/g,journalId)).catch(()=>null):Promise.resolve(null)]);
    if(payload.isStudent===true&&Array.isArray(students.students)&&students.students.length===1&&!client.session.owner&&(typeof students.students[0].id==='string'||typeof students.students[0].id==='number')&&String(students.students[0].id).length>0)client.session.owner=smartNationOwner(client.session)||createHmac('sha256',secret()).update('smartnation-student:'+String(client.session.context?.['X-Organization-Id']||'')+':'+String(students.students[0].id)).digest('base64url');
    if(payload.isStudent===true&&Array.isArray(students.students)&&students.students.length===1)client.profile={...client.profile,...parseStudentProfile({student:{group:info?.group??info?.group_name,course:info?.course,specialty:info?.specialty??info?.speciality}}),...parseStudentProfile({student:students.students[0]})};
    // Current semester for non-modular journals, all available months for modular journals.
    let activePayload=payload;
    if(!payload.isModule&&payload.currentSemester){main.searchParams.set('semester',String(payload.currentSemester));activePayload=await client.data(main.href);}
    return parseJournalPayload(activePayload,students,journal.name||`Журнал ${journalId}`,journal.teacher||(info?parseJournalTeacher(info):''),`smartnation-${journalId}`);
  }));subjects.push(...batch);}
  if(!subjects.some(s=>s.grades.length))warnings.push('Журналы найдены, но числовых оценок пока нет.');
  return {version:1,source:'smartnation',profile:client.profile,syncedAt:new Date().toISOString(),subjects,warnings};
}
export async function loginAndSync(login:string,password:string,remember:boolean,fetcher:typeof fetch=fetch){
  const session:UpstreamSession={cookies:{},expires:Date.now()+(remember?7*86400000:8*3600000),remember};secret();
  const client=new SmartNationClient(session,fetcher),page=await client.request(SMARTNATION_LOGIN);
  const token=page.html.match(/"csrfToken"\s*:\s*"([^"]+)"/)?.[1]||load(page.html)('meta[name="csrf-token"]').attr('content');
  if(!token)throw new SyncError('SmartNation не предоставил форму входа. Используйте быстрый импорт.');session.csrf=token;
  const type=/^\d{12}$/.test(login)?'iin':login.includes('@')?'email':'login';
  const body=new URLSearchParams({password,type,[type]:login});
  const result=await client.request(SMARTNATION_LOGIN,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json','X-Requested-With':'XMLHttpRequest','X-RegionId':'12'},body});
  if(result.status>=400||result.json?.error||result.json?.errors)throw new SyncError('Не удалось войти. Проверьте логин и пароль; при дополнительной проверке используйте быстрый импорт.',401);
  // Follow only a verified same-portal redirect from the login response.
  if(typeof result.json?.redirect==='string'){const landing=await client.request(safeURL(result.json.redirect).href);const home=parseJournalList(landing.html,landing.url).home;if(home)session.journalsURL=home;}
  try{await client.renewAccessToken();return {snapshot:await syncJournals(client),session};}catch(error){if(error instanceof SyncError&&error.status!==401)error.session=session;throw error;}
}
export async function refreshSmartNationSession(session:UpstreamSession,fetcher:typeof fetch=fetch){const client=new SmartNationClient(session,fetcher);try{let renew=!session.token;if(session.token){try{const payload=JSON.parse(Buffer.from(session.token.split('.')[1],'base64url').toString('utf8'));renew=typeof payload.exp==='number'&&payload.exp*1000<Date.now()+60000;}catch{}}if(renew)await client.renewAccessToken();return {snapshot:await syncJournals(client),session};}catch(error){if(error instanceof SyncError&&error.status!==401)error.session=session;throw error;}}

export function refreshSmartNation(request:Request){return refreshSmartNationSession(readSmartNationSession(request));}
