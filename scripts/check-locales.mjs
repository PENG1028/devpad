import { sourceRevision, validateMessages } from './locale-validation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse } from 'svelte/compiler';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const catalogDir='src/locales/messages';
const registry=JSON.parse(read('src/locales/registry.json'));
const errors=[];
function problem(source,message){errors.push(source+' — '+message);}
function catalog(text,name){
 const ast=ts.parseJsonText(name,text);
 const props=ast.statements[0]?.expression?.properties ?? [];
 const seen=new Set();
 for(const prop of props){
  const key=prop.name?.text;
  if(seen.has(key))problem(name,'duplicate key '+key);
  seen.add(key);
 }
 return JSON.parse(text);
}
function compare(base,target,location){
 for(const error of validateMessages(base,target))problem(location,error);
}

const base=catalog(read(catalogDir+'/en.json'),'en.json');
const digest=sourceRevision(base);
const reviewFile='src/locales/reviewed.json';
const reviewed=fs.existsSync(path.join(root,reviewFile))?JSON.parse(read(reviewFile)):{};
const known=new Set(), recognized=new Set();
const installer=JSON.parse(read('src-tauri/tauri.conf.json')).bundle.windows.nsis.languages;
const nsis=JSON.parse(read('src-tauri/tauri.conf.json')).bundle.windows.nsis;
function installerStrings(language){
 const name=nsis.customLanguageFiles[language];
 const text=read('src-tauri/'+name);
 if(text.startsWith('\uFEFF'))problem(name,'store as UTF-8 without BOM; the Windows bundler inserts it');
 const strings=new Map();
 for(const line of text.split(/\r?\n/)){
  if(!line.trim()||line.trim().startsWith(';'))continue;
  const match=line.match(/^LangString\s+(\w+)\s+\$\{LANG_(\w+)\}\s+"(.+)"\s*$/);
  if(!match || match[2]!==language.toUpperCase()){problem(name,'invalid installer language declaration');continue;}
  if(strings.has(match[1]))problem(name,'duplicate installer key '+match[1]);
  const tokens=match[3].match(/\$\{\w+\}|\{\{\s*\w+\s*\}\}|\$\\[nrt]|\$[A-Z0-9]+/g)??[];
  strings.set(match[1],tokens.sort().join('|'));
 }
 return strings;
}
const installerSource=installerStrings('English');
for(const name of Object.keys(nsis.customLanguageFiles)){
 if(!nsis.languages.includes(name))problem(name,'installer translation has no registered language');
 const actual=installerStrings(name);
 for(const [key,tokens] of installerSource)if(actual.get(key)!==tokens)problem(name,'missing installer string or variable mismatch: '+key);
 for(const key of actual.keys())if(!installerSource.has(key))problem(name,'unexpected installer string '+key);
}
const nonSource=registry.filter(language=>language.code!=='zh-CN');
for(const entry of registry){
 const {code,label,aliases=[],direction='ltr'}=entry;
 if(!label?.trim()||Intl.getCanonicalLocales(code)[0]!==code||!['ltr','rtl'].includes(direction))problem(code,'invalid language registration');
 if(known.has(code))problem(code,'duplicate language');
 known.add(code);
 for(const tag of [code,...aliases]){
  if(recognized.has(tag.toLowerCase()))problem(code,'duplicate locale alias '+tag);
  recognized.add(tag.toLowerCase());
 }
}
if(!known.has('en')||!known.has('zh-CN'))problem('registry','missing base language');
if(JSON.stringify(installer)!==JSON.stringify(registry.map(language=>language.installer)))problem('installer','language list differs from registry');
const files=fs.readdirSync(path.join(root,catalogDir));
for(const file of files)if(!nonSource.some(entry=>entry.code+'.json'===file))problem(file,'unregistered catalog');
compare(base,base,'en');
for(const entry of nonSource){
 if(!files.includes(entry.code+'.json')){problem(entry.code,'catalog missing');continue;}
 const messages=catalog(read(catalogDir+'/'+entry.code+'.json'),entry.code);
 compare(base,messages,entry.code);
 if(entry.code!=='en')for(const [key,value] of Object.entries(messages)){
  if(value===base[key] && (value.match(/[a-z]{2,}/gi) ?? []).length>=4)problem(entry.code,'English sentence left in translation: '+key);
 }

}

// Read production Svelte syntax, including the state scripts. Bare visible strings and
// accessible names need an explicit translation call, even when the key already exists.
function keyAt(value,location){if(!Object.hasOwn(base,value))problem(location,'unregistered message '+value);}
function filesIn(folder){
 return fs.readdirSync(path.join(root,folder),{withFileTypes:true}).flatMap(item=>{
  const name=folder+'/'+item.name;
  return item.isDirectory()?filesIn(name):[name];
 });
}
const frontend=filesIn('src').filter(file=>!file.includes('/assets/')&&!file.includes('/locales/')&&!file.endsWith('.test.ts'));

