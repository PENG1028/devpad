import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ref=process.env.GITHUB_REF||'';
const sourceVersion=JSON.parse(fs.readFileSync('package.json')).version;

function nextDevelopmentVersion() {
  const base = sourceVersion.split('-')[0];
  const prefix = `${base}-dev.`;
  let latest = sourceVersion.startsWith(prefix) ? Number(sourceVersion.slice(prefix.length)) : 0;
  const tagPrefix = `v${prefix}`;
  const tags = execFileSync('git', ['tag', '--list', `${tagPrefix}*`], {encoding: 'utf8'});
  for (const tag of tags.trim().split(/\r?\n/)) {
    const suffix = tag.slice(tagPrefix.length);
    if (/^\d+$/.test(suffix)) latest = Math.max(latest, Number(suffix));
  }
  const next = Math.max(latest + 1, Number(process.env.GITHUB_RUN_NUMBER || 1));
  return `${prefix}${next}`;
}

const version = ref.startsWith('refs/tags/v')
  ? ref.slice('refs/tags/v'.length)
  : process.env.DEVPAD_RELEASE_VERSION || nextDevelopmentVersion();
if(!/^\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(version))throw Error('Invalid release version');
for(const file of ['package.json','package-lock.json','src-tauri/tauri.conf.json']){const data=JSON.parse(fs.readFileSync(file));data.version=version;if(data.packages?.[''])data.packages[''].version=version;fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
const cargo=fs.readFileSync('src-tauri/Cargo.toml','utf8').replace(/^(version\s*=\s*)"[^"]+"/m,`$1"${version}"`);fs.writeFileSync('src-tauri/Cargo.toml',cargo);
const lock=fs.readFileSync('src-tauri/Cargo.lock','utf8').replace(/(name = "devpad"\r?\nversion = )"[^"]+"/,`$1"${version}"`);fs.writeFileSync('src-tauri/Cargo.lock',lock);
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`version=${version}\ntag=v${version}\nchannel=${version.includes('-')?'develop':'stable'}\n`);
console.log(`Building ${version}`);
