<script lang="ts">
 import { t } from './i18n';
 let { modifier, searchKeys = '' }: { modifier: string; searchKeys?: string } = $props();
</script>
<dl class="shortcut-list">
 {#each [['新建 / 继续输入',modifier+' N'],['保存笔记',modifier+' Enter'],['搜索',searchKeys],['全选筛选结果',modifier+' A'],['切换类型','Alt 1–6'],['连续选择',$t('Shift + 点击')]] as [label,keys]}
  {#if keys}<div><dt>{$t(label)}</dt><dd><kbd>{keys}</kbd></dd></div>{/if}
 {/each}
</dl>
<style>
 .shortcut-list,.shortcut-list dd{margin:0}
 .shortcut-list div{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:32px;padding:4px;font-size:13px}
 kbd{font:inherit;font-size:12px;color:var(--secondary);white-space:nowrap}
</style>