function walk(node,visit,parent){
 if(!node||typeof node!=='object')return;
 if(Array.isArray(node)){for(const item of node)walk(item,visit,parent);return;}
 visit(node,parent);
 for(const [name,value] of Object.entries(node)){
  if(!['metadata','loc','start','end','comments','parent'].includes(name))walk(value,visit,node);
 }
}
const humanAttributes=new Set(['title','placeholder','alt','aria-label','aria-description']);
const hasWords=/[\p{L}]/u;
for(const file of frontend.filter(name=>name.endsWith('.svelte'))){
 const input=read(file);
 const tree=parse(input,{filename:file,modern:true});
 const line=node=>file+':'+(input.slice(0,node.start).split('\n').length);
 function check(node,parent){
  if(node.type==='Text'&&parent?.type==='Fragment'&&hasWords.test(node.data.trim())){
   // Keyboard legends and variable examples are literal commands in every language.
   if(!/^(?:Ctrl|Alt|Shift|Enter|Space|Esc|[ANF]|MCP|DevPad|MB|{{[\w{}\s,]+}})(?:[\s+\-–/1-6]*(?:Enter|[ANF])?)?$/.test(node.data.trim()))
    problem(line(node),'untranslated UI text '+node.data.trim());
  }
  if(node.type==='Attribute'&&humanAttributes.has(node.name)&&Array.isArray(node.value)&&node.value.every(v=>v.type==='Text')){
   const value=node.value.map(v=>v.data).join('');
   if(value.trim()&&hasWords.test(value))problem(line(node),'untranslated '+node.name+' '+value);
  }
  if(node.type==='AssignmentExpression'&&['notice','error','message','problem'].includes(node.left?.name)
   && node.right?.type==='Literal' && typeof node.right.value==='string' && node.right.value.trim())
   keyAt(node.right.value,line(node));
  if(node.type==='CallExpression'&&['$t','translate'].includes(node.callee?.name)&&typeof node.arguments?.[0]?.value==='string')
   keyAt(node.arguments[0].value,line(node));
  if(node.type==='Literal'&&typeof node.value==='string'&&/\p{Script=Han}/u.test(node.value))
   keyAt(node.value,line(node));
 }
 walk(tree.fragment,check);walk(tree.instance?.content,check);
}
for(const name of frontend.filter(file=>file.endsWith('.ts'))){
 const input=read(name);
 const source=ts.createSourceFile(name,input,ts.ScriptTarget.Latest,true);
 function visit(expr){
  if(ts.isStringLiteralLike(expr)&&/\p{Script=Han}/u.test(expr.text))keyAt(expr.text,name);
  ts.forEachChild(expr,visit);
 }
 visit(source);
}
for(const name of filesIn('src-tauri/src').filter(name=>name.endsWith('.rs'))){
 const input=read(name).split('#[cfg(test)]')[0];
 for(const match of input.matchAll(/\.text\(\s*("(?:\\.|[^"\\])*")\s*\)/g))keyAt(JSON.parse(match[1]),name);
 if(name.endsWith('/windows.rs'))for(const match of input.matchAll(/=>\s*\(("(?:\\.|[^"\\])*"),\s*\d+\./g))keyAt(JSON.parse(match[1]),name);
}

// A revision is acknowledged for each translated catalog, so edits to an existing
// English message also require review even when all keys and variables still match.
const requested=process.argv.slice(2);
const review=requested[0]==='--review';
if(review){
 if(requested.length<2)problem('review','supply specific language codes after --review');
 for(const code of requested.slice(1)){
  if(code==='zh-CN'||code==='en'||!known.has(code))problem('review','invalid translated locale '+code);
  else reviewed[code]=digest;
 }
}
for(const {code} of nonSource){
 if(code==='en')continue;
 if(!review&&reviewed[code]!==digest)problem(code,'source wording has changed, review this catalog');
}
for(const code of Object.keys(reviewed))if(code==='en'||code==='zh-CN'||!known.has(code))problem('review','unregistered catalog '+code);
if(errors.length){
 console.error(errors.join('\n'));process.exitCode=1;
}else{
 if(review)fs.writeFileSync(path.join(root,reviewFile),JSON.stringify(reviewed,null,2)+'\n');
 console.log('Verified '+registry.length+' interface languages and '+Object.keys(base).length+' messages per language.');
}
