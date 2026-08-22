<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { readText, readImage, writeText, writeImage } from '@tauri-apps/plugin-clipboard-manager';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Pin from '@lucide/svelte/icons/pin';
	import PinOff from '@lucide/svelte/icons/pin-off';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import {
		addClipboardEntry,
		capClipboardHistory,
		createImageEntry,
		createTextEntry,
		dataUrlToRgba,
		filterClipboardHistory,
		formatTimestamp,
		hashBytes,
		rgbaToDataUrl,
		sortClipboardHistory,
		truncate
	} from '$lib/clipboard';
	import type { ClipboardEntry, ClipboardWidgetConfig, WidgetComponentProps } from './types';

	const POLL_INTERVAL = 500;
	const IMAGE_CHECK_TICKS = 5; // check for images every 5th poll (2.5s)

	type Props = WidgetComponentProps<ClipboardWidgetConfig>;

	let { config = {}, isEditMode = false, borderRadius = 12, onConfigChange }: Props = $props();

	const appearance = $derived(getWidgetAppearance(config, { borderRadius, padding: 0 }));
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const showTimestamps = $derived(config.showTimestamps ?? true);
	const captureImages = $derived(config.captureImages ?? true);
	const maxEntries = $derived(config.maxEntries ?? 20);

	// `history` starts from the saved config and is the widget's own working
	// copy. It is intentionally NOT re-synced from `config` on every render,
	// otherwise an external config update could overwrite entries that are
	// still waiting for their debounced save.
	let history = $state<ClipboardEntry[]>(config.history ?? []);
	let query = $state('');
	let editingId = $state<string | null>(null);
	let editText = $state('');
	let copiedId = $state<string | null>(null);
	// True when running inside the Tauri app. Detected once from the IPC bridge
	// the Tauri webview injects; a plain browser has no such global.
	let available = $state(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);

	const sortedHistory = $derived(sortClipboardHistory(history));
	const visibleHistory = $derived(filterClipboardHistory(sortedHistory, query));
	const isEmpty = $derived(history.length === 0);

	// Non-reactive bookkeeping for the poll loop.
	let lastSeenText = '';
	let lastSeenImageKey = '';
	let lastWrittenText = '';
	let lastWrittenImageKey = '';
	let tick = 0;
	let pollTimer: ReturnType<typeof setInterval> | undefined;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let copiedTimer: ReturnType<typeof setTimeout> | undefined;

	// Applies the configured cap, e.g. when the max entries slider shrinks.
	$effect(() => {
		if (history.length > maxEntries) {
			history = capClipboardHistory(history, maxEntries);
		}
	});

	onMount(() => {
		pollTimer = setInterval(poll, POLL_INTERVAL);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (saveTimer) clearTimeout(saveTimer);
		if (copiedTimer) clearTimeout(copiedTimer);
	});

	async function poll() {
		if (!available) return;

		let text = '';
		let textAvailable = false;
		try {
			text = await readText();
			textAvailable = true;
		} catch {
			// No text on the clipboard (e.g. the last copy was an image, which
			// has no text target on Linux). This is NOT a Tauri problem, so we
			// keep polling.
		}

		if (textAvailable && text !== lastSeenText) {
			lastSeenText = text;
			// Skip re-recording text we just wrote to the clipboard ourselves.
			if (text.trim() && text !== lastWrittenText) {
				commit(addClipboardEntry(history, createTextEntry(text), maxEntries));
			}
		}

		// Images are checked on a slower cadence so we don't keep decoding a
		// large bitmap every poll.
		if (captureImages && ++tick % IMAGE_CHECK_TICKS === 0) {
			await checkForImage();
		}
	}

	async function checkForImage() {
		try {
			const image = await readImage();
			try {
				const rgba = await image.rgba();
				const { width, height } = await image.size();
				const key = `${width}x${height}:${hashBytes(rgba)}`;
				if (key !== lastSeenImageKey && key !== lastWrittenImageKey) {
					lastSeenImageKey = key;
					const dataUrl = rgbaToDataUrl(rgba, width, height);
					if (dataUrl) {
						commit(addClipboardEntry(history, createImageEntry(dataUrl), maxEntries));
					}
				} else {
					lastSeenImageKey = key;
				}
			} finally {
				try {
					await image.close();
				} catch {
					// Ignore cleanup failures.
				}
			}
		} catch {
			// No image on the clipboard (or images unsupported on this platform).
		}
	}

	function commit(next: ClipboardEntry[]) {
		history = next;
		scheduleSave();
	}

	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			onConfigChange?.({ ...config, history });
		}, 400);
	}

	async function handleCopy(entry: ClipboardEntry) {
		if (isEditMode) return;
		try {
			if (entry.type === 'text') {
				const text = entry.text ?? '';
				lastWrittenText = text;
				await writeText(text);
			} else {
				const decoded = await dataUrlToRgba(entry.image ?? '');
				if (!decoded) return;
				lastWrittenImageKey = `${decoded.width}x${decoded.height}:${hashBytes(decoded.rgba)}`;
				await writeImage({
					rgba: decoded.rgba,
					width: decoded.width,
					height: decoded.height
				} as unknown as Parameters<typeof writeImage>[0]);
			}
			copiedId = entry.id;
			if (copiedTimer) clearTimeout(copiedTimer);
			copiedTimer = setTimeout(() => (copiedId = null), 1200);
		} catch (error) {
			console.error('Failed to copy to clipboard:', error);
		}
	}

	function togglePin(entry: ClipboardEntry) {
		commit(history.map((e) => (e.id === entry.id ? { ...e, pinned: !e.pinned } : e)));
	}

	function deleteEntry(id: string) {
		commit(history.filter((e) => e.id !== id));
	}

	function clearAll() {
		commit([]);
	}

	function startEdit(entry: ClipboardEntry) {
		if (entry.type !== 'text') return;
		editingId = entry.id;
		editText = entry.text ?? '';
	}

	function saveEdit() {
		if (editingId === null) return;
		const trimmed = editText.trim();
		if (trimmed) {
			commit(history.map((e) => (e.id === editingId ? { ...e, text: trimmed } : e)));
		}
		editingId = null;
	}

	function cancelEdit() {
		editingId = null;
	}
