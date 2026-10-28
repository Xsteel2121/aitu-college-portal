export type GradeScale = 100 | 5;
export type Grade = {id:string;date?:string;kind?:string} & ({value:number;absence?:false}|{value:null;absence:true});
export function numericGrade(grade:Grade):grade is Grade & {value:number;absence?:false}{return grade.absence!==true&&typeof grade.value==='number';}
export function gradeValues(subject:GradeSubject){return subject.grades.filter(numericGrade).map(g=>g.value);}
export interface GradeSubject { id:string; name:string; teacher:string; scale:GradeScale; grades:Grade[]; }
export interface StudentProfile {name?:string;group?:string;course?:string;specialty?:string;}
export interface GradeSnapshot {unavailableSubjectIds?:string[];profile?:StudentProfile; version:1; source:'smartnation'|'import'|'demo'; syncedAt:string; subjects:GradeSubject[]; warnings:string[]; }
export type GradeTone = 'excellent'|'good'|'attention'|'risk'|'empty';
export function average(values:number[]) { return values.length?values.reduce((a,b)=>a+b,0)/values.length:null; }
export function subjectAverage(subject:GradeSubject, virtual:number[] = []) { return average([...gradeValues(subject),...virtual]); }
export function gradeTone(value:number|null, scale:GradeScale):GradeTone {
  if(value===null)return 'empty';
  return scale===100?value>=90?'excellent':value>=75?'good':value>=50?'attention':'risk':value>=4.5?'excellent':value>=3.5?'good':value>=2.5?'attention':'risk';
}
export const toneLabel:Record<GradeTone,string> = {excellent:'Отлично',good:'Хорошо',attention:'Есть куда расти',risk:'Зона риска',empty:'Пока нет оценок'};
// A display convention, not an official transcript conversion or a credit-weighted GPA.
export function convertGrade(value:number, from:GradeScale, to:GradeScale) {
  if(from===to)return value;
  if(to===100)return value*20;
  return value>=90?5:value>=75?4:value>=50?3:2;
}
export function overallAverage(subjects:GradeSubject[],scale:GradeScale,virtual:Record<string,number[]> = {}) {
  return average(subjects.flatMap(subject=>{const value=subjectAverage(subject,virtual[subject.id]);return value===null?[]:[convertGrade(value,subject.scale,scale)];}));
}
export function improvementHint(subject:GradeSubject, virtual:number[] = []) {
  const values=[...gradeValues(subject),...virtual], max=subject.scale, value=average(values);
  if(value===null)return 'Первая оценка появится здесь после импорта.';
  const thresholds=subject.scale===100?[50,75,90]:[2.5,3.5,4.5];
  const target=thresholds.find(t=>value<t);
  if(!target)return 'Отличный результат. Держите этот темп.';
  const sum=values.reduce((a,b)=>a+b,0), needed=target*(values.length+1)-sum;
  const label=subject.scale===100?`${target}%`:`${target.toFixed(1)} из 5`;
  if(needed<=max){const next=Math.max(subject.scale===100?0:2,Math.ceil((needed-1e-9)*100)/100);return `До среднего ${label}: следующая оценка от ${Number(next.toFixed(2))}.`;}
  const count=Math.ceil((target*values.length-sum)/(max-target)-1e-9);
  return `До среднего ${label}: ещё ${count} ${count===1?'оценка':count<5?'оценки':'оценок'} по ${max}.`;
}
export function disputed(subject:GradeSubject,virtual:number[] = []) {
  const value=subjectAverage(subject,virtual);if(value===null)return false;
  return (subject.scale===100?[50,75,90]:[2.5,3.5,4.5]).some(t=>value<t&&t-value<=(subject.scale===100?5:0.3));
}
export function validSnapshot(input:unknown):input is GradeSnapshot {
  if(!input||typeof input!=='object')return false;
  const data=input as GradeSnapshot;
  return (data.unavailableSubjectIds===undefined||Array.isArray(data.unavailableSubjectIds)&&data.unavailableSubjectIds.length<=100&&data.unavailableSubjectIds.every(id=>typeof id==='string'&&/^smartnation-\d+$/.test(id)))&&(data.profile===undefined||data.profile&&typeof data.profile==='object'&&['name','group','course','specialty'].every(k=>{const v=data.profile![k as keyof StudentProfile];return v===undefined||typeof v==='string'&&v.length<=250;}))&&data.version===1&&['smartnation','import','demo'].includes(data.source)&&Number.isFinite(Date.parse(data.syncedAt))&&Array.isArray(data.warnings)&&data.warnings.every(x=>typeof x==='string')&&Array.isArray(data.subjects)&&data.subjects.length>0&&data.subjects.length<=100&&data.subjects.every(s=>s&&typeof s.id==='string'&&typeof s.name==='string'&&s.name.length>0&&s.name.length<=250&&typeof s.teacher==='string'&&[5,100].includes(s.scale)&&Array.isArray(s.grades)&&s.grades.length<=500&&s.grades.every(g=>g&&typeof g.id==='string'&&(g.absence===true?g.value===null:(g.absence===undefined||g.absence===false)&&typeof g.value==='number'&&Number.isFinite(g.value)&&g.value>=(s.scale===5?2:0)&&g.value<=s.scale)&&(g.date===undefined||typeof g.date==='string')&&(g.kind===undefined||typeof g.kind==='string'&&g.kind.length<=100)))&&new Set(data.subjects.map(s=>s.id)).size===data.subjects.length;
}
export function demoSnapshot():GradeSnapshot {
  const entries:[string,string,number[]][]=[['Математика','Буланова Р.К.',[82,88,91,85]],['Информатика','Талдаубек А.',[95,98,100,92]],['Қазақ тілі','Далелова Г.С.',[88,90,87]],['Физика','Шарипов А.К.',[70,74,72,78]],['Ағылшын тілі','Камбарова Р.Ж.',[90,94,92]],['Химия','Абдилова Д.Р.',[42,50,45]],['Қазақстан тарихы','Ибраева М.Б.',[80,85,89]],['Биология','Карипжанова А.З.',[95,91,96]]];
  return {profile:{name:'Студент AITU',group:'БҚ2604',course:'1',specialty:'Программное обеспечение'},version:1,source:'demo',syncedAt:new Date().toISOString(),warnings:[],subjects:entries.map(([name,teacher,values],i)=>({id:`demo-${i}`,name,teacher,scale:100,grades:[...values.map((value,j)=>({id:`demo-${i}-${j}`,value,date:`2026-10-${String(2+j*4).padStart(2,'0')}`})),...(i===3||i===7?[{id:`demo-${i}-absence`,value:null,absence:true as const,date:'2026-10-20'}]:[])]}))};
}

// Only use when refreshing the same connected account, never when signing into a different one.
export function retainUnavailableSubjects(previous:GradeSnapshot|null,next:GradeSnapshot):GradeSnapshot {
  if(!previous||previous.source!=='smartnation'||!next.unavailableSubjectIds?.length)return next;
  const retained=previous.subjects.filter(s=>next.unavailableSubjectIds!.includes(s.id)&&!next.subjects.some(n=>n.id===s.id));
  if(!retained.length)return next;
  return {...next,subjects:[...next.subjects,...retained],warnings:[...next.warnings,'Для недоступных журналов оставлены оценки с предыдущей синхронизации.']};
}
