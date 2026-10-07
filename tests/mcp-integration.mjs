import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const target=process.env.DEVPAD_TEST_TARGET;
const exe=process.env.DEVPAD_TEST_EXE||path.resolve('src-tauri','target',...(target?[target]:[]),'release',process.platform==='win32'?'devpad.exe':'devpad');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'devpad-mcp-test-'));
const clients=[];
async function connect(){const client=new Client({name:'devpad-integration-test',version:'1.0.0'});const transport=new StdioClientTransport({command:exe,args:['--mcp'],env:{...process.env,DEVPAD_DATA_DIR:root},stderr:'pipe'});let logs='';transport.stderr?.on('data',d=>logs+=d);await client.connect(transport);clients.push(client);return client;}
async function call(client,name,args={}){return client.callTool({name,arguments:args});}
const data=r=>r.structuredContent.data;
try {
 const a=await connect(),b=await connect();const tools=await a.listTools();assert.ok(tools.tools.some(t=>t.name==='claim_task'));assert.equal(tools.tools.length,12);
 const projects=data(await call(a,'list_projects'));assert.equal(projects[0].id,'inbox');
 const note=data(await call(a,'create_note',{projectId:'inbox',text:'普通笔记\n完整保留'}));assert.equal(note.revision,1);
 assert.deepEqual(data(await call(a,'list_tasks')),[]);
 const updated=data(await call(a,'update_note',{id:note.id,revision:1,text:'agent A 修改'}));assert.equal(updated.revision,2);
 const stale=await call(b,'update_note',{id:note.id,revision:1,text:'agent B 的旧内容'});assert.equal(stale.isError,true);
 assert.equal(data(await call(b,'get_note',{id:note.id})).text,'agent A 修改');
 const page=data(await call(a,'list_notes',{limit:1,query:'修改'}));assert.equal(page.notes.length,1);assert.equal(page.nextOffset,1);
 assert.equal((await call(a,'get_attachment',{noteId:note.id,attachmentId:'../secret'})).isError,true);
 assert.equal((await call(a,'create_note',{projectId:'missing',text:'不应写入'})).isError,true);
 assert.equal((await call(a,'claim_task',{id:'unpublished',agent:'A'})).isError,true);
 // Seed only the isolated fixture to simulate publication by the desktop UI.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');
 fs.writeFileSync(path.join(root,'attachments','fixture.png'),png);
 const taskId='published-fixture',snapshot={id:taskId,records:[{...updated,attachments:[{id:'fixture-image',name:'fixture.png',path:path.join(root,'attachments','fixture.png')}]}],instructions:'检查资料',result:null};
 const fixture=new DatabaseSync(path.join(root,'devpad.sqlite'));fixture.prepare("INSERT INTO agent_tasks(id,payload,state) VALUES(?,?,'available')").run(taskId,JSON.stringify(snapshot));fixture.close();
 const claims=await Promise.all([call(a,'claim_task',{id:taskId,agent:'A'}),call(b,'claim_task',{id:taskId,agent:'B'})]);
 assert.equal(claims.filter(r=>!r.isError).length,1);const winner=claims[0].isError?b:a;const claim=data(claims.find(r=>!r.isError));
 const image=await call(winner,'get_attachment',{taskId,attachmentId:'fixture-image'});assert.equal(image.content[0].type,'image');assert.equal(Buffer.from(image.content[0].data,'base64').equals(png),true);
 assert.equal((await call(winner,'complete_task',{id:taskId,claimToken:'foreign',result:'不能覆盖'})).isError,true);
 await call(winner,'renew_task',{id:taskId,claimToken:claim.claimToken,leaseSeconds:120});
 const completed=await call(winner,'complete_task',{id:taskId,claimToken:claim.claimToken,result:'已完成，验证通过'});assert.ok(!completed.isError);
 assert.equal(data(await call(a,'get_task',{id:taskId})).result.text,'已完成，验证通过');assert.equal(data(await call(a,'get_note',{id:note.id})).text,'agent A 修改');
 // Closing and reconnecting must retain the database, with no GUI process involved.
 await a.close();await b.close();clients.length=0;const c=await connect();assert.equal(data(await call(c,'get_note',{id:note.id})).text,'agent A 修改');
 console.log('PASS real MCP SDK: handshake, two clients, persistence, revision conflicts, task boundary, atomic claims, original image, renewal, completion, path rejection');
}finally{await Promise.allSettled(clients.map(c=>c.close()));fs.rmSync(root,{recursive:true,force:true});}
