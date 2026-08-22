<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { invoke } from '@tauri-apps/api/core';
	import type { UnlistenFn } from '@tauri-apps/api/event';
	import { backgroundFilePath } from '$lib/background';

	// Video background layer for the launcher overlay.
	//
	// Why the server URL: on Linux (WebKitGTK) a <video> cannot play from
	// the asset:// protocol, and data: URLs get rejected by the media
	// engine once the file exceeds a few dozen MB. The embedded localhost
	// server streams the file with HTTP Range support, so memory stays
	// flat no matter how large the video is.
	//
	// Why TWO video elements: the engine's built-in `loop` performs a seek
	// back to 0 at the end of the video, which shows a visible hiccup
	// (and the WebKitGTK pipeline occasionally stalls there). Instead we
	// start a hidden twin video shortly before the active one ends and
	// swap them the moment the active one finishes - no seek, no seam.
	//
	// Performance notes:
	// - The native <video> element is decoded by the GPU, so playback is cheap.
	// - The launcher window spends most of its life hidden, so we pause the
	//   video while the window is hidden and resume it when it is shown again.
	//   While hidden, the video costs literally 0% CPU/GPU.
	// - `muted` both allows autoplay and skips the whole audio pipeline.
	let {
		src,
		fit = 'cover',
		position = 'center',
		tintColor,
		tintOpacity
	}: {
		src: string;
		fit?: 'cover' | 'contain' | 'stretch';
		position?: string;
		tintColor: string;
		tintOpacity: number;
	} = $props();

	let videoA = $state<HTMLVideoElement>();
	let videoB = $state<HTMLVideoElement>();
	// Which of the twin videos is currently on top.
	let activeIsA = $state(true);
	// Resolved, playable URL for the <video> element (null while loading).
	let videoSrc = $state<string | null>(null);
	// When the file cannot be played, fall back to the plain color
	// background so the launcher never looks broken.
	let failed = $state(false);

	// CSS object-fit calls the "stretch" behavior "fill".
	let objectFit = $derived(fit === 'stretch' ? 'fill' : fit);
	let tint = $derived(`rgba(${tintColor}, ${tintOpacity})`);

	function activeVideo(): HTMLVideoElement | undefined {
		return activeIsA ? videoA : videoB;
	}

	function standbyVideo(): HTMLVideoElement | undefined {
		return activeIsA ? videoB : videoA;
	}

	// Turns the stored setting value (plain path, asset: URL, http(s) URL or
	// data: URL) into something the <video> element can actually play.
	async function resolveSource(value: string) {
		failed = false;
		videoSrc = null;
		const filePath = backgroundFilePath(value);
		if (!filePath) {
			// Remote or inline source: the webview can stream it directly.
			videoSrc = value;
			return;
		}
		try {
			videoSrc = await invoke<string>('register_background_video', { path: filePath });
		} catch (error) {
			console.error('[BackgroundVideo] could not register video file:', filePath, error);
			failed = true;
		}
	}

	$effect(() => {
		void resolveSource(src);
	});

	// The `autoplay` attribute alone is unreliable in WebKitGTK, and the
	// focus/visibility handler in onMount cannot fire when the very first
	// video is applied while the window stays focused the whole time (e.g.
	// picking a file in the settings dialog). So whenever a fresh active
	// video element appears, start playback explicitly once it has loaded a
	// frame, but only while the window is actually visible.
	$effect(() => {
		const video = activeVideo();
		if (!video || !videoSrc || failed) return;

		const start = () => {
			void getCurrentWindow()
				.isVisible()
				.then((visible) => {
					if (visible) void video.play().catch(() => {});
				});
		};

		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
			start();
			return;
		}
		video.addEventListener('loadeddata', start, { once: true });
		return () => video.removeEventListener('loadeddata', start);
	});

	function handleError() {
		console.error('[BackgroundVideo] playback error:', activeVideo()?.error);
		failed = true;
	}

	// Seamless loop driver: watches the active video's remaining time via
	// requestAnimationFrame (timeupdate is too coarse, firing only ~4x/s).
	// The twin starts playing hidden shortly before the end; when the
	// active video ends, the twin moves to the front and the old one is
	// rewound to become the new standby.
	const SWAP_THRESHOLD_SECONDS = 0.3;

	function loopTick() {
		const active = activeVideo();
		const standby = standbyVideo();
		if (active && standby && active.duration > 0) {
			const remaining = active.duration - active.currentTime;
			if (remaining < SWAP_THRESHOLD_SECONDS && remaining > 0 && standby.paused) {
				standby.currentTime = 0;
				void standby.play().catch(() => {});
			}
			if (active.ended) {
				activeIsA = !activeIsA;
				active.pause();
				active.currentTime = 0;
			}
		}
		requestAnimationFrame(loopTick);
	}

	onMount(() => {
		let unlisten: UnlistenFn | null = null;
		let disposed = false;
		const raf = requestAnimationFrame(loopTick);

		async function setup() {
			const window = getCurrentWindow();
			const un = await window.onFocusChanged(async ({ payload: focused }) => {
				if (failed) return;
				if (focused) {
					// Window shown again -> resume playback.
					await activeVideo()
						?.play()
						.catch(() => {});
				} else if (!(await window.isVisible())) {
					// Window hidden -> pause so decoding stops completely.
					// (Blurred but still visible, e.g. alt-tab, keeps playing.)
					videoA?.pause();
					videoB?.pause();
				}
			});
			if (disposed) {
				un();
				return;
			}
			unlisten = un;

			// Autoplay may have been blocked before the window was shown; if the
			// window is already visible, make sure playback is running.
			if (await window.isVisible()) {
				await activeVideo()
					?.play()
					.catch(() => {});
			}
		}
		void setup();

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			unlisten?.();
		};
	});
</script>

<!-- Base color doubles as the loading state and the error fallback. -->
<div class="bg-video-layer" style:background={tint}>
	{#if !failed && videoSrc}
		<video
			bind:this={videoA}
			class="bg-video"
			class:bg-video-top={activeIsA}
			src={videoSrc}
			style:object-fit={objectFit}
			style:object-position={position}
			muted
			autoplay
			playsinline
			preload="auto"
			onerror={handleError}
		></video>
		<video
			bind:this={videoB}
			class="bg-video"
			class:bg-video-top={!activeIsA}
			src={videoSrc}
			style:object-fit={objectFit}
			style:object-position={position}
			muted
			playsinline
			preload="auto"
			onerror={handleError}
		></video>
		<!-- Same color tint the image background gets via CSS gradient. -->
		<div class="bg-video-tint" style:background={tint}></div>
	{/if}
</div>

<style>
	.bg-video-layer {
		position: absolute;
		inset: 0;
		z-index: 0;
		/* Never block clicks / context menus on the overlay. */
		pointer-events: none;
	}

	.bg-video {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		/* Standby video waits invisibly below the active one. */
		z-index: 0;
	}

	.bg-video-top {
		z-index: 1;
	}

	.bg-video-tint {
		position: absolute;
		inset: 0;
		z-index: 2;
	}
</style>
