import { mount } from 'svelte';
import App from './App.svelte';
import { isTauri } from '@tauri-apps/api/core';
import NotebookSurface from './NotebookSurface.svelte';
import Bubble from './Bubble.svelte';
import './style.css';
import './refinement.css';
import './isolation.css';
import './interaction.css';
import { installTooltips } from './tooltip';
import { applyTheme } from './theme';
import { languageReady } from './i18n';
import EditMenu from './EditMenu.svelte';
import { installContextMenus } from './context-menu';
installContextMenus();
if(isTauri()&&/Mac/.test(navigator.platform))document.documentElement.dataset.nativeMac='true';
applyTheme();
installTooltips();
const kind=new URLSearchParams(location.search).get('window')||'main';
const target=document.getElementById('app')!;
void languageReady.then(()=>{
 mount(EditMenu,{target:document.body});
 if(kind==='bubble')mount(Bubble,{target});
 else if(kind==='main'){document.documentElement.classList.add('notebook-document');mount(NotebookSurface,{target});}
 else mount(App,{target});
});
