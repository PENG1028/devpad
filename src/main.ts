import { mount } from 'svelte';
import App from './App.svelte';
import NotebookSurface from './NotebookSurface.svelte';
import Bubble from './Bubble.svelte';
import './style.css';
import './refinement.css';
import './isolation.css';
import { applyTheme } from './theme';
applyTheme();
const kind=new URLSearchParams(location.search).get('window')||'main';
const target=document.getElementById('app')!;
if(kind==='bubble')mount(Bubble,{target});
else if(kind==='main'){document.documentElement.classList.add('notebook-document');mount(NotebookSurface,{target});}
else mount(App,{target});
