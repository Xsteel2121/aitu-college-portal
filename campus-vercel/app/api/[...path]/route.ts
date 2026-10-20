const backend = process.env.CAMPUS_API_URL || 'https://aitu-campus-schedule.qejrjdjjd.chatgpt.site';
export const dynamic = 'force-dynamic';
async function proxy(request:Request,{params}:{params:Promise<{path:string[]}>}) {
  const {path}=await params;
  if(!['homework','calendar','push','moderator','attachments'].includes(path[0])||path.length>2)return Response.json({error:'Маршрут не найден'},{status:404});
  if(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Недопустимый источник запроса'},{status:403});
  const limit=path[0]==='attachments'?4*1024*1024+16384:16000;
  if(Number(request.headers.get('content-length')||0)>limit)return Response.json({error:'Слишком длинный запрос'},{status:413});
  const url=new URL('/api/'+path.map(encodeURIComponent).join('/'),backend);url.search=new URL(request.url).search;
  const headers=new Headers({'Origin':new URL(backend).origin,'Content-Type':request.headers.get('content-type')||'application/json'});
  if(request.headers.get('cookie'))headers.set('Cookie',request.headers.get('cookie')!);
  if(process.env.BACKEND_PROXY_SECRET){
    headers.set('x-campus-proxy',process.env.BACKEND_PROXY_SECRET);
    // Vercel overwrites this platform header; never trust the caller's forwarding header.
    const clientIp=request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim();
    if(clientIp)headers.set('x-campus-client-ip',clientIp);
  }
  try{const text=request.method==='GET'?undefined:await request.arrayBuffer();if(text&&text.byteLength>limit)return Response.json({error:'Слишком длинный запрос'},{status:413});
    const response=await fetch(url,{method:request.method,headers,body:text,cache:'no-store',signal:AbortSignal.timeout(45000),redirect:'error'});
    const outputHeaders=new Headers({'Content-Type':response.headers.get('content-type')||'application/json','Cache-Control':'private,no-store'});
    for(const cookie of response.headers.getSetCookie())outputHeaders.append('Set-Cookie',cookie);
    for(const key of ['x-content-type-options','content-security-policy','content-length'])if(response.headers.has(key))outputHeaders.set(key,response.headers.get(key)!);
    if(response.headers.has('content-disposition'))outputHeaders.set('Content-Disposition',response.headers.get('content-disposition')!);
    return new Response(response.body,{status:response.status,headers:outputHeaders});
  }catch{return Response.json({error:'Хранилище временно недоступно. Повторите запрос.'},{status:503});}
}
export {proxy as GET,proxy as POST,proxy as PATCH,proxy as DELETE};
