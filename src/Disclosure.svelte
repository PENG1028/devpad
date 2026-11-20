<script lang="ts">
 import type { Snippet } from 'svelte';
 import Icon from './Icon.svelte';
 let { label, children }: { label: string; children: Snippet } = $props();
</script>
<details class="disclosure">
 <summary><span>{label}</span><Icon name="chevron" size={16}/></summary>
 <div class="disclosure-body">{@render children()}</div>
</details>
