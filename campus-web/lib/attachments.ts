import { env } from "cloudflare:workers";
import { db } from "./server";
export const FILE_LIMIT = 4 * 1024 * 1024;
export const FILE_COUNT = 5;
export const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function bucket() { if (!env.BUCKET) throw new Error("File storage unavailable"); return env.BUCKET; }
export function fileInfo(row: Record<string,unknown>) {
  return {id: String(row.id), name: String(row.name), type: String(row.content_type), size: Number(row.size)};
}
export async function withAttachments(items: Record<string,unknown>[]) {
  if (!items.length) return items;
  const ids = items.map(item=>String(item.id));
  const files = await db().prepare(`SELECT id,homework_id,name,content_type,size FROM homework_attachments WHERE ready=1 AND homework_id IN (${ids.map(()=>"?").join(",")}) ORDER BY created_at,id`).bind(...ids).all();
  return items.map(item=>({...item, attachments: files.results.filter(file=>file.homework_id===item.id).map(fileInfo)}));
}
// Verify common binary signatures; never render HTML, SVG, or executable uploads inline.
export function contentType(name: string, bytes: Uint8Array): string | null {
  const extension = name.split('.').at(-1)?.toLowerCase();
  const ascii = (offset:number,length:number)=>String.fromCharCode(...bytes.slice(offset,offset+length));
  if (extension==='jpg'||extension==='jpeg') return bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':null;
  if (extension==='png') return bytes[0]===137&&ascii(1,3)==='PNG'&&bytes[4]===13&&bytes[5]===10?'image/png':null;
  if (extension==='webp') return ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'?'image/webp':null;
  if (extension==='gif') return /^GIF8[79]a$/.test(ascii(0,6))?'image/gif':null;
  if (extension==='heic'||extension==='heif') return ascii(4,4)==='ftyp'&&/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8,4))?'image/heic':null;
  if (extension==='pdf') return ascii(0,5)==='%PDF-'?'application/pdf':null;
  const zipped:Record<string,string>={docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',odt:'application/vnd.oasis.opendocument.text',ods:'application/vnd.oasis.opendocument.spreadsheet',odp:'application/vnd.oasis.opendocument.presentation',zip:'application/zip'};
  if (extension&&zipped[extension]) return ascii(0,2)==='PK'&&bytes[2]===3&&bytes[3]===4?zipped[extension]:null;
  if (['doc','xls','ppt'].includes(extension||'')) return bytes[0]===208&&bytes[1]===207&&bytes[2]===17&&bytes[3]===224?'application/octet-stream':null;
  if (extension==='txt'||extension==='csv') { try { new TextDecoder('utf-8',{fatal:true}).decode(bytes); return bytes.includes(0)?null:extension==='txt'?'text/plain':'text/csv'; } catch { return null; } }
  return null;
}
export async function cleanDraftAttachments() {
  const stale = await db().prepare('SELECT id,storage_key FROM homework_attachments WHERE homework_id IS NULL AND created_at<? LIMIT 20').bind(Date.now()-86400000).all();
  for (const file of stale.results) {
    await bucket().delete(String(file.storage_key));
    await db().prepare('DELETE FROM homework_attachments WHERE id=? AND homework_id IS NULL').bind(file.id).run();
  }
}
