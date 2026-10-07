<script lang="ts">
 export let name:string;
 export let size=20;
 const paths:Record<string,string>={
  help:'M12 17h.01M9.5 8a2.5 2.5 0 1 1 3 2.5c-.5.3-.5 1-.5 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',refresh:'M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 3M18 16a7 7 0 0 1-12 2l-2-3',
  text:'M4 5h16M4 10h16M4 15h10M4 20h7',
  notebook:'M17 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2M8 11h6M8 15h4M18 11h4M20 11v9M18 20h4',menu:'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM9 4v16',search:'M20 20l-4.5-4.5M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0',
  send:'m4 4 17 8-17 8 3-8-3-8ZM7 12h14',circle:'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',ignore:'M5 12h14',monitor:'M4 4h16v12H4ZM12 16v4M8 20h8',more:'M5 12h.01M12 12h.01M19 12h.01',plus:'M12 5v14M5 12h14',close:'M6 6l12 12M18 6 6 18',
  chevron:'m6 9 6 6 6-6',edit:'M13 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-7M16 3l5 5M10 14l1-5 7-7 4 4-7 7z',
  pin:'m9 3 6 0-1 6 4 4v2H6v-2l4-4zM12 15v7',check:'m5 12 4 4L19 6',minimize:'M5 12h14',maximize:'M5 5h14v14H5z',restore:'M8 8h12v12H8zM4 16V4h12',
  image:'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01',arrow:'M12 19V5m-6 6 6-6 6 6',sun:'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',moon:'M20 15a8 8 0 0 1-11-11A9 9 0 1 0 20 15',copy:'M9 9h11v12H9zM5 16H3V3h12v2',filter:'M4 6h16M7 12h10M10 18h4',up:'m6 15 6-6 6 6',down:'m6 9 6 6 6-6',folder:'M3 7V5h6l2 3h10v12H3z'
 };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{#if name==='more'}<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></g>{:else}<path d={paths[name]||paths.more}/>{/if}</svg>
