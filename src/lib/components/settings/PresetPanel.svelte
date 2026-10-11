<script lang="ts">
	import { onMount } from 'svelte';
	import { open, save } from '@tauri-apps/plugin-dialog';
	import { settingsStore, type CanvasSettings } from '$lib/stores/settings.svelte';
	import {
		createBlankPreset,
		deletePreset,
		duplicatePreset,
		exportPreset,
		importNotes,
		importPreset,
		listPresets,
		presetMeta,
		renamePreset,
		saveLayoutToPreset,
		savePresetAs,
		switchPreset,
		uniquePresetName,
		type PresetSummary
	} from '$lib/presets';

	let {
		settings,
		dirty = false,
		iconsDirty = false,
		onSwitched
	} = $props<{
		settings: CanvasSettings;
		dirty?: boolean;
		iconsDirty?: boolean;
		onSwitched?: () => void | Promise<void>;
	}>();

	let presets = $state<PresetSummary[]>([]);
	let status = $state<{ kind: 'note' | 'error'; text: string } | null>(null);
	let menuFor = $state<string | null>(null);
	let renaming = $state<string | null>(null);
	let renameValue = $state('');
	let confirmingDelete = $state<string | null>(null);
	let draft = $state<{ mode: 'blank' | 'copy'; name: string } | null>(null);
	let pendingSwitch = $state<string | null>(null);
	let filter = $state('');
	let busy = $state(false);

	let renameInputEl = $state<HTMLInputElement | undefined>();
	let draftInputEl = $state<HTMLInputElement | undefined>();

	const activePreset = $derived(settingsStore.activePreset);
	const isActive = (preset: PresetSummary) =>
		preset.name === activePreset || (activePreset === null && preset.is_active);
	const visible = $derived(
		filter.trim()
			? presets.filter((preset) => preset.name.toLowerCase().includes(filter.trim().toLowerCase()))
			: presets
	);

	onMount(load);

	$effect(() => {
		if (renaming && renameInputEl) {
			renameInputEl.focus();
			renameInputEl.select();
		}
	});

	$effect(() => {
		if (draft && draftInputEl) {
			draftInputEl.focus();
			draftInputEl.select();
		}
	});

	async function load() {
		try {
			presets = await listPresets();
		} catch (error) {
			presets = [];
			status = { kind: 'error', text: String(error) };
		}
	}

	async function run(action: () => Promise<void>) {
		busy = true;
		try {
			await action();
		} catch (error) {
			status = { kind: 'error', text: String(error) };
		} finally {
			busy = false;
		}
	}

	async function switchTo(name: string, saveFirst: boolean) {
		// Saving with no active preset would make the backend auto-create
		// "Default", so only do it when there is something worth keeping.
		if (saveFirst && (settingsStore.activePreset || dirty || iconsDirty)) {
			await saveLayoutToPreset(
				settingsStore.activePreset,
				settingsStore.getCurrentIcons(),
				settings
			);
		}
		await switchPreset(name);
		await onSwitched?.();
		await load();
	}

	function requestSwitch(name: string) {
		if (busy || name === activePreset) return;
		menuFor = null;
		status = null;
		if (dirty || iconsDirty) {
			pendingSwitch = name;
			return;
		}
		void run(() => switchTo(name, false));
	}

	async function confirmSwitch(saveFirst: boolean) {
		const name = pendingSwitch;
		if (!name) return;
		pendingSwitch = null;
		await run(() => switchTo(name, saveFirst));
	}

	function toggleMenu(name: string) {
		menuFor = menuFor === name ? null : name;
		confirmingDelete = null;
	}

	function startRename(preset: PresetSummary) {
		renaming = preset.name;
		renameValue = preset.name;
		confirmingDelete = null;
	}

	function cancelRename() {
		renaming = null;
		renameValue = '';
	}

	async function commitRename(name: string) {
		const next = renameValue.trim();
		if (!next) {
			status = { kind: 'error', text: 'Enter a preset name.' };
			return;
		}
		if (next === name) {
			cancelRename();
			return;
		}
		await run(async () => {
			await renamePreset(name, next);
			if (activePreset === name) settingsStore.setActivePreset(next);
			cancelRename();
			menuFor = null;
			await load();
		});
	}

	async function commitDelete(name: string) {
		await run(async () => {
			await deletePreset(name);
			confirmingDelete = null;
			menuFor = null;
			if (activePreset === name) {
				settingsStore.setActivePreset(null);
				await onSwitched?.();
			}
			await load();
			status = { kind: 'note', text: `Deleted "${name}".` };
		});
	}

	async function commitDuplicate(name: string) {
		menuFor = null;
		await run(async () => {
			const newName = uniquePresetName(
				`${name} copy`,
				presets.map((preset) => preset.name)
			);
			await duplicatePreset(name, newName);
			await load();
			status = { kind: 'note', text: `Duplicated "${name}" as "${newName}".` };
		});
	}

	async function handleExport(name: string) {
		menuFor = null;
		await run(async () => {
			const filePath = await save({
				defaultPath: `${name}.json`,
				filters: [{ name: 'JSON', extensions: ['json'] }]
			});
			if (!filePath || typeof filePath !== 'string') return;
			await exportPreset(name, filePath);
			status = { kind: 'note', text: `Exported "${name}".` };
		});
	}

	async function handleImport() {
		status = null;
		await run(async () => {
			const filePath = await open({
				multiple: false,
				filters: [{ name: 'JSON', extensions: ['json'] }]
			});
			if (!filePath || typeof filePath !== 'string') return;
			const imported = await importPreset(filePath);
			const notes = importNotes(imported);
			await load();
			status = {
				kind: 'note',
				text: notes.length
					? `Imported "${imported.name}". For safety: ${notes.join(', ')}.`
					: `Imported "${imported.name}".`
			};
		});
	}

	function startDraft(mode: 'blank' | 'copy') {
		menuFor = null;
		status = null;
		const base = mode === 'blank' ? 'Untitled' : `Copy of ${activePreset ?? 'layout'}`;
		draft = {
			mode,
			name: uniquePresetName(
				base,
				presets.map((preset) => preset.name)
			)
		};
	}

	async function commitDraft() {
		if (!draft) return;
		const name = draft.name.trim();
		if (!name) {
			status = { kind: 'error', text: 'Enter a preset name.' };
			return;
		}
		const mode = draft.mode;
		await run(async () => {
			if (mode === 'blank') {
				await createBlankPreset(name);
			} else {
				await savePresetAs(name, settingsStore.getCurrentIcons(), settings);
			}
			draft = null;
			await switchTo(name, true);
			status = {
				kind: 'note',
				text:
					mode === 'blank'
						? `Created blank preset "${name}".`
						: `Saved current layout as "${name}".`
			};
		});
	}

	function handleNameKeydown(event: KeyboardEvent, commit: () => void) {
		if (event.key === 'Enter') {
			event.preventDefault();
			commit();
		} else if (event.key === 'Escape') {
			// Keep Escape from reaching the modal's window listener, which
			// would close the whole dialog.
			event.preventDefault();
			event.stopPropagation();
			cancelRename();
			draft = null;
		}
	}
