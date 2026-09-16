/** Shared display and download helpers. Crawl content is always treated as untrusted text. */
import type { Job } from '../src/studio/jobs.js';
export interface AtlasHost {
  openPage: (url: string) => void;
  notify: (message: string) => void;
  api: (path: string) => Promise<Response>;
  navigate: (tab: string) => void;
}
export type AtlasJob = Job;
export const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
export const fmt = (value: number): string => value.toLocaleString();
export function safeURL(value: string): string {
  try { const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''; } catch{return '';}
}
export function pathLabel(value: string): string {try{const u=new URL(value);return u.pathname+u.search;}catch{return value;}}
export function externalLink(value:string,label=value):string {
  const url=safeURL(value);return url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Open in a new browser tab">${esc(label)} ↗</a>`:esc(label);
}
export function saveFile(content:Blob|string,name:string,type='application/json'):void {
  const blob=content instanceof Blob?content:new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function csv(rows:Record<string,unknown>[]):string {
  const headers=Object.keys(rows[0]??{});
  const cell=(value:unknown)=>{let text=Array.isArray(value)?value.join(' | '):String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  return [headers.map(cell).join(','),...rows.map(row=>headers.map(key=>cell(row[key])).join(','))].join('\r\n');
}
export const bytes=(n:number)=>n>=1048576?`${(n/1048576).toFixed(1)} MiB`:n>=1024?`${(n/1024).toFixed(1)} KiB`:`${n} B`;
export const palette=['#5bb9fa','#64d4bc','#bc9af8','#f5ba73','#eb8cb1','#aace76','#74cbdc','#a7aeea'];
