import {demoSnapshot,validSnapshot,type GradeSnapshot} from './grades';
import {parseGradeJSON,parseGradeRows,parseGradeText,type ScaleChoice} from './grade-import';
export {loadGradeCache,saveGradeCache,clearGradeCache} from './grade-cache';
export class SmartNationRequestError extends Error{constructor(message:string,public canRetry=false,public status=0,public needsReconnect=false,public hasSession=false){super(message);}}
async function syncRequest(method:string,body?:unknown):Promise<GradeSnapshot>{
  const response=await fetch('/api/smartnation',{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(90000)});
  const data=await response.json();if(!response.ok)throw new SmartNationRequestError(data.error||'Синхронизация недоступна. Попробуйте быстрый импорт.',data.canRetry===true,response.status,data.needsReconnect===true,data.hasSession===true);
  if(!validSnapshot(data.snapshot))throw new Error('SmartNation вернул неизвестный формат. Используйте быстрый импорт.');
  return data.snapshot;
}
export const smartNationSyncService={
  login:(login:string,password:string,remember:boolean)=>syncRequest('POST',{login,password,remember}),
  refresh:()=>syncRequest('PATCH'),
  claimDevice:(code:string,remember:boolean)=>syncRequest('PUT',{action:'claim-device-code',code,remember}),
  createDeviceCode:async()=>{const r=await fetch('/api/smartnation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create-device-code'})}),d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось создать код');return d as {code:string;expiresAt:string};},
  logout:async()=>{const response=await fetch('/api/smartnation',{method:'DELETE'});if(!response.ok)throw new Error('Не удалось завершить сессию. Проверьте соединение и повторите выход.');},
  demo:demoSnapshot,
  parseText:parseGradeText,
  async parseFile(file:File,choice:ScaleChoice='auto'):Promise<GradeSnapshot>{
    if(file.size>8*1024*1024)throw new Error('Выберите файл размером до 8 МБ.');
    const extension=file.name.split('.').at(-1)?.toLowerCase();
    if(extension==='xlsx'){
      const {default:readXlsxFile}=await import('read-excel-file');
      const rows=await readXlsxFile(file);return parseGradeRows(rows,choice);
    }
    if(!['csv','tsv','txt','json'].includes(extension||''))throw new Error('Поддерживаются XLSX, CSV, TSV, TXT и JSON. Старый XLS сохраните как XLSX.');
    const bytes=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(bytes);
    if(text.includes('\uFFFD'))text=new TextDecoder('windows-1251').decode(bytes);
    if(extension==='json'){try{return parseGradeJSON(JSON.parse(text),choice);}catch(error){if(error instanceof SyntaxError)throw new Error('Не удалось прочитать JSON. Проверьте файл.');throw error;}}
    return parseGradeText(text,choice);
  },
};
