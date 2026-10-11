<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import BackgroundVideo from './BackgroundVideo.svelte';
	import { isVideoBackground } from '$lib/background';
	import { safeCssUrl, safeRgbColor } from '$lib/utils';
	import type { CanvasSettings } from '$lib/stores/settings.svelte';

	// Paints the canvas panel background as a stack of layers. A new media
	// source gets its own layer that stays invisible until its first frame is
	// drawn, then crossfades over the previous one. `prepare` lets a preset
	// switch load the next background while the current one stays on screen;
	// the prepared layer only shows once the settings actually change to it.
	let {
		settings,
		animate = false,
		instant = false
	}: {
		settings: CanvasSettings;
		animate?: boolean;
		/** Swap without crossfading, for when the whole panel is faded out. */
		instant?: boolean;
	} = $props();

	const FADE_MS = 280;

	interface Look {
		tint: string;
		size: CanvasSettings['background_size'];
		repeat: boolean;
		position: string;
	}

	interface Layer {
		id: number;
		src: string | null;
		isVideo: boolean;
		imageUrl: string | null;
		ready: boolean;
		committed: boolean;
		look: Look;
	}

	let layers = $state<Layer[]>([]);
	let nextId = 1;
	let pruneTimer: ReturnType<typeof setTimeout> | null = null;
	const readyWaiters = new Map<number, () => void>();

	let shownId = $derived(layers.findLast((layer) => layer.ready && layer.committed)?.id ?? null);
	let shownIndex = $derived(layers.findIndex((layer) => layer.id === shownId));

	$effect(() => {
		const id = shownId;
		if (id === null) return;
		untrack(() => {
			if (pruneTimer) clearTimeout(pruneTimer);
			pruneTimer = setTimeout(() => {
				pruneTimer = null;
				const keepFrom = layers.findIndex((entry) => entry.id === id);
				if (keepFrom > 0) layers = layers.slice(keepFrom);
			}, FADE_MS);
		});
	});

	function lookOf(s: CanvasSettings): Look {
		return {
			tint: `rgba(${safeRgbColor(s.background_color, '20, 20, 30')}, ${s.background_opacity})`,
			size: s.background_size,
			repeat: s.background_repeat,
			position: s.background_position
		};
	}

	function objectFit(size: Look['size']): string {
		return size === 'stretch' ? 'fill' : size;
	}

	function imageSize(size: Look['size']): string {
		return size === 'stretch' ? '100% 100%' : size;
	}

	function markReady(id: number) {
		const layer = layers.find((entry) => entry.id === id);
		if (layer) layer.ready = true;
		readyWaiters.get(id)?.();
		readyWaiters.delete(id);
	}

	function preloadImage(id: number, url: string) {
		const img = new Image();
		img.src = url;
		img
			.decode()
			.catch(() => {})
			// Decoding alone does not mean WebKit has painted the layer yet.
			.finally(() => requestAnimationFrame(() => requestAnimationFrame(() => markReady(id))));
	}

	function addLayer(s: CanvasSettings, committed: boolean): Layer {
		const src = s.background_image || null;
		const isVideo = isVideoBackground(src);
		const imageUrl = src && !isVideo ? safeCssUrl(src) : null;
		const layer: Layer = {
			id: nextId++,
			src,
			isVideo,
			imageUrl,
			ready: !isVideo && !imageUrl,
			committed,
			look: lookOf(s)
		};
		// Layers that never became visible are superseded outright.
		const kept = layers.filter((entry) => entry.ready && entry.committed);
		for (const entry of layers) {
			if (!kept.includes(entry)) markReady(entry.id);
		}
		layers = [...kept, layer];
		if (imageUrl) preloadImage(layer.id, imageUrl);
		return layer;
	}

	/** Loads the background of `next` hidden; resolves once it can be shown without a gap. */
	export function prepare(next: CanvasSettings): Promise<void> {
		const src = next.background_image || null;
		if (layers.at(-1)?.src === src) return Promise.resolve();
		const layer = addLayer(next, false);
		if (layer.ready) return Promise.resolve();
		return new Promise((resolve) => readyWaiters.set(layer.id, resolve));
	}

	$effect(() => {
		const src = settings.background_image || null;
		const look = lookOf(settings);
		untrack(() => {
			const top = layers.at(-1);
			if (top && top.src === src) {
				top.look = look;
				top.committed = true;
				return;
			}
			addLayer(settings, true);
		});
	});

	onDestroy(() => {
		if (pruneTimer) clearTimeout(pruneTimer);
		for (const resolve of readyWaiters.values()) resolve();
	});
</script>

<div class="bg-stack" class:animate class:instant style:--fade-ms="{FADE_MS}ms">
	{#each layers as layer, index (layer.id)}
		<div class="bg-layer" class:shown={layer.id === shownId} class:pending={index > shownIndex}>
			{#if layer.isVideo && layer.src}
				<BackgroundVideo
					src={layer.src}
					fit={layer.look.size}
					position={layer.look.position}
					onready={() => markReady(layer.id)}
				/>
			{:else if layer.imageUrl && layer.look.repeat}
				<div
					class="bg-media"
					style:background-image={`url("${layer.imageUrl}")`}
					style:background-size={imageSize(layer.look.size)}
					style:background-position={layer.look.position}
				></div>
			{:else if layer.imageUrl}
				<img
					class="bg-media"
					src={layer.imageUrl}
					alt=""
					decoding="sync"
					style:object-fit={objectFit(layer.look.size)}
					style:object-position={layer.look.position}
				/>
			{/if}
			<div class="bg-tint" style:background-color={layer.look.tint}></div>
		</div>
	{/each}
</div>

<style>
	.bg-stack,
	.bg-layer,
	.bg-media,
	.bg-tint {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.bg-media {
		width: 100%;
		height: 100%;
		background-repeat: repeat;
	}

	.bg-stack {
		z-index: 0;
	}

	.bg-layer {
		opacity: 0;
		/* Composited up front, so starting a fade never forces WebKit to
		   re-rasterize a large background mid-switch. */
		will-change: opacity;
		transition: opacity var(--fade-ms) ease;
	}

	.bg-layer.shown {
		opacity: 1;
	}

	/* WebKitGTK skips painting fully transparent layers, so a loading layer
	   sits at an invisible 1% to actually decode and draw its first frame. */
	.bg-layer.pending {
		opacity: 0.01;
	}

	.bg-tint {
		z-index: 2;
	}

	.animate .bg-tint {
		transition: background-color var(--fade-ms) ease;
	}

	.instant .bg-layer,
	.instant .bg-tint {
		transition: none;
	}
</style>
