import fs from 'node:fs';import path from 'node:path';
const [target,platform]=process.argv.slice(2);const version=JSON.parse(fs.readFileSync('package.json')).version;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
fs.mkdirSync('artifacts',{recursive:true});let count=0;
for(const file of walk(`src-tauri/target/${target}/release/bundle`)){
 const n=path.basename(file);let extension=n.endsWith('.exe')?'-setup.exe':n.endsWith('.exe.sig')?'-setup.exe.sig':n.endsWith('.app.tar.gz')?'.app.tar.gz':n.endsWith('.app.tar.gz.sig')?'.app.tar.gz.sig':n.endsWith('.AppImage')?'.AppImage':n.endsWith('.AppImage.sig')?'.AppImage.sig':n.endsWith('.dmg')?'.dmg':n.endsWith('.deb')?'.deb':null;
 if(extension){fs.copyFileSync(file,`artifacts/DevPad-${version}-${platform}${extension}`);count++;}
}
if(!count)throw Error('No release artifacts found');console.log(`Staged ${count} files for ${platform}`);
