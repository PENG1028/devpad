import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { derived, writable } from 'svelte/store';
import { exportTemplates, formatMessage, type ExportTemplate, type Project, type TranslateMessage } from './core';
import registry from './locales/registry.json';
import english from './locales/messages/en.json';

export type Locale = string;
export type LanguagePreference = string;
export type Translate = TranslateMessage;
type Dictionary = Record<string,string>;
export const languages = registry;
const key = 'devpad-language';
const loaders = import.meta.glob<Dictionary>(['./locales/messages/*.json','!./locales/messages/en.json'], {import:'default'});
const loaded = new Map<string,Dictionary>([['zh-CN',{}],['en',english]]);
const byTag = new Map<string,string>();
for (const language of languages) {
 for (const tag of [language.code,...(language.aliases ?? [])]) byTag.set(tag.toLowerCase(),language.code);
}

function parsePreference(value: unknown): LanguagePreference | undefined {
 return typeof value==='string' && (value==='system' || languages.some(language=>language.code===value)) ? value : undefined;
}

function readPreference() {
 try { return parsePreference(window.localStorage.getItem(key)); } catch { return undefined; }
}

function systemLocale(): Locale {
 for (const preferred of [navigator.language,...(navigator.languages ?? [])]) {
  const parts=preferred.toLowerCase().replace(/_/g,'-').split('-');
  while(parts.length) {
   const found=byTag.get(parts.join('-'));
   if(found)return found;
   parts.pop();
  }
 }
 return 'en';
}

const preferenceStore = writable<LanguagePreference>(readPreference() ?? 'system');
const system = writable<Locale>(systemLocale());
export const languagePreference = { subscribe: preferenceStore.subscribe };
const requested = derived([languagePreference,system], ([preference,system])=>preference==='system'?system:preference);
type ActiveLanguage = {code:Locale; messages:Dictionary};
const active = derived(requested,(code,set:(value:ActiveLanguage)=>void)=>{
 const messages=loaded.get(code);
 if(messages){set({code,messages});return;}
 let current=true;
 const load=loaders['./locales/messages/'+code+'.json'];
 load().then(messages=>{
  loaded.set(code,messages);
  if(current)set({code,messages});
 }).catch(error=>{
  console.error('Could not load language',code,error);
  if(current)set({code:'en',messages:english});
 });
 return ()=>{current=false;};
}, {code:'',messages:{}});
export const locale = derived(active,language=>language.code || 'zh-CN');
export const t = derived(active,({code,messages}):Translate=>(message,values)=>
 formatMessage(code==='zh-CN'?message:messages[message] ?? (english as Dictionary)[message] ?? message, values));
export const languageReady = new Promise<void>(resolve=>{
 const stop=active.subscribe(language=>{if(language.code){resolve();queueMicrotask(()=>stop());}});
});

function savePreference(preference: LanguagePreference) {
 try { window.localStorage.setItem(key, preference); } catch { /* The current window can still switch languages. */ }
}

let preferenceChanged = false;
let nativeUpdate = Promise.resolve();
export function setLanguagePreference(preference: LanguagePreference) {
 if(!parsePreference(preference))return;
 preferenceChanged = true;
 preferenceStore.set(preference);
 savePreference(preference);
 if (isTauri()) {
  nativeUpdate = nativeUpdate.then(() => invoke<void>('set_locale', { locale: preference })).catch(error => {
   console.warn('Could not update the native language preference', error);
  });
 }
}

locale.subscribe(code=>{
 document.documentElement.lang=code;
 document.documentElement.dir=languages.find(language=>language.code===code)?.direction ?? 'ltr';
});
window.addEventListener('languagechange', () => system.set(systemLocale()));
window.addEventListener('storage', event => {
 if (event.storageArea !== window.localStorage || (event.key !== key && event.key !== null)) return;
 preferenceChanged = true;
 preferenceStore.set(parsePreference(event.newValue) ?? 'system');
});
document.addEventListener('visibilitychange',()=>{
 const preference=readPreference();
 if(document.visibilityState==='visible' && preference)preferenceStore.set(preference);
});
if(isTauri())void listen<LanguagePreference>('locale-changed',event=>{
 const preference=parsePreference(event.payload);
 if(preference && readPreference()===preference)preferenceStore.set(preference);
});

const windowKind = new URLSearchParams(window.location.search).get('window') ?? 'main';
// Load the active data directory's preference at startup. Auxiliary windows already share the main window's cache.
if (isTauri() && (windowKind === 'main' || !readPreference())) {
 void invoke<LanguagePreference>('get_locale').then(value => {
  const preference = parsePreference(value);
  if (!preferenceChanged && preference) {
   preferenceStore.set(preference);
   savePreference(preference);
  }
 }).catch(error => { console.warn('Could not load the native language preference', error); });
}

export function projectLabel(project: Pick<Project, 'id' | 'name'>, translate: Translate) {
 return project.id === 'inbox' && project.name === '收件箱' ? translate(project.name) : project.name;
}

export function templateLabel(template: ExportTemplate, translate: Translate) {
 const original = exportTemplates.find(item => item.id === template.id);
 return original?.name === template.name ? translate(template.name) : template.name;
}

export function templateForLocale(template: ExportTemplate, translate: Translate): ExportTemplate {
 const original = exportTemplates.find(item => item.id === template.id);
 const name = templateLabel(template, translate);
 const body = original?.body === template.body ? translate(template.body) : template.body;
 return name === template.name && body === template.body ? template : { ...template, name, body };
}