</script>

<section class="preset-panel">
	<header class="panel-head">
		<h3>Presets</h3>
		<div class="head-actions">
			<button class="btn" disabled={busy} onclick={() => startDraft('copy')}>Save as new</button>
			<button class="btn" disabled={busy} onclick={() => startDraft('blank')}>New blank</button>
			<button class="btn" disabled={busy} onclick={handleImport}>Import</button>
		</div>
	</header>

	{#if status}
		<p class="status" class:error={status.kind === 'error'}>{status.text}</p>
	{/if}

	{#if pendingSwitch}
		<div class="confirm-bar">
			<span>Switch to "{pendingSwitch}" with unsaved changes?</span>
			<div class="confirm-actions">
				<button class="btn" disabled={busy} onclick={() => confirmSwitch(true)}
					>Save & switch</button
				>
				<button class="btn" disabled={busy} onclick={() => confirmSwitch(false)}
					>Discard & switch</button
				>
				<button class="btn quiet" onclick={() => (pendingSwitch = null)}>Cancel</button>
			</div>
		</div>
	{/if}

	{#if presets.length > 8}
		<input
			class="filter"
			aria-label="Filter presets"
			value={filter}
			oninput={(event) => (filter = event.currentTarget.value)}
		/>
	{/if}

	<div class="preset-list">
		{#if draft}
			<div class="preset-row draft">
				<input
					class="name-input"
					bind:this={draftInputEl}
					aria-label="New preset name"
					value={draft.name}
					oninput={(event) => (draft!.name = event.currentTarget.value)}
					onkeydown={(event) => handleNameKeydown(event, commitDraft)}
				/>
				<button class="btn" disabled={busy} onclick={commitDraft}>Create</button>
				<button class="btn quiet" onclick={() => (draft = null)}>Cancel</button>
			</div>
		{/if}

		{#each visible as preset (preset.name)}
			<div class="preset-row" class:active={isActive(preset)}>
				{#if renaming === preset.name}
					<input
						class="name-input"
						bind:this={renameInputEl}
						aria-label="Preset name"
						value={renameValue}
						oninput={(event) => (renameValue = event.currentTarget.value)}
						onkeydown={(event) => handleNameKeydown(event, () => commitRename(preset.name))}
					/>
					<button class="btn" disabled={busy} onclick={() => commitRename(preset.name)}>Save</button
					>
					<button class="btn quiet" onclick={cancelRename}>Cancel</button>
				{:else}
					<button
						class="row-main"
						title={isActive(preset)
							? `${preset.name} is the active preset`
							: `Switch to ${preset.name}`}
						onclick={() => requestSwitch(preset.name)}
					>
						<span class="dot" aria-hidden="true"></span>
						<span class="name">{preset.name}</span>
						<span class="meta">{presetMeta(preset)}</span>
					</button>
					<button
						class="row-more"
						aria-label={`Actions for ${preset.name}`}
						aria-expanded={menuFor === preset.name}
						onclick={() => toggleMenu(preset.name)}>⋯</button
					>
				{/if}

				{#if menuFor === preset.name && renaming !== preset.name}
					<div class="row-actions">
						{#if confirmingDelete === preset.name}
							<span class="warn"
								>Delete "{preset.name}"?{isActive(preset) ? ' It is the active preset.' : ''}</span
							>
							<button class="btn danger" disabled={busy} onclick={() => commitDelete(preset.name)}
								>Delete</button
							>
							<button class="btn quiet" onclick={() => (confirmingDelete = null)}>Cancel</button>
						{:else}
							<button class="btn" onclick={() => startRename(preset)}>Rename</button>
							<button class="btn" disabled={busy} onclick={() => commitDuplicate(preset.name)}
								>Duplicate</button
							>
							<button class="btn" disabled={busy} onclick={() => handleExport(preset.name)}
								>Export</button
							>
							<button class="btn danger" onclick={() => (confirmingDelete = preset.name)}
								>Delete</button
							>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if presets.length === 0 && !draft}
		<p class="empty">No presets yet. "Save as new" stores the current layout under a name.</p>
	{:else if visible.length === 0}
		<p class="empty">No preset matches "{filter}".</p>
	{/if}
</section>

<style>
	.preset-panel {
		display: flex;
		flex-direction: column;
		gap: calc(0.5714 * var(--modal-font-size));
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(0.5714 * var(--modal-font-size));
		flex-wrap: wrap;
	}

	.panel-head h3 {
		margin: 0;
		color: var(--modal-text, rgba(255, 255, 255, 0.8));
		font-size: calc(1 * var(--modal-font-size));
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.head-actions {
		display: flex;
		gap: calc(0.2857 * var(--modal-font-size));
	}

	.btn {
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border: none;
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.1);
		color: var(--modal-text, rgba(255, 255, 255, 0.85));
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

	.btn.danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.4);
		color: white;
	}

	.status {
		margin: 0;
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border-radius: 5px;
		font-size: calc(0.9286 * var(--modal-font-size));
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 16%, transparent);
		color: var(--modal-text, rgba(255, 255, 255, 0.85));
	}

	.status.error {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(255, 160, 160, 1);
	}

	.confirm-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: calc(0.5714 * var(--modal-font-size));
		flex-wrap: wrap;
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border-radius: 5px;
		border: 1px solid rgba(234, 179, 8, 0.4);
		background: rgba(234, 179, 8, 0.12);
		font-size: calc(0.9286 * var(--modal-font-size));
		color: var(--modal-text, rgba(255, 255, 255, 0.9));
	}

	.confirm-actions {
		display: flex;
		gap: calc(0.2857 * var(--modal-font-size));
	}

	.filter,
	.name-input {
		padding: calc(0.2857 * var(--modal-font-size)) calc(0.5714 * var(--modal-font-size));
		border-radius: 5px;
		border: 1px solid var(--modal-input-border, rgba(255, 255, 255, 0.2));
		background: var(--modal-input-bg, rgba(30, 30, 40, 0.9));
		color: var(--modal-text, white);
		font-size: calc(0.9286 * var(--modal-font-size));
		outline: none;
	}

	.filter:focus,
	.name-input:focus {
		border-color: var(--modal-accent, rgba(120, 160, 200, 0.8));
	}

	.preset-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.1));
		border-radius: 6px;
		overflow: hidden;
	}

	.preset-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: calc(0.2857 * var(--modal-font-size));
		padding: calc(0.2143 * var(--modal-font-size)) calc(0.4286 * var(--modal-font-size));
		border-bottom: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.06));
		border-left: 2px solid transparent;
	}

	.preset-row:last-child {
		border-bottom: none;
	}

	.preset-row:hover {
		background: rgba(255, 255, 255, 0.04);
	}

	.preset-row.active {
		border-left-color: var(--modal-accent, #78a0c8);
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 10%, transparent);
	}

	.preset-row.draft {
		background: rgba(255, 255, 255, 0.05);
	}

	.row-main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: baseline;
		gap: calc(0.4286 * var(--modal-font-size));
		padding: calc(0.2143 * var(--modal-font-size)) 0;
		background: none;
		border: none;
		color: inherit;
		font-size: calc(1 * var(--modal-font-size));
		text-align: left;
		cursor: pointer;
	}

	.dot {
		width: calc(0.4286 * var(--modal-font-size));
		height: calc(0.4286 * var(--modal-font-size));
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.15);
		flex-shrink: 0;
		align-self: center;
	}

	.preset-row.active .dot {
		background: var(--modal-accent, #78a0c8);
	}

	.name {
		color: var(--modal-text, rgba(255, 255, 255, 0.85));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preset-row.active .name {
		color: var(--modal-title-color, white);
		font-weight: 600;
	}

	.meta {
		margin-left: auto;
		padding-left: calc(0.5714 * var(--modal-font-size));
		color: var(--modal-muted, rgba(255, 255, 255, 0.45));
		font-size: calc(0.8571 * var(--modal-font-size));
		white-space: nowrap;
	}

	.row-more {
		background: none;
		border: none;
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
		font-size: calc(1.1429 * var(--modal-font-size));
		line-height: 1;
		padding: 0 calc(0.2857 * var(--modal-font-size));
		cursor: pointer;
	}

	.row-more:hover {
		color: var(--modal-title-color, white);
	}

	.name-input {
		flex: 1;
		min-width: 0;
	}

	.row-actions {
		flex-basis: 100%;
		display: flex;
		align-items: center;
		gap: calc(0.2857 * var(--modal-font-size));
		flex-wrap: wrap;
		padding-bottom: calc(0.2143 * var(--modal-font-size));
	}

	.warn {
		color: rgba(255, 200, 120, 1);
		font-size: calc(0.9286 * var(--modal-font-size));
		margin-right: auto;
	}

	.empty {
		margin: 0;
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
		font-size: calc(0.9286 * var(--modal-font-size));
	}
</style>
