<script module lang="ts">
	import { invoke } from '@tauri-apps/api/core';

	let libraryBase: Promise<string | null> | null = null;

	function getLibraryBase(): Promise<string | null> {
		libraryBase ??= invoke<string>('library_base_url').catch((error) => {
			console.error('[HtmlLayer] library cache unavailable:', error);
			return null;
		});
		return libraryBase;
	}

	// Re-fires a right-click the frame handed back (see HELPER_SCRIPT) on the
	// app element under it. Every HTML layer covers the canvas panel, so the
	// first one's rect maps the position for all of them.
	function forwardContextMenu(event: MessageEvent) {
		if (event.origin !== 'null' || event.data?.kind !== 'odeko-contextmenu') return;
		const frame = document.querySelector('.bg-html');
		const { x, y } = event.data as { x: unknown; y: unknown };
		if (!frame || typeof x !== 'number' || typeof y !== 'number') return;
		const rect = frame.getBoundingClientRect();
		const clientX = rect.left + x;
		const clientY = rect.top + y;
		document
			.elementFromPoint(clientX, clientY)
			?.dispatchEvent(
				new MouseEvent('contextmenu', {
					bubbles: true,
					cancelable: true,
					button: 2,
					clientX,
					clientY
				})
			);
	}

	if (typeof window !== 'undefined') window.addEventListener('message', forwardContextMenu);
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { buildSrcdoc } from '$lib/background-html';
	import { createInputTracker } from '$lib/background-input';
	import { watchWindowVisibility } from '$lib/window-visibility';

	// Renders an HTML layer in a sandboxed iframe. With scripts on, the page
	// receives `odeko-frame` messages with the shared inputs (CSS pixels,
	// top-left origin) every animation frame, and pause/resume while the
	// window hides and shows.
	let {
		source,
		scripts,
		onready
	}: {
		source: string;
		scripts: boolean;
		/** Fires once the page has loaded. */
		onready?: () => void;
	} = $props();

	let iframe: HTMLIFrameElement;
	let srcdoc = $state<string | null>(null);

	onMount(() => {
		let disposed = false;
		let raf = 0;
		let running = false;
		let last = performance.now();
		let time = 0;
		const input = createInputTracker(iframe);

		void (scripts ? getLibraryBase() : Promise.resolve(null)).then((base) => {
			if (!disposed) srcdoc = buildSrcdoc(source, scripts, base);
		});

		function post(message: unknown) {
			iframe.contentWindow?.postMessage(message, '*');
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
			disposed = true;
			cancelAnimationFrame(raf);
			stopWatching();
			input.destroy();
		};
	});
</script>

<iframe
	bind:this={iframe}
	class="bg-html"
	title="Background layer"
	sandbox="allow-scripts"
	{srcdoc}
	onload={() => srcdoc !== null && onready?.()}
></iframe>

<style>
	.bg-html {
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
