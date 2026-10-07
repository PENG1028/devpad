import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const [folder,version,repo,tag]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(version)||!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('Invalid release');
const platforms={};const hashes=[];
for(const name of fs.readdirSync(folder)){
 const file=path.join(folder,name);if(!fs.statSync(file).isFile())continue;
 if(name.endsWith('.sig')){
  const asset=name.slice(0,-4);if(!fs.existsSync(path.join(folder,asset)))throw Error(`Missing artifact ${asset}`);
  const platform=['windows-x86_64','darwin-aarch64','darwin-x86_64','linux-x86_64'].find(p=>asset.includes(`-${p}`));
  if(!platform)throw Error(`Unknown platform ${asset}`);
  if(platforms[platform])throw Error(`Duplicate updater artifact ${platform}`);
  platforms[platform]={signature:fs.readFileSync(file,'utf8').trim(),url:`https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(asset)}`};
 }else if(!name.endsWith('.json')&&!name.endsWith('.txt'))hashes.push(`${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}  ${name}`);
}
for(const platform of ['windows-x86_64','darwin-aarch64','darwin-x86_64','linux-x86_64'])if(!platforms[platform])throw Error(`Missing signed platform ${platform}`);
fs.writeFileSync(path.join(folder,'latest.json'),JSON.stringify({version,notes:'复制与模板、草稿恢复、MCP 任务、应用内更新。完整说明见 GitHub Releases。',pub_date:new Date().toISOString(),platforms},null,2)+'\n');
fs.writeFileSync(path.join(folder,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
