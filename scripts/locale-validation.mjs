import { createHash } from 'node:crypto';

function placeholders(message) {
 return (message.match(/\{\{\s*\w+\s*\}\}|\{\w+\}/g) ?? []).map(s=>s.replace(/\s/g,'')).sort().join('|');
}

export function sourceRevision(source) {
 const pairs=Object.keys(source).sort().map(key=>[key,source[key]]);
 return createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}

export function validateMessages(base, translated) {
 const problems=[];
 for(const [key,source] of Object.entries(base)){
  const value=translated[key];
  if(typeof value!=='string'||!value.trim()){problems.push('missing translation for '+key);continue;}
  if(placeholders(value)!==placeholders(key)||placeholders(value)!==placeholders(source))problems.push('placeholder mismatch for '+key);
 }
 for(const key of Object.keys(translated))if(!Object.hasOwn(base,key))problems.push('obsolete key '+key);
 return problems;
}
