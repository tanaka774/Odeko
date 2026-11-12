<script module lang="ts">
	import { invoke } from '@tauri-apps/api/core';

	let libraryBase: Promise<string | null> | null = null;

	export function getLibraryBase(): Promise<string | null> {
		libraryBase ??= invoke<string>('library_base_url').catch((error) => {
			console.error('[HtmlPage] library cache unavailable:', error);
			return null;
		});
		return libraryBase;
	}
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { buildSrcdoc, type PageKind } from '$lib/html-page';
	import { newPageToken, registerPage } from '$lib/page-bridge.svelte';

	// One sandboxed page. The srcdoc is built once on mount; a source change
	// mounts a new instance (see the callers' keyed blocks).
	let {
		source,
		scripts,
		kind,
		widgetId,
		token = newPageToken(),
		class: className = '',
		title,
		iframe = $bindable(null),
		onready
	}: {
		source: string;
		scripts: boolean;
		kind: PageKind;
		widgetId?: string;
		token?: string;
		class?: string;
		title: string;
		iframe?: HTMLIFrameElement | null;
		onready?: () => void;
	} = $props();

	let srcdoc = $state<string | null>(null);

	onMount(() => {
		let disposed = false;
		const unregister = registerPage({ token, kind, widgetId, frame: () => iframe });
		void (scripts ? getLibraryBase() : Promise.resolve(null)).then((base) => {
			if (!disposed) srcdoc = buildSrcdoc(source, scripts, base, token, kind);
		});
		return () => {
			disposed = true;
			unregister();
		};
	});
</script>

<iframe
	bind:this={iframe}
	class={className}
	{title}
	sandbox="allow-scripts"
	{srcdoc}
	onload={() => srcdoc !== null && onready?.()}
></iframe>
