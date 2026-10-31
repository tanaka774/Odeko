<script lang="ts">
	import { onMount } from 'svelte';
	import BackgroundVideo from './BackgroundVideo.svelte';
	import { isVideoBackground, mediaUrl } from '$lib/background';
	import { safeCssUrl } from '$lib/utils';
	import type { MediaLayer } from '$lib/background-layers';

	let {
		src,
		fit,
		position,
		repeat,
		onready
	}: {
		src: string;
		fit: MediaLayer['fit'];
		position: string;
		repeat: boolean;
		/** Fires once the image is painted or the video shows its first frame. */
		onready?: () => void;
	} = $props();

	const isVideo = $derived(isVideoBackground(src));
	const imageUrl = $derived(isVideo ? null : safeCssUrl(mediaUrl(src)));

	onMount(() => {
		if (isVideo) return;
		if (!imageUrl) {
			onready?.();
			return;
		}
		const img = new Image();
		img.src = imageUrl;
		img
			.decode()
			.catch(() => {})
			// Decoding alone does not mean WebKit has painted the layer yet.
			.finally(() => requestAnimationFrame(() => requestAnimationFrame(() => onready?.())));
	});
</script>

{#if isVideo}
	<BackgroundVideo {src} {fit} {position} {onready} />
{:else if imageUrl && repeat}
	<div
		class="bg-media"
		style:background-image={`url("${imageUrl}")`}
		style:background-size={fit === 'stretch' ? '100% 100%' : fit}
		style:background-position={position}
	></div>
{:else if imageUrl}
	<img
		class="bg-media"
		src={imageUrl}
		alt=""
		decoding="sync"
		style:object-fit={fit === 'stretch' ? 'fill' : fit}
		style:object-position={position}
	/>
{/if}

<style>
	.bg-media {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		background-repeat: repeat;
		pointer-events: none;
	}
</style>
