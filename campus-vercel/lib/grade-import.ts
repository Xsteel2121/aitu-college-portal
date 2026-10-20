import type {Grade,GradeScale,GradeSnapshot,GradeSubject} from './grades';
export type ScaleChoice = GradeScale|'auto';
const clean=(value:unknown)=>String(value??'').replace(/\u00a0/g,' ').trim();
const datePattern=/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)\b/g;
const ignore=/^(?:средн(?:ий|ее)|итог|GPA|балл|оценк|предмет|дисциплина|преподаватель|дата|период|семестр|название|количество|отведено|тип|модул|группа|операции|copyright|контакт|пароль|логин|ИИН|запомнить|номер|№|учебный год|страниц|всего)/i;
function numbers(text:string,decimalComma=false) {
  const normalized=decimalComma&&/^\s*\d{1,3},\d{1,2}\s*$/.test(text)?text.replace(',','.'):text.replace(/,/g,' ');
  return (normalized.replace(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/g,' ').match(/(?<![\p{L}\d])(?:100|\d{1,2})(?:\.\d{1,2})?(?![\p{L}\d])/gu)||[]).map(Number).filter(v=>Number.isFinite(v)&&v>=0&&v<=100);
}
function infer(values:number[],choice:ScaleChoice):GradeScale {return choice==='auto'?(values.length>0&&values.every(v=>Number.isInteger(v)&&v>=2&&v<=5)?5:100):choice;}
export function dateValue(input:unknown):string|undefined {
  if(input instanceof Date)return Number.isFinite(input.getTime())?input.toISOString().slice(0,10):undefined;
  const text=clean(input), match=text.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/);
  let value=text;
  if(match){let year=match[3]||String(new Date().getFullYear());if(year.length===2)year='20'+year;value=`${year}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
  const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:undefined;
}
function finish(subjects:GradeSubject[],warnings:string[]=[]):GradeSnapshot {
  if(!subjects.length)throw new Error('Не найдены предметы с оценками. Вставьте таблицу журнала или загрузите CSV / XLSX / JSON.');
  if(subjects.length>100)throw new Error('В одном импорте может быть до 100 предметов.');
  if(!subjects.some(s=>s.grades.length))warnings.push('Найдены названия предметов, но нет числовых оценок. Откройте сам журнал, а не список журналов.');
  return {version:1,source:'import',syncedAt:new Date().toISOString(),subjects,warnings};
}
function makeSubject(name:string,teacher:string,raw:{value:number;date?:string}[],choice:ScaleChoice,index:number):GradeSubject {
  const scale=infer(raw.map(g=>g.value),choice);
  if(raw.some(g=>g.value<(scale===5?2:0)||g.value>scale))throw new Error(`«${name}»: оценки не соответствуют выбранной шкале ${scale}.`);
  if(raw.length>500)throw new Error(`«${name}»: больше 500 оценок. Разделите выгрузку по семестрам.`);
  return {id:`import-${index}`,name:name.slice(0,250),teacher:teacher.slice(0,250),scale,grades:raw.map((g,j)=>({id:`import-${index}-${j}`,...g}))};
}
export function parseDelimited(text:string):string[][] {
  const first=text.split(/\r?\n/).find(l=>l.trim())||'';
  const delimiter=['\t',';',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows:string[][]=[], row:string[]=[];let cell='',quoted=false;
  for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(char===delimiter&&!quoted){row.push(cell);cell='';}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push([...row]);row.length=0;cell='';}else cell+=char;}
  if(quoted)throw new Error('В CSV не закрыта кавычка. Проверьте файл.');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function parseGradeRows(rows:unknown[][],choice:ScaleChoice='auto'):GradeSnapshot {
  if(rows.length>10000)throw new Error('Слишком большая таблица: до 10 000 строк.');
  const headerIndex=rows.slice(0,30).findIndex(row=>row.some(c=>/^(предмет|дисциплина|subject|discipline|пән)$/i.test(clean(c))));
  const header=headerIndex>=0?rows[headerIndex].map(clean):[];
  const nameIndex=header.findIndex(c=>/^(предмет|дисциплина|subject|discipline|пән)$/i.test(c));
  const teacherIndex=header.findIndex(c=>/преподаватель|teacher|оқытушы/i.test(c));
  const dateIndex=header.findIndex(c=>/^(дата|date|күні)$/i.test(c));
  const valueIndex=header.findIndex(c=>/^(оценк[аи]|балл[ы]?|grade[s]?|mark[s]?|score[s]?|баға)$/i.test(c));
  const scaleIndex=header.findIndex(c=>/^(scale|шкала)$/i.test(c));
  const items=new Map<string,{name:string;teacher:string;values:{value:number;date?:string}[];scale:ScaleChoice}>();
  for(const row of rows.slice(headerIndex>=0?headerIndex+1:0)){
    const name=clean(row[nameIndex>=0?nameIndex:0]);if(!name||ignore.test(name)||!/[\p{L}]/u.test(name))continue;
    const teacher=teacherIndex>=0?clean(row[teacherIndex]):'';
    const key=name.toLowerCase()+'|'+teacher.toLowerCase();
    const forcedScale=scaleIndex>=0&&[5,100].includes(Number(row[scaleIndex]))?Number(row[scaleIndex]) as GradeScale:choice;
    const current=items.get(key)||{name,teacher,values:[],scale:forcedScale};
    const gradeCells=valueIndex>=0?[{value:row[valueIndex],index:valueIndex}]:row.map((value,index)=>({value,index})).filter(c=>c.index>(nameIndex>=0?nameIndex:0)&&c.index!==teacherIndex&&c.index!==dateIndex&&c.index!==scaleIndex&&(!header.length||dateValue(header[c.index])||/^оценк|grade|балл/i.test(header[c.index]||'')));
    for(const cell of gradeCells){const text=clean(cell.value);if(!text||cell.value instanceof Date||/^\d{4}-\d{2}-\d{2}$|^\d{1,2}[./]\d{1,2}[./]\d{2,4}$/.test(text))continue;for(const value of numbers(text,true))current.values.push({value,date:dateIndex>=0?dateValue(row[dateIndex]):dateValue(header[cell.index])});}
    items.set(key,current);
  }
  return finish([...items.values()].map((item,i)=>makeSubject(item.name,item.teacher,item.values,item.scale,i)));
}
export function parseGradeJSON(value:unknown,choice:ScaleChoice='auto'):GradeSnapshot {
  const root=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
  const list=Array.isArray(value)?value:root?.subjects??root?.disciplines??root?.items??root?.data;
  if(!Array.isArray(list))throw new Error('JSON должен содержать массив subjects: название name, преподаватель teacher, оценки grades.');
  const subjects=list.map((entry,index)=>{
    if(!entry||typeof entry!=='object')throw new Error('Некорректная строка в JSON.');
    const row=entry as Record<string,unknown>,name=clean(row.name??row.subject??row.discipline??row['Предмет']);
    if(!name)throw new Error('В JSON у предмета нет названия.');
    const scale=Number(row.scale??root?.scale),raw=row.grades??row.marks??row.scores??[];
    if(!Array.isArray(raw))throw new Error(`«${name}»: grades должен быть массивом.`);
    const grades:Omit<Grade,'id'>[]=raw.flatMap(item=>{const data:Record<string,unknown>=item&&typeof item==='object'?item as Record<string,unknown>:{value:item};const v=data.value??data.grade??data.score;if(v===null||v===''||v===undefined||/^(н|нб|н\/а|absent|н\/б|—|-)$/i.test(String(v)))return [];const n=Number(String(v).replace(',','.'));if(!Number.isFinite(n)||n<0||n>100)throw new Error(`«${name}»: некорректная оценка.`);return [{value:n,date:dateValue(data.date)}];});
    return makeSubject(name,clean(row.teacher??row.teacherName),grades,[5,100].includes(scale)?scale as GradeScale:choice,index);
  });
  return finish(subjects);
}
export function parseGradeText(text:string,choice:ScaleChoice='auto'):GradeSnapshot {
  text=text.replace(/^\uFEFF/,'');if(text.length>1000000)throw new Error('Текст слишком большой. Импортируйте один семестр.');
  if(/^[\s]*[\[{]/.test(text)){try{return parseGradeJSON(JSON.parse(text),choice);}catch(error){if(error instanceof SyntaxError)throw new Error('Некорректный JSON.');throw error;}}
  // SmartNation's individual journal: skip metadata (hours, group IDs) before the actual date/grade table.
  const journalName=text.match(/(?:Журнал\s*[—–-]\s*(?:ООД\s*\d+\s*)?|Предмет\s*[:\t]\s*)([^\n\r]+)/i);
  if(journalName&&/Вид оценки|Отведено часов|Тип журнала/.test(text)){
    const name=(text.match(/Предмет\s*[:\t]?\s*\n?\s*([^\n\r]+)/i)?.[1]||journalName[1]).trim();
    const teacher=(text.match(/Преподаватели?\s*[:\t]?\s*\n?\s*([^\n\r]+)/i)?.[1]||'').replace(/\s*\(\d+(?:[.,]\d+)?\)\s*$/,'');
    const section=text.slice(text.search(/(?:^|\n)\s*(?:№\s*)?Дата(?:\s|$)/i));
    if(!/(?:^|\n)\s*(?:№\s*)?Дата(?:\s|$)/i.test(text))return finish([makeSubject(name,teacher,[],choice,0)],['В скопированном тексте нет таблицы оценок.']);
    const end=section.search(/Типы оценок|Smartnation College|Пользовательское соглашение|ИНСТРУКЦИИ|ТОО «Bilim|Контакты:/i);const marks=(end>=0?section.slice(0,end):section).replace(/(?:^|\n)\s*\d+\s*Оценка\s*/i,'\n').replace(datePattern,' ');
    return finish([makeSubject(name,teacher,numbers(marks).map(value=>({value})),/Процентная система/.test(text)?100:choice,0)],['Импортирован открытый журнал и выбранный в нём месяц. Для всех месяцев выберите «Все месяцы» перед копированием.']);
  }
  if(text.includes('\t')||/^(?:предмет|subject|дисциплина)[;,]/im.test(text))return parseGradeRows(parseDelimited(text),choice);
  const subjects:GradeSubject[]=[];let pendingName='',teacher='';
  for(const original of text.split(/\r?\n/)){
    let line=original.trim();if(!line)continue;
    if(/^(?:преподаватель|teacher)\s*:/i.test(line)){teacher=line.replace(/^[^:]+:\s*/,'');continue;}
    if(ignore.test(line))continue;
    const match=line.match(/^([\p{L}][\p{L}\d\s'"«»()&.,/-]{1,200}?)\s*(?::|\s[—–-]\s|\s{2,})\s*((?:\d|[нН—-]).*)$/u);
    if(match){const vals=numbers(match[2]);if(vals.length)subjects.push(makeSubject(match[1].trim(),teacher,vals.map(value=>({value})),choice,subjects.length));pendingName='';teacher='';continue;}
    if(/^[\d\s,;|.\tнНбБ/—-]+$/.test(line)&&pendingName){const vals=numbers(line);if(vals.length)subjects.push(makeSubject(pendingName,teacher,vals.map(value=>({value})),choice,subjects.length));pendingName='';teacher='';}
    else if(/[\p{L}]/u.test(line)&&line.length<=250&&!/https?:|@|^\+7|Smartnation|Вход|Главная|Служба поддержки/i.test(line))pendingName=line;
  }
  return finish(subjects);
}
