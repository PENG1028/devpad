import fs from 'node:fs';
const ref=process.env.GITHUB_REF||'';
const base=JSON.parse(fs.readFileSync('package.json')).version.split('-')[0];
const version=ref.startsWith('refs/tags/v')?ref.slice('refs/tags/v'.length):`${base}-dev.${process.env.GITHUB_RUN_NUMBER||'0'}`;
if(!/^\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(version))throw Error('Invalid release version');
for(const file of ['package.json','package-lock.json','src-tauri/tauri.conf.json']){const data=JSON.parse(fs.readFileSync(file));data.version=version;if(data.packages?.[''])data.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
const cargo=fs.readFileSync('src-tauri/Cargo.toml','utf8').replace(/^(version\s*=\s*)"[^"]+"/m,`$1"${version}"`);fs.writeFileSync('src-tauri/Cargo.toml',cargo);
const lock=fs.readFileSync('src-tauri/Cargo.lock','utf8').replace(/(name = "devpad"\r?\nversion = )"[^"]+"/,`$1"${version}"`);fs.writeFileSync('src-tauri/Cargo.lock',lock);
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`version=${version}\ntag=v${version}\nchannel=${version.includes('-')?'develop':'stable'}\n`);
console.log(`Building ${version}`);
