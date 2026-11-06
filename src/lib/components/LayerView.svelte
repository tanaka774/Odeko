<script lang="ts">
	import { onMount } from 'svelte';
	import HtmlLayer from './HtmlLayer.svelte';
	import MediaLayerView from './MediaLayerView.svelte';
	import ShaderBackground from './ShaderBackground.svelte';
	import { safeRgbColor } from '$lib/utils';
	import { isInteractive, type BackgroundLayer, type LayerContent } from '$lib/background-layers';

	// One rendered version of a layer. `content` is frozen for this version
	// (a change mounts a new version); everything else in `layer` updates live.
	let {
		layer,
		content,
		onready
	}: {
		layer: BackgroundLayer;
		content: LayerContent;
		onready: () => void;
	} = $props();

	const empty = $derived(layer.type !== 'color' && !content.source.trim());

	const colorBackground = $derived.by(() => {
		if (layer.type !== 'color') return '';
		const first = `rgb(${safeRgbColor(layer.color, '20, 20, 30')})`;
		if (!layer.color2) return first;
		return `linear-gradient(${layer.angle}deg, ${first}, rgb(${safeRgbColor(layer.color2, '20, 20, 30')}))`;
	});

	onMount(() => {
		if (layer.type === 'color' || empty) onready();
	});
</script>

{#if layer.type === 'color'}
	<div class="bg-color" style:background={colorBackground}></div>
{:else if empty}{:else if layer.type === 'media'}
	<MediaLayerView
		src={content.source}
		fit={layer.fit}
		position={layer.position}
		repeat={layer.repeat}
		{onready}
	/>
{:else if layer.type === 'shader'}
	<ShaderBackground
		source={content.source}
		channel={content.texture}
		quality={layer.quality}
		fps={layer.fps}
		{onready}
	/>
{:else}
	<HtmlLayer
		source={content.source}
		scripts={content.scripts}
		interactive={isInteractive(layer)}
		{onready}
	/>
{/if}

<style>
	.bg-color {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
</style>
