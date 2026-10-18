<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import {
		compileShader,
		hasBufferPass,
		MAX_CLICKS,
		MAX_ICONS,
		type CompiledShader
	} from '$lib/background-shaders';
	import { isVideoBackground } from '$lib/background';
	import BackgroundVideo from './BackgroundVideo.svelte';

	// Renders a background shader and feeds it the Shadertoy inputs plus the
	// pointer, the icons and clicks; the wallpaper is bound as iChannel0 and
	// the optional feedback pass ping-pongs between two buffer textures. The
	// layer never takes pointer events itself, so it listens on the window and
	// maps coordinates onto its own canvas (bottom-left origin, like
	// gl_FragCoord).
	let {
		source,
		quality,
		channel,
		onready
	}: {
		source: string;
		quality: number;
		/** Wallpaper image/video exposed as iChannel0. */
		channel: string | null;
		/** Fires once the first frame is drawn, or when the shader cannot run. */
		onready?: () => void;
	} = $props();

	const FRAME_MS = 1000 / 60;
	const CHANNEL_TIMEOUT_MS = 2000;

	let canvas: HTMLCanvasElement;
	let videoLayer = $state<BackgroundVideo>();
	const channelIsVideo = $derived(isVideoBackground(channel));

	interface FeedbackBuffer {
		width: number;
		height: number;
		textures: WebGLTexture[];
		framebuffers: WebGLFramebuffer[];
		/** Index of the texture holding the latest frame. */
		read: number;
	}

	onMount(() => {
		const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false });
		let readyFired = false;
		const markReady = () => {
			if (readyFired) return;
			readyFired = true;
			onready?.();
		};
		// The layer fades in only once the wallpaper texture is there too.
		let channelReady = !channel;
		const channelTimer = setTimeout(() => (channelReady = true), CHANNEL_TIMEOUT_MS);
		if (!gl) {
			console.error('[ShaderBackground] WebGL 2 is not available');
			markReady();
			return;
		}
		// Half floats keep simulations (signed values, slow decay) precise.
		const floatBuffer = gl.getExtension('EXT_color_buffer_float') !== null;

		let image: CompiledShader | null = null;
		let bufferPass: CompiledShader | null = null;
		let buffer: FeedbackBuffer | null = null;
		let compiledSource: string | null = null;
		let failed = false;

		const pointer = { x: 0, y: 0, inside: false, presence: 0, vx: 0, vy: 0, lastX: 0, lastY: 0 };
		const hover = { el: null as HTMLElement | null, rect: [0, 0, 0, 0], amount: 0 };
		const pulse = { x: 0, y: 0, at: -Infinity };
		const mouse = { x: 0, y: 0, clickX: 0, clickY: 0, down: false, clicked: false };
		const clickHistory: { x: number; y: number; at: number }[] = [];
		let time = 0;
		let frameIndex = 0;
		const icons = new Float32Array(MAX_ICONS * 4);
		let iconCount = 0;
		const clicks = new Float32Array(MAX_CLICKS * 3);
		const channelSize = new Float32Array(12);
		let lastVideoTime = -1;

		function createTexture(): WebGLTexture {
			const texture = gl!.createTexture()!;
			gl!.bindTexture(gl!.TEXTURE_2D, texture);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
			gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
			return texture;
		}

		function createBlank(): WebGLTexture {
			const texture = createTexture();
			gl!.texImage2D(
				gl!.TEXTURE_2D,
				0,
				gl!.RGBA,
				1,
				1,
				0,
				gl!.RGBA,
				gl!.UNSIGNED_BYTE,
				new Uint8Array(4)
			);
			return texture;
		}

		const channelTexture = createBlank();
		const blankTexture = createBlank();
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

		function uploadChannel(source: TexImageSource, width: number, height: number) {
			gl!.bindTexture(gl!.TEXTURE_2D, channelTexture);
			try {
				gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source);
				channelSize[0] = width;
				channelSize[1] = height;
				channelSize[2] = 1;
			} catch (error) {
				// A remote file without CORS headers cannot be read back.
				console.warn('[ShaderBackground] wallpaper cannot be used as iChannel0:', error);
			}
			channelReady = true;
		}

		if (channel && !channelIsVideo) {
			const picture = new Image();
			picture.crossOrigin = 'anonymous';
			picture.onload = () => uploadChannel(picture, picture.naturalWidth, picture.naturalHeight);
			picture.onerror = () => (channelReady = true);
			picture.src = channel;
		}

		function updateVideoChannel() {
			const video = videoLayer?.activeElement();
			if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
			if (video.currentTime === lastVideoTime) return;
			lastVideoTime = video.currentTime;
			uploadChannel(video, video.videoWidth, video.videoHeight);
		}

		function updateIcons(bounds: DOMRect, ratio: number) {
			iconCount = 0;
			for (const el of document.querySelectorAll('.icon-wrapper[data-item-id]')) {
				if (iconCount >= MAX_ICONS) break;
				const r = el.getBoundingClientRect();
				icons.set(
					[
						(r.left - bounds.left) * ratio,
						(bounds.bottom - r.bottom) * ratio,
						r.width * ratio,
						r.height * ratio
					],
					iconCount * 4
				);
				iconCount++;
			}
		}

		function releaseBuffer() {
			if (!buffer) return;
			for (const texture of buffer.textures) gl!.deleteTexture(texture);
			for (const framebuffer of buffer.framebuffers) gl!.deleteFramebuffer(framebuffer);
			buffer = null;
		}

		// Zero-filled on creation, so a resize restarts the simulation.
		function ensureBuffer(width: number, height: number): FeedbackBuffer {
			if (buffer && buffer.width === width && buffer.height === height) return buffer;
			releaseBuffer();
			const textures: WebGLTexture[] = [];
			const framebuffers: WebGLFramebuffer[] = [];
			for (let i = 0; i < 2; i++) {
				const texture = createTexture();
				gl!.texImage2D(
					gl!.TEXTURE_2D,
					0,
					floatBuffer ? gl!.RGBA16F : gl!.RGBA8,
					width,
					height,
					0,
					gl!.RGBA,
					floatBuffer ? gl!.HALF_FLOAT : gl!.UNSIGNED_BYTE,
					null
				);
				const framebuffer = gl!.createFramebuffer()!;
				gl!.bindFramebuffer(gl!.FRAMEBUFFER, framebuffer);
				gl!.framebufferTexture2D(
					gl!.FRAMEBUFFER,
					gl!.COLOR_ATTACHMENT0,
					gl!.TEXTURE_2D,
					texture,
					0
				);
				gl!.clearColor(0, 0, 0, 0);
				gl!.clear(gl!.COLOR_BUFFER_BIT);
				textures.push(texture);
				framebuffers.push(framebuffer);
			}
			gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
			buffer = { width, height, textures, framebuffers, read: 0 };
			return buffer;
		}

		let last = performance.now();
		let lastFrame = 0;
		let raf = 0;
		let running = false;

		function releasePrograms() {
			if (image) gl!.deleteProgram(image.program);
			if (bufferPass) gl!.deleteProgram(bufferPass.program);
			image = null;
			bufferPass = null;
		}

		function ensurePrograms() {
			if (source === compiledSource) return;
			compiledSource = source;
			releasePrograms();
			releaseBuffer();
			try {
				image = compileShader(gl!, source);
				if (hasBufferPass(source)) bufferPass = compileShader(gl!, source, 'bufferImage');
				failed = false;
			} catch (error) {
				console.error('[ShaderBackground] shader failed to compile:', error);
				releasePrograms();
				failed = true;
				markReady();
			}
		}

		function resize(): number {
			const ratio = window.devicePixelRatio * quality;
			const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
			const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			return width / Math.max(1, canvas.clientWidth);
		}

		function ease(current: number, target: number, dt: number, rate: number): number {
			return current + (target - current) * (1 - Math.exp(-dt * rate));
		}

		function frame(now: number) {
			raf = requestAnimationFrame(frame);
			if (now - lastFrame < FRAME_MS - 1) return;
			lastFrame = now;
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			time += dt;

			ensurePrograms();
			if (!image) return;

			const ratio = resize();
			const bounds = canvas.getBoundingClientRect();
			pointer.presence = ease(pointer.presence, pointer.inside ? 1 : 0, dt, 8);
			if (dt > 0) {
				pointer.vx = ease(pointer.vx, (pointer.x - pointer.lastX) / dt, dt, 20);
				pointer.vy = ease(pointer.vy, (pointer.lastY - pointer.y) / dt, dt, 20);
			}
			pointer.lastX = pointer.x;
			pointer.lastY = pointer.y;
			hover.amount = ease(hover.amount, hover.el ? 1 : 0, dt, 10);
			if (hover.el) {
				const r = hover.el.getBoundingClientRect();
				hover.rect = [
					(r.left - bounds.left) * ratio,
					(bounds.bottom - r.bottom) * ratio,
					r.width * ratio,
					r.height * ratio
				];
			}

			if (channelIsVideo) updateVideoChannel();
			updateIcons(bounds, ratio);
			const toX = (clientX: number) => (clientX - bounds.left) * ratio;
			const toY = (clientY: number) => (bounds.bottom - clientY) * ratio;
			for (let i = 0; i < MAX_CLICKS; i++) {
				const click = clickHistory[i];
				clicks.set(
					click ? [toX(click.x), toY(click.y), (now - click.at) / 1000] : [0, 0, 1e3],
					i * 3
				);
			}
			const date = new Date();
			const seconds =
				date.getHours() * 3600 +
				date.getMinutes() * 60 +
				date.getSeconds() +
				date.getMilliseconds() / 1000;

			function draw(pass: CompiledShader, bufferTexture: WebGLTexture) {
				const u = pass.uniforms;
				gl!.useProgram(pass.program);
				gl!.uniform3f(u.iResolution, canvas.width, canvas.height, 1);
				gl!.uniform1f(u.iTime, time);
				gl!.uniform1f(u.iTimeDelta, dt);
				gl!.uniform1i(u.iFrame, frameIndex);
				// Shadertoy convention: xy follows a held button, zw is the press
				// position, z is negative once released and w only positive on the
				// frame of the press.
				gl!.uniform4f(
					u.iMouse,
					toX(mouse.x),
					toY(mouse.y),
					mouse.down ? toX(mouse.clickX) : -toX(mouse.clickX),
					mouse.clicked ? toY(mouse.clickY) : -toY(mouse.clickY)
				);
				gl!.uniform4f(u.iDate, date.getFullYear(), date.getMonth(), date.getDate(), seconds);
				gl!.activeTexture(gl!.TEXTURE0);
				gl!.bindTexture(gl!.TEXTURE_2D, channelTexture);
				gl!.uniform1i(u.iChannel0, 0);
				gl!.uniform3fv(u.iChannelResolution, channelSize);
				gl!.activeTexture(gl!.TEXTURE1);
				gl!.bindTexture(gl!.TEXTURE_2D, bufferTexture);
				gl!.uniform1i(u.odBuffer, 1);
				gl!.uniform1f(u.odPixelRatio, ratio);
				gl!.uniform3f(u.odPointer, toX(pointer.x), toY(pointer.y), pointer.presence);
				gl!.uniform2f(u.odPointerVelocity, pointer.vx, pointer.vy);
				gl!.uniform4f(u.odHover, hover.rect[0], hover.rect[1], hover.rect[2], hover.rect[3]);
				gl!.uniform1f(u.odHoverAmount, hover.amount);
				gl!.uniform3f(
					u.odPulse,
					toX(pulse.x),
					toY(pulse.y),
					Math.min(1e3, (now - pulse.at) / 1000)
				);
				gl!.uniform3fv(u.odClicks, clicks);
				gl!.uniform4fv(u.odIcons, icons);
				gl!.uniform1i(u.odIconCount, iconCount);
				gl!.viewport(0, 0, canvas.width, canvas.height);
				gl!.drawArrays(gl!.TRIANGLES, 0, 3);
			}

			let bufferTexture = blankTexture;
			if (bufferPass) {
				const feedback = ensureBuffer(canvas.width, canvas.height);
				const write = 1 - feedback.read;
				gl!.bindFramebuffer(gl!.FRAMEBUFFER, feedback.framebuffers[write]);
				draw(bufferPass, feedback.textures[feedback.read]);
				gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
				feedback.read = write;
				bufferTexture = feedback.textures[write];
			}
			draw(image, bufferTexture);
			frameIndex++;
			mouse.clicked = false;
			if (!readyFired && channelReady) requestAnimationFrame(markReady);
		}

		function start() {
			if (running || failed) return;
			running = true;
			last = performance.now();
			raf = requestAnimationFrame(frame);
		}

		function stop() {
			running = false;
			cancelAnimationFrame(raf);
		}

		function insideCanvas(event: PointerEvent): boolean {
			const bounds = canvas.getBoundingClientRect();
			return (
				event.clientX >= bounds.left &&
				event.clientX <= bounds.right &&
				event.clientY >= bounds.top &&
				event.clientY <= bounds.bottom
			);
		}

		function onPointerMove(event: PointerEvent) {
			// Entering the canvas is not movement; don't report the jump as velocity.
			if (!pointer.inside) {
				pointer.lastX = event.clientX;
				pointer.lastY = event.clientY;
			}
			pointer.x = event.clientX;
			pointer.y = event.clientY;
			pointer.inside = insideCanvas(event);
			if (mouse.down) {
				mouse.x = event.clientX;
				mouse.y = event.clientY;
			}
			const target = event.target instanceof Element ? event.target : null;
			hover.el = target?.closest<HTMLElement>('.icon-wrapper[data-item-id]') ?? null;
		}

		function onPointerLeave() {
			pointer.inside = false;
			hover.el = null;
		}

		function onPointerDown(event: PointerEvent) {
			if (event.button !== 0 || !insideCanvas(event)) return;
			mouse.x = mouse.clickX = event.clientX;
			mouse.y = mouse.clickY = event.clientY;
			mouse.down = true;
			mouse.clicked = true;
			clickHistory.unshift({ x: event.clientX, y: event.clientY, at: performance.now() });
			clickHistory.length = Math.min(clickHistory.length, MAX_CLICKS);
			const target = event.target instanceof Element ? event.target : null;
			const icon = target?.closest('.icon-wrapper[data-item-id]');
			if (!icon || icon.querySelector('.edit-mode')) return;
			pulse.x = event.clientX;
			pulse.y = event.clientY;
			pulse.at = performance.now();
		}

		function onPointerUp() {
			mouse.down = false;
		}

		function onContextLost(event: Event) {
			event.preventDefault();
			stop();
			image = null;
			bufferPass = null;
			buffer = null;
			compiledSource = null;
		}

		function onContextRestored() {
			start();
		}

		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerdown', onPointerDown, true);
		window.addEventListener('pointerup', onPointerUp, true);
		document.documentElement.addEventListener('pointerleave', onPointerLeave);
		canvas.addEventListener('webglcontextlost', onContextLost);
		canvas.addEventListener('webglcontextrestored', onContextRestored);

		// Same policy as the video background: render only while the window is visible.
		const appWindow = getCurrentWindow();
		let unlisten: (() => void) | null = null;
		let disposed = false;
		void appWindow
			.onFocusChanged(async ({ payload: focused }) => {
				if (focused) start();
				else if (!(await appWindow.isVisible())) stop();
			})
			.then((un) => {
				if (disposed) un();
				else unlisten = un;
			});
		void appWindow.isVisible().then((visible) => {
			if (disposed) return;
			if (visible) start();
			else markReady();
		});

		return () => {
			disposed = true;
			clearTimeout(channelTimer);
			stop();
			unlisten?.();
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('pointerup', onPointerUp, true);
			document.documentElement.removeEventListener('pointerleave', onPointerLeave);
			canvas.removeEventListener('webglcontextlost', onContextLost);
			canvas.removeEventListener('webglcontextrestored', onContextRestored);
			releasePrograms();
			releaseBuffer();
			gl.deleteTexture(channelTexture);
			gl.deleteTexture(blankTexture);
			gl.getExtension('WEBGL_lose_context')?.loseContext();
		};
	});
</script>

{#if channel && channelIsVideo}
	<BackgroundVideo bind:this={videoLayer} src={channel} texture />
{/if}
<canvas bind:this={canvas} class="bg-shader"></canvas>

<style>
	.bg-shader {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
		pointer-events: none;
	}
</style>
