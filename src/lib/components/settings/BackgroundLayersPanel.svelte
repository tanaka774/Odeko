<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { open, save } from '@tauri-apps/plugin-dialog';
	import { writeText } from '@tauri-apps/plugin-clipboard-manager';
	import Slider from '$lib/components/ui/slider/slider.svelte';
	import ColorInput from '$lib/components/ColorInput.svelte';
	import { isVideoBackground } from '$lib/background';
	import { checkShader } from '$lib/background-shaders';
	import {
		BLEND_MODES,
		MEDIA_POSITIONS,
		createLayer,
		newLayerId,
		sanitizeLayer,
		type BackgroundLayer,
		type LayerType
	} from '$lib/background-layers';

	let {
		layers = $bindable(),
		onpreview
	}: {
		/** Staged stack, bottom first. */
		layers: BackgroundLayer[];
		/** The stack to show on the canvas: shaders keep their last source that compiled. */
		onpreview: (layers: BackgroundLayer[]) => void;
	} = $props();

	const DOCS = {
		shader: 'https://github.com/tanaka774/Odeko/tree/main/examples/custom-shaders',
		html: 'https://github.com/tanaka774/Odeko/tree/main/examples/custom-html-backgrounds'
	};
	const TYPE_LABELS: Record<LayerType, string> = {
		color: 'Color',
		media: 'Image / Video',
		shader: 'Shader',
		html: 'HTML'
	};
	const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'];
	const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv'];
	const MEDIA_FILTERS = [
		{ name: 'Images', extensions: IMAGE_EXTENSIONS },
		{ name: 'Videos', extensions: VIDEO_EXTENSIONS }
	];

	let selectedId = $state<string | null>(layers.at(-1)?.id ?? null);
	let confirmingDelete = $state(false);
	let status = $state<{ kind: 'note' | 'error'; text: string } | null>(null);
	let cacheSize = $state<number | null>(null);

	const selected = $derived(layers.find((layer) => layer.id === selectedId) ?? null);
	// Listed top-most first, like the stack reads on screen.
	const listed = $derived([...layers].reverse());

	// Shader sources only reach the canvas once they compile, so typing never
	// blanks the preview; HTML is debounced so the page is not reloaded on
	// every keystroke.
	let shownSources = $state<Record<string, string>>({});
	let shaderErrors = $state<Record<string, string | null>>({});

	function settleSource(layer: BackgroundLayer) {
		if (layer.type === 'shader') {
			const error = layer.source.trim() ? checkShader(layer.source) : null;
			shaderErrors[layer.id] = error;
			if (!error) shownSources[layer.id] = layer.source;
		} else if (layer.type === 'html') {
			shownSources[layer.id] = layer.source;
		}
	}

	$effect(() => {
		const snapshot = $state.snapshot(layers) as BackgroundLayer[];
		const fresh = snapshot.filter((layer) => !(layer.id in shownSources));
		fresh.forEach(settleSource);
		const timer = setTimeout(() => snapshot.forEach(settleSource), 400);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		onpreview(
			layers.map((layer) =>
				layer.type === 'shader' || layer.type === 'html'
					? { ...layer, source: shownSources[layer.id] ?? '' }
					: layer
			)
		);
	});

	$effect(() => {
		if (layers.some((layer) => layer.type === 'html')) void refreshCacheSize();
	});

	async function refreshCacheSize() {
		cacheSize = await invoke<number>('library_cache_size').catch(() => null);
	}

	async function clearCache() {
		await invoke('clear_library_cache');
		await refreshCacheSize();
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function select(id: string) {
		selectedId = id;
		confirmingDelete = false;
	}

	function insert(layer: BackgroundLayer) {
		layers = [...layers, layer];
		select(layer.id);
	}

	function move(id: string, step: 1 | -1) {
		const index = layers.findIndex((layer) => layer.id === id);
		const target = index + step;
		if (index < 0 || target < 0 || target >= layers.length) return;
		const next = [...layers];
		[next[index], next[target]] = [next[target], next[index]];
		layers = next;
	}

	function remove(id: string) {
		const index = layers.findIndex((layer) => layer.id === id);
		layers = layers.filter((layer) => layer.id !== id);
		selectedId = layers[Math.min(index, layers.length - 1)]?.id ?? null;
		confirmingDelete = false;
	}

	function duplicate(layer: BackgroundLayer) {
		const copy = { ...$state.snapshot(layer), id: newLayerId(), name: `${layer.name} copy` };
		const index = layers.findIndex((entry) => entry.id === layer.id);
		layers = [...layers.slice(0, index + 1), copy, ...layers.slice(index + 1)];
		select(copy.id);
	}

	function fileName(path: string): string {
		return path.split(/[\\/]/).pop() ?? path;
	}

	function extension(path: string): string {
		return path.split('.').pop()?.toLowerCase() ?? '';
	}

	async function run(task: () => Promise<void>) {
		status = null;
		try {
			await task();
		} catch (error) {
			status = { kind: 'error', text: String(error) };
		}
	}

	async function pickFile(filters: { name: string; extensions: string[] }[]) {
		const path = await open({ multiple: false, filters });
		return typeof path === 'string' ? path : null;
	}

	async function readText(path: string): Promise<string> {
		const file = await invoke<{ content: string }>('read_text_file', { path });
		return file.content;
	}

	function importLayer(content: string) {
		const layer = sanitizeLayer(JSON.parse(content));
		if (!layer) throw new Error('This file is not an Odeko background layer.');
		layer.id = newLayerId();
		if (layer.type === 'shader' || layer.type === 'html') {
			layer.file = null;
			layer.watch = false;
		}
		if (layer.type === 'html' && layer.scripts) {
			layer.scripts = false;
			status = {
				kind: 'note',
				text: 'Scripts are off for imported HTML layers. Turn them on if you trust it.'
			};
		}
		insert(layer);
	}

	// Shader/HTML files stay linked and reload on change; .json is an exported layer.
	async function openFile() {
		await run(async () => {
			const path = await pickFile([
				{
					name: 'Background layers',
					extensions: [
						'glsl',
						'frag',
						'html',
						'htm',
						'json',
						...IMAGE_EXTENSIONS,
						...VIDEO_EXTENSIONS
					]
				}
			]);
			if (!path) return;
			const ext = extension(path);
			const name = fileName(path).replace(/\.[^.]+$/, '');
			if (ext === 'json') {
				importLayer(await readText(path));
			} else if (ext === 'glsl' || ext === 'frag' || ext === 'html' || ext === 'htm') {
				const type = ext === 'glsl' || ext === 'frag' ? 'shader' : 'html';
				insert(createLayer(type, { name, source: await readText(path), file: path, watch: true }));
			} else {
				insert(createLayer('media', { name, src: path }));
			}
		});
	}

	async function exportLayer(layer: BackgroundLayer) {
		await run(async () => {
			const path = await save({
				defaultPath: `${layer.name.replace(/[\\/:*?"<>|]/g, '_') || 'layer'}.json`,
				filters: [{ name: 'Odeko layer', extensions: ['json'] }]
			});
			if (!path) return;
			const data = $state.snapshot(layer) as BackgroundLayer;
			if ((data.type === 'shader' || data.type === 'html') && data.file) {
				data.source = await readText(data.file);
				data.file = null;
				data.watch = false;
			}
			await invoke('write_text_file', { path, content: JSON.stringify(data, null, '\t') });
			status = { kind: 'note', text: `Exported "${layer.name}".` };
		});
	}

	async function linkSourceFile(layer: BackgroundLayer & { type: 'shader' | 'html' }) {
		await run(async () => {
			const path = await pickFile([
				layer.type === 'shader'
					? { name: 'GLSL', extensions: ['glsl', 'frag'] }
					: { name: 'HTML', extensions: ['html', 'htm'] }
			]);
			if (!path) return;
			layer.source = await readText(path);
			layer.file = path;
			layer.watch = true;
		});
	}

	async function unlinkSourceFile(layer: BackgroundLayer & { type: 'shader' | 'html' }) {
		await run(async () => {
			if (layer.file) layer.source = await readText(layer.file);
			layer.file = null;
			layer.watch = false;
		});
	}

	async function pickMedia(apply: (path: string) => void) {
		await run(async () => {
			const path = await pickFile(MEDIA_FILTERS);
			if (path) apply(path);
		});
	}
</script>

<section class="layers-panel">
	<header class="panel-head">
		<h3>Layers</h3>
		<div class="row">
			<button class="btn" onclick={() => insert(createLayer('color'))}>+ Color</button>
			<button class="btn" onclick={() => insert(createLayer('media'))}>+ Image / Video</button>
			<button class="btn" onclick={() => insert(createLayer('shader'))}>+ Shader</button>
			<button class="btn" onclick={() => insert(createLayer('html'))}>+ HTML</button>
			<button class="btn" onclick={openFile}>Open file…</button>
		</div>
	</header>

	{#if status}
		<p class="status" class:error={status.kind === 'error'}>{status.text}</p>
	{/if}

	<div class="layer-list">
		{#each listed as layer, index (layer.id)}
			<div class="layer-row" class:active={layer.id === selectedId} class:off={!layer.enabled}>
				<input type="checkbox" aria-label={`Show ${layer.name}`} bind:checked={layer.enabled} />
				<button class="row-main" onclick={() => select(layer.id)}>
					<span class="name">{layer.name}</span>
					<span class="meta"
						>{TYPE_LABELS[layer.type]}{layer.placement === 'above' ? ' · over icons' : ''}</span
					>
				</button>
				<button
					class="icon-btn"
					aria-label={`Move ${layer.name} up`}
					disabled={index === 0}
					onclick={() => move(layer.id, 1)}>▲</button
				>
				<button
					class="icon-btn"
					aria-label={`Move ${layer.name} down`}
					disabled={index === listed.length - 1}
					onclick={() => move(layer.id, -1)}>▼</button
				>
			</div>
		{:else}
			<p class="empty">No layers: the canvas is fully transparent.</p>
		{/each}
	</div>

	{#if selected}
		{@const layer = selected}
		<div class="editor">
			<div class="row">
				<input class="input grow" aria-label="Layer name" bind:value={layer.name} />
				<button class="btn" onclick={() => duplicate(layer)}>Duplicate</button>
				<button class="btn" onclick={() => exportLayer(layer)}>Export</button>
				{#if confirmingDelete}
					<button class="btn danger" onclick={() => remove(layer.id)}>Delete</button>
					<button class="btn quiet" onclick={() => (confirmingDelete = false)}>Cancel</button>
				{:else}
					<button class="btn danger" onclick={() => (confirmingDelete = true)}>Delete</button>
				{/if}
			</div>

			<div class="grid">
				<label for="layer-opacity">Opacity {Math.round(layer.opacity * 100)}%</label>
				<Slider
					id="layer-opacity"
					type="single"
					value={layer.opacity}
					min={0}
					max={1}
					step={0.01}
					onValueChange={(value) => (layer.opacity = value)}
				/>
				<label for="layer-blend">Blend</label>
				<select id="layer-blend" class="select" bind:value={layer.blend}>
					{#each BLEND_MODES as mode (mode)}
						<option value={mode}>{mode}</option>
					{/each}
				</select>
				<label for="layer-placement">Placement</label>
				<select id="layer-placement" class="select" bind:value={layer.placement}>
					<option value="below">Behind icons</option>
					<option value="above">Over icons</option>
				</select>

				{#if layer.type === 'color'}
					<span class="label">Color</span>
					<ColorInput value={layer.color} onchange={(rgb) => (layer.color = rgb)} />
					<span class="label">Gradient to</span>
					<div class="row">
						<input
							type="checkbox"
							aria-label="Gradient"
							checked={layer.color2 !== null}
							onchange={(event) =>
								(layer.color2 = event.currentTarget.checked ? '60, 40, 90' : null)}
						/>
						{#if layer.color2 !== null}
							<ColorInput value={layer.color2} onchange={(rgb) => (layer.color2 = rgb)} />
						{/if}
					</div>
					{#if layer.color2 !== null}
						<label for="layer-angle">Angle {layer.angle}°</label>
						<Slider
							id="layer-angle"
							type="single"
							value={layer.angle}
							min={0}
							max={360}
							step={5}
							onValueChange={(value) => (layer.angle = value)}
						/>
					{/if}
				{:else if layer.type === 'media'}
					<label for="layer-src">File or URL</label>
					<div class="row">
						<input id="layer-src" class="input grow" bind:value={layer.src} spellcheck="false" />
						<button class="btn" onclick={() => pickMedia((path) => (layer.src = path))}
							>Browse</button
						>
					</div>
					<label for="layer-fit">Fit</label>
					<select id="layer-fit" class="select" bind:value={layer.fit}>
						<option value="cover">Cover</option>
						<option value="contain">Contain</option>
						<option value="stretch">Stretch</option>
					</select>
					<label for="layer-position">Position</label>
					<select id="layer-position" class="select" bind:value={layer.position}>
						{#each MEDIA_POSITIONS as position (position)}
							<option value={position}>{position}</option>
						{/each}
					</select>
					{#if !isVideoBackground(layer.src)}
						<span class="label">Repeat</span>
						<input type="checkbox" aria-label="Repeat" bind:checked={layer.repeat} />
					{/if}
				{:else if layer.type === 'shader'}
					<label for="layer-texture">iChannel0</label>
					<div class="row">
						<input
							id="layer-texture"
							class="input grow"
							placeholder="Image or video"
							value={layer.texture ?? ''}
							onchange={(event) => (layer.texture = event.currentTarget.value.trim() || null)}
							spellcheck="false"
						/>
						<button class="btn" onclick={() => pickMedia((path) => (layer.texture = path))}
							>Browse</button
						>
					</div>
					<label for="layer-quality">Resolution</label>
					<select
						id="layer-quality"
						class="select"
						value={String(layer.quality)}
						onchange={(event) => (layer.quality = Number(event.currentTarget.value))}
					>
						<option value="1">Full</option>
						<option value="0.75">75%</option>
						<option value="0.5">50%</option>
						<option value="0.25">25%</option>
					</select>
					<label for="layer-fps">Frame rate</label>
					<select
						id="layer-fps"
						class="select"
						value={String(layer.fps)}
						onchange={(event) => (layer.fps = Number(event.currentTarget.value))}
					>
						<option value="0">Display rate</option>
						<option value="60">60 fps</option>
						<option value="30">30 fps</option>
						<option value="15">15 fps</option>
					</select>
				{:else}
					<span class="label">Scripts</span>
					<label class="check">
						<input type="checkbox" bind:checked={layer.scripts} />
						Run JavaScript
					</label>
				{/if}
			</div>

			{#if layer.type === 'shader' || layer.type === 'html'}
				<p class="hint">
					{#if layer.type === 'shader'}
						GLSL in Shadertoy style, with pointer and icon inputs.
					{:else}
						A full HTML page with the <code>odeko</code> helper for pointer and icon input. Libraries
						from https URLs download once on first use and are cached.
					{/if}
					<button class="link" onclick={() => invoke('open_url', { url: DOCS[layer.type] })}
						>Guide &amp; examples</button
					>
				</p>
				<div class="row">
					{#if layer.file}
						<span class="path" title={layer.file}>{fileName(layer.file)}</span>
						<label class="check">
							<input type="checkbox" bind:checked={layer.watch} />
							Reload on change
						</label>
						<button class="btn quiet" onclick={() => unlinkSourceFile(layer)}>Unlink</button>
					{:else}
						<button class="btn" onclick={() => linkSourceFile(layer)}>Load from file…</button>
					{/if}
				</div>
				<textarea
					class="source"
					aria-label="Source"
					bind:value={layer.source}
					readonly={layer.watch}
					spellcheck="false"
				></textarea>
				{#if layer.type === 'shader' && shaderErrors[layer.id]}
					<div class="error">
						<pre>{shaderErrors[layer.id]}</pre>
						<button class="btn" onclick={() => writeText(shaderErrors[layer.id] ?? '')}
							>Copy error</button
						>
					</div>
				{/if}
				{#if layer.type === 'html' && cacheSize !== null}
					<div class="row hint">
						Library cache: {formatBytes(cacheSize)}
						<button class="btn quiet" disabled={cacheSize === 0} onclick={clearCache}>Clear</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</section>

<style>
	.layers-panel {
		display: flex;
		flex-direction: column;
		gap: calc(0.5714 * var(--modal-font-size));
		color: var(--modal-text, rgba(255, 255, 255, 0.85));
		font-size: calc(1 * var(--modal-font-size));
	}

	.panel-head,
	.row {
		display: flex;
		align-items: center;
		gap: calc(0.4286 * var(--modal-font-size));
		flex-wrap: wrap;
	}

	.panel-head {
		justify-content: space-between;
	}

	.panel-head h3 {
		margin: 0;
		font-size: calc(1 * var(--modal-font-size));
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.btn {
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border: none;
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.1);
		color: inherit;
		font-size: calc(0.9286 * var(--modal-font-size));
		cursor: pointer;
		white-space: nowrap;
	}

	.btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 26%, transparent);
		color: var(--modal-title-color, white);
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.btn.quiet {
		background: transparent;
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
	}

	.btn.danger {
		background: rgba(239, 68, 68, 0.25);
		color: rgba(255, 170, 170, 1);
	}

	.status {
		margin: 0;
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border-radius: 5px;
		font-size: calc(0.9286 * var(--modal-font-size));
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 16%, transparent);
	}

	.status.error {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(255, 160, 160, 1);
	}

	.input,
	.select,
	.source {
		box-sizing: border-box;
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border-radius: 5px;
		border: 1px solid var(--modal-input-border, rgba(255, 255, 255, 0.2));
		background: var(--modal-input-bg, rgba(30, 30, 40, 0.9));
		color: var(--modal-text, white);
		font-size: calc(0.9286 * var(--modal-font-size));
		outline: none;
	}

	/* Without appearance: none, WebKitGTK draws selects in the light GTK theme. */
	.select {
		appearance: none;
		padding-right: calc(2 * var(--modal-font-size));
		background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E');
		background-repeat: no-repeat;
		background-position: right 10px center;
		background-size: 10px auto;
		cursor: pointer;
	}

	.input:focus,
	.select:focus,
	.source:focus {
		border-color: var(--modal-accent, rgba(120, 160, 200, 0.8));
	}

	.select option {
		background: rgba(30, 30, 40, 1);
		color: white;
	}

	.grow {
		flex: 1;
		min-width: 0;
	}

	.layer-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		overflow: hidden;
	}

	.layer-row {
		display: flex;
		align-items: center;
		gap: calc(0.2857 * var(--modal-font-size));
		padding: calc(0.2143 * var(--modal-font-size)) calc(0.4286 * var(--modal-font-size));
		border-bottom: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.06));
		border-left: 2px solid transparent;
	}

	.layer-row:last-child {
		border-bottom: none;
	}

	.layer-row.active {
		border-left-color: var(--modal-accent, #78a0c8);
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 10%, transparent);
	}

	.layer-row.off .name {
		opacity: 0.5;
	}

	.row-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: calc(0.4286 * var(--modal-font-size));
		background: none;
		border: none;
		color: inherit;
		font-size: inherit;
		text-align: left;
		cursor: pointer;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta,
	.hint,
	.empty {
		color: var(--modal-muted, rgba(255, 255, 255, 0.45));
		font-size: calc(0.8571 * var(--modal-font-size));
	}

	.meta {
		margin-left: auto;
		white-space: nowrap;
	}

	.empty,
	.hint {
		margin: 0;
	}

	.empty {
		padding: calc(0.4286 * var(--modal-font-size));
	}

	.icon-btn {
		background: none;
		border: none;
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
		font-size: calc(0.7143 * var(--modal-font-size));
		cursor: pointer;
	}

	.icon-btn:disabled {
		visibility: hidden;
	}

	.icon-btn:hover {
		color: var(--modal-title-color, white);
	}

	.editor {
		display: flex;
		flex-direction: column;
		gap: calc(0.5714 * var(--modal-font-size));
	}

	.grid {
		display: grid;
		grid-template-columns: max-content 1fr;
		align-items: center;
		gap: calc(0.5714 * var(--modal-font-size)) calc(0.8571 * var(--modal-font-size));
	}

	.grid > label,
	.label {
		color: var(--modal-text, rgba(255, 255, 255, 0.7));
	}

	.check {
		display: flex;
		align-items: center;
		gap: calc(0.4286 * var(--modal-font-size));
		cursor: pointer;
	}

	input[type='checkbox'] {
		accent-color: var(--modal-accent, rgba(120, 160, 200, 0.9));
		cursor: pointer;
	}

	.path {
		max-width: calc(16 * var(--modal-font-size));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.link {
		border: none;
		background: none;
		padding: 0;
		color: var(--modal-accent, rgba(120, 160, 200, 0.85));
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.source {
		width: 100%;
		min-height: calc(16 * var(--modal-font-size));
		font-family: ui-monospace, monospace;
		font-size: calc(0.8571 * var(--modal-font-size));
		tab-size: 4;
		resize: vertical;
	}

	.source[readonly] {
		opacity: 0.7;
	}

	.error {
		color: #ff8a8a;
		font-size: calc(0.8571 * var(--modal-font-size));
	}

	.error pre {
		margin: 0 0 calc(0.4286 * var(--modal-font-size));
		white-space: pre-wrap;
		user-select: text;
	}
</style>
