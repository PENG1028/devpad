export function preference(){const value=localStorage.getItem('devpad-theme');return value==='light'||value==='dark'?value:'system';}
export function applyTheme(value=preference()){
 const resolved=value==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):value;
 document.documentElement.dataset.theme=resolved;
 document.documentElement.style.colorScheme=resolved;
}
