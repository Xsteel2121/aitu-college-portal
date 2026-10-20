import {env} from "cloudflare:workers";
import {findGroup,shiftDate,semesterFor,teachingDate,weekday} from "../../../lib/campus";
const escape=(value:string)=>value.replaceAll("\\","\\\\").replaceAll("\n","\\n").replaceAll(",","\\,").replaceAll(";","\\;");
const stamp=(date:string,time:string)=>new Date(`${date}T${time}:00+05:00`).toISOString().replaceAll("-","").replaceAll(":","").slice(0,15)+"Z";
function fold(line:string){let current="";const result=[];for(const char of line){if(new TextEncoder().encode(current+char).length>73){result.push(current);current=" ";}current+=char;}result.push(current);return result.join("\r\n");}
export async function GET(request:Request){
  const url=new URL(request.url);const group=findGroup(url.searchParams.get("group")??"");if(!group)return new Response("Группа не найдена",{status:400});
  const publicOrigin=env.PUBLIC_SITE_URL||url.origin;const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//AITU College//Timetable//RU","CALSCALE:GREGORIAN","METHOD:PUBLISH",`X-WR-CALNAME:${escape(group.id)} · AITU College`,"X-WR-TIMEZONE:Asia/Almaty"];
  // Concrete dated events avoid platform differences in interpreting recurring alarms.
  const semester=semesterFor(group.course);
  for(let date=semester.start;date<=semester.end;date=shiftDate(date,1)){
    const day=weekday(date);if(!teachingDate(date,group.course))continue;
    for(const lesson of group.days[day]){if(!lesson.start||!lesson.end)continue;
      for(const kind of ["start","end"]){const time=kind==="start"?lesson.start:lesson.end;const title=kind==="start"?lesson.subject:`Конец пары · ${lesson.subject}`;
        lines.push("BEGIN:VEVENT",`UID:${encodeURIComponent(lesson.id)}-${date}-${kind}@campus-aitu`,`DTSTAMP:${stamp("2026-09-01","00:00")}`,`DTSTART:${stamp(date,time)}`,`DTEND:${kind==="start"?stamp(date,lesson.end):new Date(new Date(`${date}T${time}:00+05:00`).getTime()+60000).toISOString().replaceAll("-","").replaceAll(":","").slice(0,15)+"Z"}`,`SUMMARY:${escape(title)}`,`LOCATION:${escape(lesson.room)}`,`DESCRIPTION:${escape(`${group.id} · ${lesson.teacher}\n${lesson.parts.join(" · ")}\n`+publicOrigin)}`,"BEGIN:VALARM","ACTION:DISPLAY",`DESCRIPTION:${escape(title)}`,"TRIGGER:PT0M","END:VALARM","END:VEVENT");
      }
    }
    lines.push("BEGIN:VEVENT",`UID:${encodeURIComponent(group.id)}-${date}-homework@campus-aitu`,`DTSTAMP:${stamp("2026-09-01","00:00")}`,`DTSTART:${stamp(date,"14:30")}`,`DTEND:${stamp(date,"14:31")}`,`SUMMARY:ДЗ за сегодня · ${escape(group.id)}`,`DESCRIPTION:Откройте задания группы на сайте: ${escape(publicOrigin+"/?tab=homework&group="+encodeURIComponent(group.id))}`,"BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:Пора посмотреть домашнее задание","TRIGGER:PT0M","END:VALARM","END:VEVENT");
  }
  lines.push("END:VCALENDAR");return new Response(lines.map(fold).join("\r\n")+"\r\n",{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":"attachment; filename=aitu-college-timetable.ics","Cache-Control":"public,max-age=3600"}});
}
