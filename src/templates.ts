import {exportTemplates,type ExportTemplate} from './core';
const key='devpad-export-templates';
export function loadTemplates():ExportTemplate[]{
 try{const value=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(value)&&value.length&&value.every(t=>typeof t.id==='string'&&typeof t.name==='string'&&typeof t.body==='string'&&['metadata','references','numberImages'].every(k=>typeof t[k]==='boolean')))return value;}catch{}
 return exportTemplates.map(t=>({...t}));
}
export function defaultTemplate(){const templates=loadTemplates();return templates.find(t=>t.id===localStorage.getItem('devpad-default-template'))||templates[0];}
export function saveTemplates(templates:ExportTemplate[],defaultId:string){localStorage.setItem(key,JSON.stringify(templates));localStorage.setItem('devpad-default-template',defaultId);window.dispatchEvent(new Event('devpad-templates-changed'));}
