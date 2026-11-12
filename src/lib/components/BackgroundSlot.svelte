<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { watchTextFile } from '$lib/file-watch';
	import LayerView from './LayerView.svelte';
	import {
		contentKey,
		layerContent,
		type BackgroundLayer,
		type LayerContent
	} from '$lib/background-layers';

	// One layer of the stack. Its opacity, blend mode and other live settings
	// apply in place; a content change (new media, source or texture) mounts
	// a new version hidden and crossfades to it once it has drawn, so the old
	// one stays on screen until then.
	let {
		layer,
		z,
		onready
	}: {
		layer: BackgroundLayer;
		/** Stacking position; the DOM order stays fixed so iframes never reload on reorder. */
		z: number;
		/** Fires once the first version has drawn. */
		onready: () => void;
	} = $props();

	const FADE_MS = 280;

	interface Version {
		id: number;
		key: string;
		content: LayerContent;
		ready: boolean;
	}

	let versions = $state<Version[]>([]);
	let nextId = 1;
	let readyReported = false;
	let pruneTimer: ReturnType<typeof setTimeout> | null = null;
	let watchedSource = $state<string | null>(null);

	const linkedFile = $derived(
		(layer.type === 'shader' || layer.type === 'html') && layer.watch ? layer.file : null
	);
	const source = $derived(
		layer.type === 'shader' || layer.type === 'html' ? (watchedSource ?? layer.source) : ''
	);
	const content = $derived(layerContent(layer, source));
	const key = $derived(contentKey(layer, content));
	const shownId = $derived(versions.findLast((v) => v.ready)?.id ?? null);
	const shownIndex = $derived(versions.findIndex((v) => v.id === shownId));

	$effect(() => {
		const nextKey = key;
		const nextContent = content;
		untrack(() => {
			if (versions.at(-1)?.key === nextKey) return;
			// A version that never showed is superseded outright.
			versions = [
				...versions.filter((v) => v.ready),
				{ id: nextId++, key: nextKey, content: nextContent, ready: false }
			];
		});
	});

	$effect(() => {
		const id = shownId;
		if (id === null) return;
		untrack(() => {
			if (!readyReported) {
				readyReported = true;
				onready();
			}
			if (pruneTimer) clearTimeout(pruneTimer);
			pruneTimer = setTimeout(() => {
				pruneTimer = null;
				const keepFrom = versions.findIndex((v) => v.id === id);
				if (keepFrom > 0) versions = versions.slice(keepFrom);
			}, FADE_MS);
		});
	});

	$effect(() => {
		const path = linkedFile;
		watchedSource = null;
		if (!path) return;
		return watchTextFile(
			path,
			(content) => (watchedSource = content),
			(error) => console.warn('[BackgroundSlot] cannot read watched file:', error)
		);
	});

	function markReady(id: number) {
		const version = versions.find((v) => v.id === id);
		if (version) version.ready = true;
	}

	onDestroy(() => {
		if (pruneTimer) clearTimeout(pruneTimer);
	});
</script>

<div
	class="bg-slot"
	style:z-index={z}
	style:opacity={layer.opacity}
	style:mix-blend-mode={layer.blend}
	style:--fade-ms="{FADE_MS}ms"
>
	{#each versions as version, index (version.id)}
		<div class="bg-version" class:shown={version.id === shownId} class:pending={index > shownIndex}>
			<LayerView {layer} content={version.content} onready={() => markReady(version.id)} />
		</div>
	{/each}
</div>

<style>
	.bg-slot,
	.bg-version {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.bg-version {
		opacity: 0;
		transition: opacity var(--fade-ms) ease;
	}

	.bg-version.shown {
		opacity: 1;
	}

	/* WebKitGTK skips painting fully transparent layers, so a loading version
	   sits at an invisible 1% to actually decode and draw its first frame. */
	.bg-version.pending {
		opacity: 0.01;
	}
</style>
