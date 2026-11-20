// One top-layer surface serves the whole window, including modal dialogs.
export function installTooltips() {
 const tip=document.createElement('div');
 tip.id='devpad-tooltip';tip.className='devpad-tooltip';tip.popover='manual';tip.setAttribute('role','tooltip');
 let target:HTMLElement|undefined, timer:ReturnType<typeof setTimeout>|undefined;
 function close() {
  clearTimeout(timer);
  if(target?.hasAttribute('aria-describedby')){
   const ids=target.getAttribute('aria-describedby')!.split(/\s+/).filter(id=>id!==tip.id);
   if(ids.length)target.setAttribute('aria-describedby',ids.join(' '));else target.removeAttribute('aria-describedby');
  }
  if(tip.matches(':popover-open'))tip.hidePopover();
  target=undefined;
 }
 function anchor(node:EventTarget|null) {
  if(!(node instanceof Element))return;
  const button=node.closest<HTMLElement>('[data-tip],button[aria-label]');
  if(button?.matches('.floating-notebook,[disabled]'))return;
  if(button?.dataset.tip || (button?.querySelector('svg')&&!button.textContent?.trim()))return button;
 }
 function offer(node:HTMLElement|undefined, delay:number) {
  if(!node){close();return;}
  if(target===node)return;
  close();target=node;
  timer=setTimeout(()=>{
   if(!node.isConnected || !node.getClientRects().length){close();return;}
   const label=node.dataset.tip || node.getAttribute('aria-label');if(!label)return;
   const parent=node.closest('dialog,[popover]')??document.body;
   if(tip.parentElement!==parent)parent.append(tip);
   tip.textContent=label;
   const ids=[node.getAttribute('aria-describedby'),tip.id].filter(Boolean).join(' ');
   node.setAttribute('aria-describedby',ids);tip.showPopover();
   const rect=node.getBoundingClientRect(), pad=6;
   const x=rect.left+(rect.width-tip.offsetWidth)/2;
   tip.style.left=Math.max(pad,Math.min(innerWidth-tip.offsetWidth-pad,x))+'px';
   tip.style.top=(rect.bottom+tip.offsetHeight+2*pad<=innerHeight?rect.bottom+pad:Math.max(pad,rect.top-tip.offsetHeight-pad))+'px';
  },delay);
 }
 document.addEventListener('pointerover',e=>{if(e.pointerType==='mouse')offer(anchor(e.target),350);});
 document.addEventListener('pointerout',e=>{if(target&&!target.contains(e.relatedTarget as Node))close();});
 document.addEventListener('focusin',e=>{const node=anchor(e.target);if(node?.matches(':focus-visible'))offer(node,100);});
 document.addEventListener('focusout',close);document.addEventListener('pointerdown',close,true);
 document.addEventListener('keydown',close,true);window.addEventListener('scroll',close,true);
 window.addEventListener('blur',close);window.addEventListener('resize',close);
 document.addEventListener('beforetoggle',e=>{if(e.target!==tip&&target)close();},true);
}
