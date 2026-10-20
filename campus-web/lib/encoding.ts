export function b64(bytes:Uint8Array){let s="";bytes.forEach(v=>s+=String.fromCharCode(v));return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");}
export function unb64(text:string){return Uint8Array.from(atob(text.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));}
