<script lang="ts">
	import { onMount } from 'svelte';
	import HtmlPage from './HtmlPage.svelte';
	import { createInputTracker } from '$lib/background-input';
	import { watchWindowVisibility } from '$lib/window-visibility';

	// Renders an HTML layer as a page. With scripts on, the page receives
	// `odeko-frame` messages with the shared inputs (CSS pixels, top-left
	// origin) every animation frame, and pause/resume while the window hides
	// and shows. An interactive page takes pointer input where no icon covers
	// it while the panel has `interactive-bg`.
	let {
		source,
		scripts,
		interactive,
		onready
	}: {
		source: string;
		scripts: boolean;
		interactive: boolean;
		/** Fires once the page has loaded. */
		onready?: () => void;
	} = $props();

	let iframe = $state<HTMLIFrameElement | null>(null);

	onMount(() => {
		if (!iframe) return;
		const frameEl = iframe;
		let raf = 0;
		let running = false;
		let last = performance.now();
		let time = 0;
		const input = createInputTracker(frameEl);

		function post(message: unknown) {
			frameEl.contentWindow?.postMessage(message, '*');
		}

		function frame(now: number) {
			raf = requestAnimationFrame(frame);
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			time += dt;
			const state = input.sample(now, dt);
			post({ kind: 'odeko-frame', state: { ...state, mouse: undefined, time } });
		}

		function setRunning(visible: boolean) {
			if (!scripts || visible === running) return;
			running = visible;
			if (visible) {
				last = performance.now();
				raf = requestAnimationFrame(frame);
				post({ kind: 'odeko-resume' });
			} else {
				cancelAnimationFrame(raf);
				post({ kind: 'odeko-pause' });
			}
		}

		const stopWatching = watchWindowVisibility(setRunning);

		return () => {
			cancelAnimationFrame(raf);
			stopWatching();
			input.destroy();
		};
	});
</script>

<HtmlPage
	bind:iframe
	class={interactive ? 'bg-html interactive' : 'bg-html'}
	title="Background layer"
	kind="background"
	{source}
	{scripts}
	{onready}
/>

<style>
	:global(.bg-html) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		color-scheme: normal;
		pointer-events: none;
	}
</style>
