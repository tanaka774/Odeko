<script lang="ts">
	import { onMount } from 'svelte';
	import {
		compileShader,
		hasBufferPass,
		MAX_CLICKS,
		MAX_ICONS,
		type CompiledShader
	} from '$lib/background-shaders';
	import { isVideoBackground, mediaUrl } from '$lib/background';
	import { createInputTracker } from '$lib/background-input';
	import { watchWindowVisibility } from '$lib/window-visibility';
	import BackgroundVideo from './BackgroundVideo.svelte';

	// Renders a shader layer and feeds it the Shadertoy inputs plus the
	// pointer, icons and clicks (in canvas pixels, bottom-left origin like
	// gl_FragCoord); the layer's texture is bound as iChannel0 and the
	// optional feedback pass ping-pongs between two buffer textures.
	let {
		source,
		channel,
		quality,
		fps,
		onready
	}: {
		source: string;
		/** Image/video exposed as iChannel0. */
		channel: string | null;
		quality: number;
		/** Frame rate cap; 0 = display rate. */
		fps: number;
		/** Fires once the first frame is drawn, or when the shader cannot run. */
		onready?: () => void;
	} = $props();

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

		const input = createInputTracker(canvas);
		let time = 0;
		let frameIndex = 0;
		const icons = new Float32Array(MAX_ICONS * 4);
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
			picture.src = mediaUrl(channel);
		}

		function updateVideoChannel() {
			const video = videoLayer?.activeElement();
			if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
			if (video.currentTime === lastVideoTime) return;
			lastVideoTime = video.currentTime;
			uploadChannel(video, video.videoWidth, video.videoHeight);
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

		function frame(now: number) {
			raf = requestAnimationFrame(frame);
			if (fps > 0 && now - lastFrame < 1000 / fps - 1) return;
			lastFrame = now;
			const dt = Math.min(0.1, (now - last) / 1000);
			last = now;
			time += dt;

			ensurePrograms();
			if (!image) return;

			const ratio = resize();
			const state = input.sample(now, dt);
			if (channelIsVideo) updateVideoChannel();
			// CSS pixels, top-left origin -> canvas pixels, bottom-left origin.
			const toX = (x: number) => x * ratio;
			const toY = (y: number) => (state.height - y) * ratio;
			const rect = (r: { x: number; y: number; width: number; height: number }) => [
				toX(r.x),
				toY(r.y + r.height),
				r.width * ratio,
				r.height * ratio
			];
			const iconCount = state.icons.length;
			state.icons.forEach((icon, i) => icons.set(rect(icon), i * 4));
			for (let i = 0; i < MAX_CLICKS; i++) {
				const click = state.clicks[i];
				clicks.set(click ? [toX(click.x), toY(click.y), click.age] : [0, 0, 1e3], i * 3);
			}
			const hover = rect(state.hover);
			const mouse = state.mouse;
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
				gl!.uniform3f(
					u.odPointer,
					toX(state.pointer.x),
					toY(state.pointer.y),
					state.pointer.presence
				);
				gl!.uniform2f(u.odPointerVelocity, state.velocity.x, -state.velocity.y);
				gl!.uniform4f(u.odHover, hover[0], hover[1], hover[2], hover[3]);
				gl!.uniform1f(u.odHoverAmount, state.hover.amount);
				gl!.uniform3f(
					u.odPulse,
					toX(state.pulse.x),
					toY(state.pulse.y),
					Math.min(1e3, state.pulse.age)
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

		canvas.addEventListener('webglcontextlost', onContextLost);
		canvas.addEventListener('webglcontextrestored', onContextRestored);

		// A hidden window draws nothing, so there is no first frame to wait for.
		const stopWatching = watchWindowVisibility((visible) => {
			if (visible) start();
			else {
				stop();
				markReady();
			}
		});

		return () => {
			clearTimeout(channelTimer);
			stop();
			stopWatching();
			input.destroy();
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
