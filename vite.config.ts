import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({plugins:[svelte()],server:{port:5173,strictPort:true,watch:{ignored:['**/src-tauri/**','**/.tools/**','**/release/**'],awaitWriteFinish:{stabilityThreshold:300,pollInterval:100}}},clearScreen:false});

