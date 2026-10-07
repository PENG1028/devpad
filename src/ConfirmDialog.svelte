<script lang="ts">
 import { tick } from 'svelte';
 import { invoke,isTauri } from '@tauri-apps/api/core';
 function pause(paused:boolean){if(isTauri())void invoke('notebook_pause',{reason:'confirm',paused});}
 let dialog:HTMLDialogElement;
 let message=$state(''), title=$state(''), accept=$state(''), cancel=$state('');
 let resolve:((answer:boolean)=>void)|undefined;
 export function isOpen(){return !!resolve;}
 export async function ask(body:string,action='放弃编辑',heading='放弃未保存的内容？',back='继续编辑'):Promise<boolean>{
  if(resolve)return false;
  pause(true);message=body;title=heading;accept=action;cancel=back;
  const result=new Promise<boolean>(done=>resolve=done);
  await tick();dialog.showModal();return result;
 }
 function finish(answer:boolean){const done=resolve;resolve=undefined;dialog.close();pause(false);done?.(answer);}
</script>
<dialog class="confirm-dialog" bind:this={dialog} aria-label={title} aria-describedby="confirm-description" oncancel={(event)=>{event.preventDefault();finish(false);}}>
 <div class="confirm-content"><h2>{title}</h2><p id="confirm-description">{message}</p></div>
 <div class="confirm-actions"><button onclick={()=>finish(false)}>{cancel}</button><button class="confirm-destructive" onclick={()=>finish(true)}>{accept}</button></div>
</dialog>
