<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	// Renders its children into <body> instead of where the component sits.
	// Used for popups (e.g. settings modals) that must always paint on top,
	// even when their parent lives inside a z-indexed stacking context.
	let { children }: { children: Snippet } = $props();

	let host = $state<HTMLDivElement | null>(null);

	onMount(() => {
		if (host) {
			document.body.appendChild(host);
		}
	});
</script>

<div bind:this={host}>
	{@render children()}
</div>
