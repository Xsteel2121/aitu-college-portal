"use client";
import {useEffect,useRef,useState} from 'react';
import {Download,FileText,ImagePlus,Paperclip,X} from 'lucide-react';
import type {Attachment} from '../lib/campus';
export const maxFileSize=4*1024*1024;
export const acceptedFiles='.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.zip';
export interface DraftFile {id:string;file:File;uploaded?:Attachment}
export function fileSize(size:number){return size<1024*1024?`${Math.max(1,Math.round(size/1024))} КБ`:`${(size/1024/1024).toFixed(1)} МБ`;}
function PhotoPreview({file}:{file:File}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const object=URL.createObjectURL(file);setUrl(object);return()=>URL.revokeObjectURL(object);},[file]);
  return url?<img src={url} alt="" className="draft-photo"/>:<ImagePlus size={22}/>;
}
export function FilePicker({files,setFiles,busy,onError}:{files:DraftFile[];setFiles:(files:DraftFile[])=>void;busy:boolean;onError:(message:string)=>void}) {
  const picker=useRef<HTMLInputElement>(null);
  function choose(list:FileList|null){
    if(!list)return;const chosen=Array.from(list);
    if(files.length+chosen.length>5){onError('Можно прикрепить до пяти файлов к одному заданию.');return;}
    const invalid=chosen.find(file=>!file.size||file.size>maxFileSize||!acceptedFiles.split(',').includes('.'+file.name.split('.').at(-1)?.toLowerCase()));
    if(invalid){onError(`«${invalid.name}»: выберите поддерживаемый файл размером до 4 МБ.`);return;}
    onError('');setFiles([...files,...chosen.map(file=>({id:crypto.randomUUID(),file}))]);
  }
  function remove(id:string){const entry=files.find(file=>file.id===id);setFiles(files.filter(file=>file.id!==id));if(entry?.uploaded)void fetch(`/api/attachments/${id}`,{method:'DELETE'}).catch(()=>{});}
  return <fieldset className="file-picker" disabled={busy}><legend>Фото и документы <span>необязательно</span></legend><input ref={picker} type="file" multiple accept={acceptedFiles} className="visually-hidden" tabIndex={-1} aria-label="Выберите фото или документы" onChange={event=>{choose(event.target.files);event.target.value='';}}/><button type="button" className="attach-button" disabled={busy||files.length===5} onClick={()=>picker.current?.click()}><Paperclip size={19}/>{files.length?'Прикрепить ещё':'Прикрепить фото или файл'}</button><p className="helper-text">До 5 файлов, каждый до 4 МБ. Фото, PDF, Word, Excel, презентации и ZIP.</p>{files.length>0&&<ul className="draft-files">{files.map(entry=><li key={entry.id}>{/^image\/(jpeg|png|webp|gif)$/.test(entry.file.type)?<PhotoPreview file={entry.file}/>:<FileText size={23}/>}<span className="file-description"><strong>{entry.file.name}</strong><small>{fileSize(entry.file.size)}{entry.uploaded?' · загружен':''}</small></span><button type="button" className="icon-button" aria-label={`Убрать ${entry.file.name}`} disabled={busy} onClick={()=>remove(entry.id)}><X size={18}/></button></li>)}</ul>}</fieldset>;
}
export function HomeworkFiles({files}:{files:Attachment[]}) {
  if(!files?.length)return null;
  return <div className="homework-files" aria-label="Вложения задания">{files.map(file=>{
    const url=`/api/attachments/${file.id}`,image=['image/jpeg','image/png','image/webp','image/gif'].includes(file.type);
    return <a key={file.id} className={`attachment-link ${image?'photo-attachment':''}`} href={image?`${url}?view=1`:url} target="_blank" rel="noopener noreferrer" aria-label={`${image?'Открыть фото':'Скачать файл'} ${file.name}`}>{image?<img src={`${url}?view=1`} alt={file.name} loading="lazy"/>:<FileText size={25}/>}<span className="file-description"><strong>{file.name}</strong><small>{fileSize(file.size)} · {image?'Открыть фото':'Скачать'}</small></span><Download size={17}/></a>;
  })}</div>;
}
