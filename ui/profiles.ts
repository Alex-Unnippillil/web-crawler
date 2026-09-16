/** Local settings profiles and bounded CSS rule editor. Imports cannot contain code,
 * execute selectors, change network policy, or inject HTML into the interface.
 */
import { esc, saveFile } from './atlas-shared.js';
import type { ExtractionRule } from '../src/inspection-types.js';
const KEY = 'studio-crawl-profiles-v1';
const scalar = ['mode','maxPages','maxDepth','maxConcurrency','delayMs','timeout','duration','pathPrefix','browserConcurrency','renderTimeout','scrollIterations','sitemapURLs'] as const;
const checks = ['stripTracking','discoverSitemaps','captureScreenshots','adaptiveConcurrency'] as const;
interface Profile { id: string; name: string; settings: Record<string,string|boolean>; rules: ExtractionRule[] }
export class Profiles {
  private profiles: Profile[] = []; private rules: ExtractionRule[] = [];
  private form: HTMLFormElement; private notify: (message:string)=>void;
  constructor(form: HTMLFormElement, notify: (message:string)=>void) {
    this.form = form; this.notify = notify;
    try { this.profiles = this.validate(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { this.profiles = []; }
    this.render();
    document.getElementById('rule-add')!.addEventListener('click',()=>{ if(this.rules.length>=12){notify('A crawl supports up to 12 custom rules.');return;}this.rules.push({name:`Field${this.rules.length+1}`,selector:'',mode:'text'});this.drawRules(); });
    document.getElementById('profile-select')!.addEventListener('change',()=>this.apply());
    document.getElementById('profile-save')!.addEventListener('click',()=>this.save(false));
    document.getElementById('profile-copy')!.addEventListener('click',()=>this.save(true));
    document.getElementById('profile-delete')!.addEventListener('click',()=>{ const id=(document.getElementById('profile-select') as HTMLSelectElement).value;if(!id)return;if(!window.confirm('Delete this saved settings profile? Crawl results are not affected.'))return;this.profiles=this.profiles.filter(p=>p.id!==id);this.persist();this.render(); });
    document.getElementById('profile-export')!.addEventListener('click',()=>saveFile(JSON.stringify(this.profiles,null,2),'crawler-profiles.json'));
    document.getElementById('profile-import')!.addEventListener('change',event=>{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;if(file.size>65536){notify('Profile import is limited to 64 KiB.');return;}void file.text().then(text=>{const imported=this.validate(JSON.parse(text));if(this.profiles.length&&!window.confirm('Replace all saved settings profiles with this file? Existing crawl results are not affected.'))return;this.profiles=imported;this.persist();this.render();notify('Settings profiles imported. No crawl has started.');}).catch(error=>notify(String(error)));});
  }
  private field(name:string):HTMLInputElement|HTMLSelectElement { return this.form.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement; }
  getRules():ExtractionRule[]{return this.rules.map(r=>({...r}));}
  setRules(rules:ExtractionRule[]):void {this.rules=rules.map(r=>({...r}));this.drawRules();}
  reset():void {this.rules=[];this.drawRules();}
  private validate(value:unknown):Profile[]{
    if(!Array.isArray(value)||value.length>12)throw new Error('Profiles must be an array containing at most 12 entries.');
    return value.map((raw,i)=>{
      if(!raw||typeof raw!=='object'||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80||!raw.settings||typeof raw.settings!=='object')throw new Error('Invalid profile.');
      const settings:Record<string,string|boolean>={};
      for(const name of scalar)if(typeof raw.settings[name]==='string'&&raw.settings[name].length<=2048)settings[name]=raw.settings[name];
      for(const name of checks)if(typeof raw.settings[name]==='boolean')settings[name]=raw.settings[name];
      if(!Array.isArray(raw.rules)||raw.rules.length>12)throw new Error('Invalid extraction rules.');
      const rules:ExtractionRule[]=raw.rules.map((r:ExtractionRule)=>{if(!r||!/^\w[\w -]{0,49}$/.test(r.name)||typeof r.selector!=='string'||r.selector.length>300||!['text','attribute','html'].includes(r.mode)||r.attribute!==undefined&&(typeof r.attribute!=='string'||r.attribute.length>100))throw new Error('Invalid extraction rule.');return{name:r.name,selector:r.selector,mode:r.mode,...(r.attribute?{attribute:r.attribute}:{})};});
      return {id:`profile-${i}-${Date.now()}`,name:raw.name,settings,rules};
    });
  }
  private persist():void {try{localStorage.setItem(KEY,JSON.stringify(this.profiles));}catch{this.notify('Browser storage is unavailable. Export profiles to keep them.');}}
  private render():void {const select=document.getElementById('profile-select') as HTMLSelectElement;select.innerHTML='<option value="">Choose saved settings…</option>'+this.profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');this.drawRules();}
  private apply():void {const p=this.profiles.find(p=>p.id===(document.getElementById('profile-select') as HTMLSelectElement).value);if(!p)return;for(const name of scalar)if(p.settings[name]!==undefined)this.field(name).value=String(p.settings[name]);for(const name of checks)if(typeof p.settings[name]==='boolean')(this.field(name)as HTMLInputElement).checked=p.settings[name]as boolean;(document.getElementById('profile-name')as HTMLInputElement).value=p.name;this.setRules(p.rules);this.notify(`Loaded ${p.name}. Review the URL and limits before starting.`);}
  private save(copy:boolean):void {const name=(document.getElementById('profile-name')as HTMLInputElement).value.trim();if(!name){this.notify('Enter a profile name.');return;}const existing=copy?undefined:this.profiles.find(p=>p.id===(document.getElementById('profile-select')as HTMLSelectElement).value);if(!existing&&this.profiles.length>=12){this.notify('Delete a profile before adding another; the limit is 12.');return;}const settings:Record<string,string|boolean>={};for(const n of scalar)settings[n]=this.field(n).value;for(const n of checks)settings[n]=(this.field(n)as HTMLInputElement).checked;const p:Profile={id:existing?.id??crypto.randomUUID(),name:name.slice(0,copy?75:80)+(copy?' copy':''),settings,rules:this.getRules()};if(existing)this.profiles=this.profiles.map(row=>row.id===p.id?p:row);else this.profiles.push(p);this.persist();this.render();(document.getElementById('profile-select')as HTMLSelectElement).value=p.id;this.notify('Settings profile saved locally.');}
  private drawRules():void {const root=document.getElementById('rule-list')!;root.innerHTML=this.rules.map((r,i)=>`<div class="rule-row"><label>Name<input data-rule="${i}" data-field="name" value="${esc(r.name)}" maxlength="50" placeholder="Price"></label><label>CSS selector<input data-rule="${i}" data-field="selector" value="${esc(r.selector)}" maxlength="300" placeholder=".product-price"></label><label>Extract<select data-rule="${i}" data-field="mode"><option value="text" ${r.mode==='text'?'selected':''}>Text</option><option value="attribute" ${r.mode==='attribute'?'selected':''}>Attribute</option><option value="html" ${r.mode==='html'?'selected':''}>HTML text</option></select></label><label>Attribute<input data-rule="${i}" data-field="attribute" value="${esc(r.attribute??'')}" maxlength="100" placeholder="data-id"></label><button type="button" class="button" data-remove-rule="${i}" aria-label="Remove rule ${i+1}">×</button></div>`).join('')||'<p class="muted">No custom rules. Add a CSS selector to extract a price, identifier, title or another field.</p>';root.querySelectorAll<HTMLInputElement|HTMLSelectElement>('[data-rule]').forEach(input=>input.addEventListener('input',()=>{const rule=this.rules[Number(input.dataset.rule)]!;Object.assign(rule,{[input.dataset.field!]:input.value});}));root.querySelectorAll<HTMLButtonElement>('[data-remove-rule]').forEach(button=>button.addEventListener('click',()=>{this.rules.splice(Number(button.dataset.removeRule),1);this.drawRules();}));}
}
