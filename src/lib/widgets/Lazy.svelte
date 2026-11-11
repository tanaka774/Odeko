<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		load: () => Promise<{ default: Component<Record<string, unknown>> }>;
		[key: string]: unknown;
	}

	let { load, ...rest }: Props = $props();

	let loaded = $state<Component<Record<string, unknown>> | null>(null);
	let error = $state('');

	$effect(() => {
		load()
			.then((module) => (loaded = module.default))
			.catch((e) => (error = String(e)));
	});
</script>

{#if loaded}
	{@const Loaded = loaded}
	<Loaded {...rest} />
{:else if error}
	<div class="lazy-error">{error}</div>
{/if}

<style>
	.lazy-error {
		color: #fca5a5;
		font-size: 12px;
	}
</style>
