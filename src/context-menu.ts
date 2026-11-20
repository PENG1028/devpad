let pointerHeld = false;
let pending: (() => void) | undefined;

// WebKit fires contextmenu on press. Its release light-dismisses a popover opened during that press.
export function openContextMenu(open: () => void) {
 if (pointerHeld) pending = open;
 else open();
}

export function installContextMenus() {
 const clear = () => { pointerHeld = false; pending = undefined; };
 document.addEventListener('contextmenu', event => event.preventDefault(), true);
 document.addEventListener('pointerdown', event => {
  clear(); pointerHeld = event.button === 2 || (event.button === 0 && event.ctrlKey);
 }, true);
 document.addEventListener('pointerup', () => {
  const open = pending; clear();
  if (open) setTimeout(open, 0);
 }, true);
 document.addEventListener('pointercancel', clear, true);
 window.addEventListener('blur', clear);
}