</script>

<div
	class="clipboard-widget"
	style="
			--appearance-background: {widgetBackground};
			--appearance-border: {widgetBorder};
			--appearance-border-radius: {appearance.borderRadius}px;
			--appearance-opacity: {appearance.opacity};
			--appearance-text-color: {appearance.textColor};
		"
>
	<div class="toolbar">
		<div class="search-box">
			<Search size={14} class="search-icon" />
			<input type="text" bind:value={query} disabled={!available} spellcheck="false" />
		</div>
		<button class="toolbar-btn" title="Clear history" onclick={clearAll} disabled={isEmpty}>
			<Trash2 size={15} />
		</button>
	</div>

	{#if visibleHistory.length > 0}
		<ul class="entry-list">
			{#each visibleHistory as entry (entry.id)}
				<li class="entry" class:copied={copiedId === entry.id}>
					{#if editingId === entry.id}
						<div class="edit-box">
							<textarea bind:value={editText} rows="2" spellcheck="false" placeholder="Edit text..."
							></textarea>
							<div class="edit-actions">
								<button
									class="action-btn confirm"
									title="Save"
									aria-label="Save"
									onclick={saveEdit}
								>
									<Check size={14} />
								</button>
								<button class="action-btn" title="Cancel" aria-label="Cancel" onclick={cancelEdit}>
									<X size={14} />
								</button>
							</div>
						</div>
					{:else}
						<div
							class="entry-main"
							class:clickable={!isEditMode}
							role="button"
							tabindex={isEditMode ? -1 : 0}
							onclick={() => handleCopy(entry)}
							onkeydown={(e) => {
								if (!isEditMode && (e.key === 'Enter' || e.key === ' ')) {
									e.preventDefault();
									handleCopy(entry);
								}
							}}
						>
							{#if entry.type === 'image'}
								<img class="entry-thumb" src={entry.image} alt="" />
							{:else}
								<span class="entry-preview">{truncate(entry.text ?? '', 100)}</span>
							{/if}
							{#if showTimestamps}
								<span class="entry-time">{formatTimestamp(entry.createdAt)}</span>
							{/if}
							{#if copiedId === entry.id}
								<span class="copied-badge"><Check size={12} /> Copied</span>
							{/if}
						</div>
						<div class="entry-actions">
							<button
								class="action-btn"
								title={entry.pinned ? 'Unpin' : 'Pin to top'}
								onclick={() => togglePin(entry)}
							>
								{#if entry.pinned}
									<PinOff size={14} />
								{:else}
									<Pin size={14} />
								{/if}
							</button>
							{#if entry.type === 'text'}
								<button class="action-btn" title="Edit text" onclick={() => startEdit(entry)}>
									<Pencil size={14} />
								</button>
							{/if}
							<button
								class="action-btn danger"
								title="Delete entry"
								onclick={() => deleteEntry(entry.id)}
							>
								<Trash2 size={14} />
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.clipboard-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		opacity: var(--appearance-opacity);
		overflow: hidden;
		box-sizing: border-box;
	}

	.toolbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.search-box {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		padding: 0 8px;
		min-width: 0;
	}

	:global(.search-icon) {
		color: rgba(255, 255, 255, 0.4);
		flex-shrink: 0;
	}

	.search-box input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--appearance-text-color);
		font-size: 0.85rem;
		padding: 6px 0;
	}

	.search-box input::placeholder {
		color: rgba(255, 255, 255, 0.35);
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.toolbar-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.14);
		color: white;
	}

	.toolbar-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.entry-list {
		flex: 1;
		overflow-y: auto;
		list-style: none;
		margin: 0;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.entry {
		display: flex;
		align-items: center;
		gap: 4px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid transparent;
		border-radius: 8px;
		transition: all 0.15s ease;
	}

	.entry:hover {
		background: rgba(255, 255, 255, 0.09);
	}

	.entry.copied {
		background: rgba(120, 160, 200, 0.3);
		border-color: rgba(120, 160, 200, 0.5);
	}

	.entry-main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		min-width: 0;
	}

	.entry-main.clickable {
		cursor: pointer;
	}

	.entry-main.clickable:hover {
		background: rgba(255, 255, 255, 0.06);
		border-radius: 8px;
	}

	.entry-preview {
		flex: 1;
		min-width: 0;
		color: var(--appearance-text-color);
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.entry-thumb {
		width: 36px;
		height: 36px;
		object-fit: cover;
		border-radius: 6px;
		flex-shrink: 0;
	}

	.entry-time {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.copied-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: #8dffa8;
		font-size: 0.7rem;
		font-weight: 600;
		flex-shrink: 0;
	}

	.entry-actions {
		display: flex;
		align-items: center;
		gap: 2px;
		padding-right: 4px;
		flex-shrink: 0;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: white;
	}

	.action-btn.danger:hover {
		background: rgba(239, 68, 68, 0.25);
		color: #ffb4b4;
	}

	.action-btn.confirm {
		background: rgba(120, 160, 200, 0.85);
		color: white;
	}

	.action-btn.confirm:hover {
		background: rgba(120, 160, 200, 1);
	}

	.edit-box {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		min-width: 0;
	}

	.edit-box textarea {
		width: 100%;
		min-height: 40px;
		box-sizing: border-box;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: var(--appearance-text-color);
		font-size: 0.85rem;
		padding: 6px 8px;
		resize: none;
		outline: none;
	}

	.edit-box textarea:focus {
		border-color: rgba(120, 160, 200, 0.8);
	}

	.edit-actions {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}

	/* Scrollbar */
	.entry-list::-webkit-scrollbar {
		width: 8px;
	}

	.entry-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.entry-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}

	.entry-list::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
