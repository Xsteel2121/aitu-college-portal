import data from "./timetable.json";
import calendar from "./academic-calendar.json";
export const timetable = data;
export const academicCalendar = calendar;
export const groups = data.groups;
export type Group = (typeof groups)[number];
export type Lesson = Group["days"][number][number];
export const weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export const shortDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export function almatyDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function almatyMinute(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  return Number(p.find(x => x.type === "hour")!.value) * 60 + Number(p.find(x => x.type === "minute")!.value);
}
export function weekday(date: string) { return (new Date(`${date}T12:00:00+05:00`).getUTCDay() + 6) % 7; }
export function shiftDate(date: string, count: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10);
}
export function prettyDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
  return new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}
export function minutes(time: string) { const [h, m] = time.split(":").map(Number); return h * 60 + m; }
export function semesterFor(course: number) {
  const cohort = course === 1 ? 0 : course;
  return calendar.periods.find(p => p.course === cohort && p.kind === "semester" && p.title === "I семестр")!;
}
export function courseBreak(date: string, course = 1) {
  const cohort = course === 1 ? 0 : course;
  return calendar.periods.find(p => p.course === cohort && (p.kind === "vacation" || course > 1 && (p.kind === "practice" || p.kind === "exam")) && date >= p.start && date <= p.end);
}
export function holiday(date: string) { return calendar.holidays.find(h => !h.tentative && date >= h.start && date <= h.end); }
export function teachingDate(date: string, course = 1) {
  const semester = semesterFor(course);
  return weekday(date) < 5 && date >= semester.start && date <= semester.end && !courseBreak(date, course) && !holiday(date);
}
export function findGroup(id: string) { return groups.find(g => g.id === id); }
export interface Attachment { id: string; name: string; type: string; size: number; }
export interface Homework {
  id: string; groupId: string; subject: string; body: string; authorName: string;
  assignedDate: string; createdAt: number; done: number; canEdit: boolean;
  status: string; attachments: Attachment[];
}
