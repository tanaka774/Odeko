<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import BackgroundSlot from './BackgroundSlot.svelte';
	import type { BackgroundLayer } from '$lib/background-layers';

	// Paints one placement (behind or over the icons) of the background as a
	// scene: the enabled layers of that placement. Edits to the same set of
	// layers apply in place (each slot crossfades its own content); a
	// different set (e.g. a preset switch) becomes a new scene that stays
	// invisible until every layer has drawn, then crossfades over the old
	// one. `prepare` loads the next scene while the current one stays on
	// screen.
	let {
		layers,
		animate = false,
		instant = false
	}: {
		/** Enabled layers of this placement, bottom first. */
		layers: BackgroundLayer[];
		animate?: boolean;
		/** Swap without crossfading, for when the whole panel is faded out. */
		instant?: boolean;
	} = $props();

	const FADE_MS = 280;

	interface Scene {
		id: number;
		key: string;
		layers: BackgroundLayer[];
		readyIds: string[];
		committed: boolean;
	}

	let scenes = $state<Scene[]>([]);
	let nextId = 1;
	let pruneTimer: ReturnType<typeof setTimeout> | null = null;
	const readyWaiters = new Map<number, () => void>();

	function sceneKey(list: BackgroundLayer[]): string {
		return list
			.map((layer) => layer.id)
			.sort()
			.join('|');
	}

	function isReady(scene: Scene): boolean {
		return scene.layers.every((layer) => scene.readyIds.includes(layer.id));
	}

	let shownId = $derived(scenes.findLast((s) => s.committed && isReady(s))?.id ?? null);
	let shownIndex = $derived(scenes.findIndex((s) => s.id === shownId));

	$effect(() => {
		const id = shownId;
		if (id === null) return;
		untrack(() => {
			if (pruneTimer) clearTimeout(pruneTimer);
			pruneTimer = setTimeout(() => {
				pruneTimer = null;
				const keepFrom = scenes.findIndex((s) => s.id === id);
				if (keepFrom > 0) scenes = scenes.slice(keepFrom);
			}, FADE_MS);
		});
	});

	function settle(scene: Scene) {
		if (!isReady(scene)) return;
		readyWaiters.get(scene.id)?.();
		readyWaiters.delete(scene.id);
	}

	function markLayerReady(sceneId: number, layerId: string) {
		const scene = scenes.find((s) => s.id === sceneId);
		if (!scene || scene.readyIds.includes(layerId)) return;
		scene.readyIds.push(layerId);
		settle(scene);
	}

	function addScene(list: BackgroundLayer[], committed: boolean): Scene {
		// Scenes that never became visible are superseded outright.
		const kept = scenes.filter((s) => s.committed && isReady(s));
		for (const scene of scenes) {
			if (!kept.includes(scene)) {
				readyWaiters.get(scene.id)?.();
				readyWaiters.delete(scene.id);
			}
		}
		scenes = [
			...kept,
			{ id: nextId++, key: sceneKey(list), layers: list, readyIds: [], committed }
		];
		return scenes.at(-1)!;
	}

	/** Loads the layers of `next` hidden; resolves once they can be shown without a gap. */
	export function prepare(next: BackgroundLayer[]): Promise<void> {
		if (scenes.at(-1)?.key === sceneKey(next)) return Promise.resolve();
		const scene = addScene(next, false);
		if (isReady(scene)) return Promise.resolve();
		return new Promise((resolve) => readyWaiters.set(scene.id, resolve));
	}

	$effect(() => {
		const list = layers;
		const key = sceneKey(list);
		untrack(() => {
			const top = scenes.at(-1);
			if (top && top.key === key) {
				top.layers = list;
				top.committed = true;
				return;
			}
			addScene(list, true);
		});
	});

	onDestroy(() => {
		if (pruneTimer) clearTimeout(pruneTimer);
		for (const resolve of readyWaiters.values()) resolve();
	});
</script>

<div class="bg-stack" class:animate class:instant style:--fade-ms="{FADE_MS}ms">
	{#each scenes as scene, index (scene.id)}
		<div class="bg-scene" class:shown={scene.id === shownId} class:pending={index > shownIndex}>
			{#each [...scene.layers].sort((a, b) => (a.id < b.id ? -1 : 1)) as layer (layer.id)}
				<BackgroundSlot
					{layer}
					z={scene.layers.indexOf(layer)}
					onready={() => markLayerReady(scene.id, layer.id)}
				/>
			{/each}
		</div>
	{/each}
</div>

<style>
	.bg-stack,
	.bg-scene {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	/* Blend modes mix layers of this stack only, not the window behind it. */
	.bg-stack {
		isolation: isolate;
	}

	.bg-scene {
		opacity: 0;
		/* Composited up front, so starting a fade never forces WebKit to
		   re-rasterize a large background mid-switch. */
		will-change: opacity;
		transition: opacity var(--fade-ms) ease;
	}

	.bg-scene.shown {
		opacity: 1;
	}

	/* WebKitGTK skips painting fully transparent layers, so a loading scene
	   sits at an invisible 1% to actually decode and draw its first frame. */
	.bg-scene.pending {
		opacity: 0.01;
	}

	.animate :global(.bg-color) {
		transition: background var(--fade-ms) ease;
	}

	.instant .bg-scene,
	.instant :global(.bg-version) {
		transition: none;
	}
</style>
