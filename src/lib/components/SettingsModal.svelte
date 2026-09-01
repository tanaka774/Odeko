<script lang="ts">
	import { untrack } from 'svelte';
	import { settingsStore, type CanvasSettings } from '$lib/stores/settings.svelte';
	import { open, save } from '@tauri-apps/plugin-dialog';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { invoke } from '@tauri-apps/api/core';
	import Slider from '$lib/components/ui/slider/slider.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import ColorInput from '$lib/components/ColorInput.svelte';
	import KeybindRecorder from '$lib/components/KeybindRecorder.svelte';
	import { createBackdropClickHandler } from '$lib/components/modal/backdrop';
	import { isVideoBackground } from '$lib/background';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';

	let {
		isOpen = $bindable(false),
		onSave,
		onApplyPreset
	} = $props<{
		isOpen: boolean;
		onSave?: () => void;
		onApplyPreset?: () => void;
	}>();

	let localSettings = $state<CanvasSettings>({ ...settingsStore.settings });
	let originalSettings = $state<CanvasSettings | null>(null);

	let presets = $state<string[]>([]);
	let selectedPreset = $state<string>('');
	let newPresetName = $state('');
	let isRenaming = $state(false);
	let renameValue = $state('');
	let presetError = $state('');
	let presetSuccess = $state('');
	let confirmDelete = $state(false);

	interface ImportResult {
		name: string;
		cleared_network_grants: number;
		cleared_local_network: boolean;
		cleared_global_shortcuts: number;
		forced_power_confirmation: number;
	}

	let activeTab = $state<'appearance' | 'items' | 'edit' | 'keys' | 'presets'>('appearance');

	let settingsContentEl: HTMLElement | undefined = $state();
	$effect(() => {
		void activeTab;
		if (settingsContentEl) settingsContentEl.scrollTop = 0;
	});

	$effect(() => {
		if (isOpen) {
			// Deep-copy the live settings into a staging copy ($state.snapshot
			// unwraps the reactive proxy) so edits here never leak into the
			// live store until Save is pressed.
			const current = $state.snapshot(untrack(() => settingsStore.settings));
			localSettings = current;
			originalSettings = current;
			selectedPreset = untrack(() => settingsStore.activePreset) ?? '';
			// The instance stays mounted between opens; without this reset the
			// last success/error message would reappear on the next open.
			presetSuccess = '';
			presetError = '';
			loadPresets();
		}
	});

	async function loadPresets() {
		try {
			presets = await invoke<string[]>('list_presets');
		} catch (error) {
			console.error('Failed to load presets:', error);
			presets = [];
		}
	}

	async function handleSavePreset() {
		presetError = '';
		presetSuccess = '';
		if (!newPresetName.trim()) {
			presetError = 'Please enter a preset name';
			return;
		}
		try {
			await invoke('save_preset_as', {
				name: newPresetName.trim(),
				icons: settingsStore.getCurrentIcons(),
				settings: localSettings
			});
			presetSuccess = `Saved preset "${newPresetName.trim()}"`;
			newPresetName = '';
			await loadPresets();
		} catch (error) {
			presetError = String(error);
		}
	}

	async function handleSaveDefaultPreset() {
		presetError = '';
		presetSuccess = '';
		if (!newPresetName.trim()) {
			presetError = 'Please enter a preset name';
			return;
		}
		try {
			await invoke('save_default_preset', { name: newPresetName.trim() });
			presetSuccess = `Created default preset "${newPresetName.trim()}"`;
			newPresetName = '';
			await loadPresets();
		} catch (error) {
			presetError = String(error);
		}
	}

	async function handleDeletePreset() {
		presetError = '';
		presetSuccess = '';
		if (!selectedPreset) {
			presetError = 'Select a preset to delete';
			return;
		}
		confirmDelete = true;
	}

	async function doDeletePreset() {
		try {
			await invoke('delete_preset', { name: selectedPreset });
			presetSuccess = `Deleted preset "${selectedPreset}"`;
			selectedPreset = '';
			settingsStore.setActivePreset(null);
			await loadPresets();
		} catch (error) {
			presetError = String(error);
		} finally {
			confirmDelete = false;
		}
	}

	function cancelDeletePreset() {
		confirmDelete = false;
	}

	async function handleRenamePreset() {
		presetError = '';
		presetSuccess = '';
		if (!selectedPreset) {
			presetError = 'Select a preset to rename';
			return;
		}
		if (!renameValue.trim()) {
			presetError = 'Enter a new name';
			return;
		}
		try {
			await invoke('rename_preset', { oldName: selectedPreset, newName: renameValue.trim() });
			presetSuccess = `Renamed to "${renameValue.trim()}"`;
			selectedPreset = renameValue.trim();
			renameValue = '';
			isRenaming = false;
			await loadPresets();
		} catch (error) {
			presetError = String(error);
		}
	}

	async function handleExportPreset() {
		presetError = '';
		presetSuccess = '';
		if (!selectedPreset) {
			presetError = 'Select a preset to export';
			return;
		}
		try {
			const filePath = await save({
				defaultPath: `${selectedPreset}.json`,
				filters: [{ name: 'JSON', extensions: ['json'] }]
			});
			if (filePath && typeof filePath === 'string') {
				await invoke('export_preset', { name: selectedPreset, path: filePath });
				presetSuccess = `Exported "${selectedPreset}"`;
			}
		} catch (error) {
			presetError = String(error);
		}
	}

	async function handleImportPreset() {
		presetError = '';
		presetSuccess = '';
		try {
			const filePath = await open({
				multiple: false,
				filters: [{ name: 'JSON', extensions: ['json'] }]
			});
			if (filePath && typeof filePath === 'string') {
				const imported = await invoke<ImportResult>('import_preset', { path: filePath });
				// Imported files are untrusted: the backend strips ambient
				// authority (network grants, local network, global shortcuts,
				// unconfirmed power actions). Surface what was reset so a
				// preset's behavior never surprises the user silently.
				const notes: string[] = [];
				if (imported.cleared_network_grants > 0) {
					notes.push(`cleared ${imported.cleared_network_grants} network grant(s)`);
				}
				if (imported.cleared_local_network) {
					notes.push('disabled local network access');
				}
				if (imported.cleared_global_shortcuts > 0) {
					notes.push(`disabled ${imported.cleared_global_shortcuts} global shortcut(s)`);
				}
				if (imported.forced_power_confirmation > 0) {
					notes.push(
						`re-enabled confirmation on ${imported.forced_power_confirmation} power widget(s)`
					);
				}
				presetSuccess = notes.length
					? `Imported "${imported.name}". For safety: ${notes.join(', ')}.`
					: `Imported "${imported.name}"`;
				await loadPresets();
			}
		} catch (error) {
			presetError = String(error);
		}
	}

	function close() {
		if (originalSettings) {
			localSettings = { ...originalSettings };
			originalSettings = null;
		}
		isOpen = false;
	}

	const backdrop = createBackdropClickHandler(close);

	async function handleSave() {
		await finishSave();
	}

	async function finishSave() {
		if (selectedPreset && selectedPreset !== settingsStore.activePreset) {
			try {
				if (settingsStore.activePreset) {
					settingsStore.updateSettings(localSettings);
					await settingsStore.saveSettings();
				}
				await invoke('set_active_preset', { name: selectedPreset });
				settingsStore.setActivePreset(selectedPreset);
				await onApplyPreset?.();
				localSettings = { ...settingsStore.settings };
			} catch (error) {
				presetError = String(error);
				return;
			}
		} else {
			settingsStore.updateSettings(localSettings);
			await settingsStore.saveSettings();
		}

		invoke('update_global_shortcut', {
			keybind: settingsStore.settings.keybind_toggle_canvas
		});

		onSave?.();
		close();
	}

	async function selectBackgroundImage() {
		const selected = await open({
			multiple: false,
			filters: [
				{
					name: 'Images',
					extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
				},
				{
					name: 'Videos',
					extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv']
				}
			]
		});
		if (selected && typeof selected === 'string') {
			localSettings.background_image = isVideoBackground(selected)
				? selected
				: convertFileSrc(selected);
		}
	}

	function removeBackgroundImage() {
		localSettings.background_image = null;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			close();
		}
	}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div
		class="modal-overlay"
		{...backdrop}
		onkeydown={handleKeydown}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
	>
		<div class="modal-anchor">
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<div class="modal-header">
					<h2>Canvas Settings</h2>
					<button class="close-btn" onclick={close}>✕</button>
				</div>

				<div class="tab-nav">
					<button
						class="tab-btn"
						class:active={activeTab === 'appearance'}
						onclick={() => (activeTab = 'appearance')}
					>
						Appearance
					</button>
					<button
						class="tab-btn"
						class:active={activeTab === 'items'}
						onclick={() => (activeTab = 'items')}
					>
						Icon Appearance
					</button>
					<button
						class="tab-btn"
						class:active={activeTab === 'edit'}
						onclick={() => (activeTab = 'edit')}
					>
						Edit
					</button>
					<button
						class="tab-btn"
						class:active={activeTab === 'keys'}
						onclick={() => (activeTab = 'keys')}
					>
						Keys
					</button>
					<button
						class="tab-btn"
						class:active={activeTab === 'presets'}
						onclick={() => (activeTab = 'presets')}
					>
						Presets
					</button>
				</div>

				<div class="settings-content" bind:this={settingsContentEl}>
					{#if activeTab === 'appearance'}
						<section class="settings-section">
							<h3>Size</h3>
							<div class="setting-row">
								<Label>Width: {localSettings.width_percent}%</Label>
								<Slider
									type="single"
									value={localSettings.width_percent}
									min={50}
									max={100}
									step={1}
									onValueChange={(val) => {
										localSettings.width_percent = val;
									}}
								/>
							</div>
							<div class="setting-row">
								<Label>Height: {localSettings.height_percent}%</Label>
								<Slider
									type="single"
									value={localSettings.height_percent}
									min={50}
									max={100}
									step={1}
									onValueChange={(val) => {
										localSettings.height_percent = val;
									}}
								/>
							</div>
							<div class="setting-row">
								<Label>Position</Label>
								<div class="position-grid">
									{#each [{ x: 0, y: 0, label: '↖' }, { x: 50, y: 0, label: '↑' }, { x: 100, y: 0, label: '↗' }, { x: 0, y: 50, label: '←' }, { x: 50, y: 50, label: '•' }, { x: 100, y: 50, label: '→' }, { x: 0, y: 100, label: '↙' }, { x: 50, y: 100, label: '↓' }, { x: 100, y: 100, label: '↘' }] as pos (`${pos.x}-${pos.y}`)}
										<button
											class="position-btn"
											class:active={localSettings.position_x === pos.x &&
												localSettings.position_y === pos.y}
											onclick={() => {
												localSettings.position_x = pos.x;
												localSettings.position_y = pos.y;
											}}
										>
											{pos.label}
										</button>
									{/each}
								</div>
							</div>
						</section>

						<section class="settings-section">
							<h3>Background</h3>
							<div class="setting-row">
								<Label>Color (RGB)</Label>
								<ColorInput
									value={localSettings.background_color}
									onchange={(rgb) => (localSettings.background_color = rgb)}
								/>
							</div>
							<div class="setting-row">
								<Label>Opacity: {Math.round(localSettings.background_opacity * 100)}%</Label>
								<Slider
									type="single"
									value={localSettings.background_opacity}
									min={0.0}
									max={1}
									step={0.05}
									onValueChange={(val) => {
										localSettings.background_opacity = val;
									}}
								/>
							</div>
							<div class="setting-row">
								<Label>Background Image / Video</Label>
								<div class="image-row">
									{#if localSettings.background_image}
										<span class="image-path">{localSettings.background_image}</span>
										<button class="remove-image-btn" onclick={removeBackgroundImage}>Remove</button>
									{:else}
										<span class="no-image">No image or video selected</span>
									{/if}
									<button class="select-image-btn" onclick={selectBackgroundImage}>
										Select File
									</button>
								</div>
							</div>
							{#if localSettings.background_image}
								<div class="setting-row">
									<Label>Image Fit</Label>
									<select
										value={localSettings.background_size}
										onchange={(e) => {
											localSettings.background_size = e.currentTarget.value as
												| 'cover'
												| 'contain'
												| 'stretch';
										}}
										class="bg-select"
									>
										<option value="cover">Cover - Fill entire area</option>
										<option value="contain">Contain - Show full image</option>
										<option value="stretch">Stretch - Distort to fit</option>
									</select>
								</div>
								{#if !isVideoBackground(localSettings.background_image)}
									<div class="setting-row">
										<label class="checkbox-label">
											<input
												type="checkbox"
												checked={localSettings.background_repeat}
												onchange={(e) => {
													localSettings.background_repeat = e.currentTarget.checked;
												}}
											/>
											<span>Repeat image if smaller than canvas</span>
										</label>
									</div>
								{/if}
								<div class="setting-row">
									<Label>Image Position</Label>
									<div class="position-grid">
										{#each ['top', 'center', 'bottom'] as v (v)}
											{#each ['left', 'center', 'right'] as h (h)}
												{@const pos =
													v === 'center' && h === 'center'
														? 'center'
														: v === 'center'
															? h
															: h === 'center'
																? v
																: `${v} ${h}`}
												<button
													class="position-btn"
													class:active={localSettings.background_position === pos}
													onclick={() => {
														localSettings.background_position =
															pos as CanvasSettings['background_position'];
													}}
												>
													{#if pos === 'top'}
														↑
													{:else if pos === 'bottom'}
														↓
													{:else if pos === 'left'}
														←
													{:else if pos === 'right'}
														→
													{:else}
														•
													{/if}
												</button>
											{/each}
										{/each}
									</div>
									<div class="position-labels">
										<span>Selected: {localSettings.background_position}</span>
									</div>
								</div>
							{/if}
						</section>

						<section class="settings-section">
							<h3>Appearance</h3>
							<div class="setting-row">
								<label class="checkbox-label">
									<input
										type="checkbox"
										checked={localSettings.backdrop_blur}
										onchange={(e) => {
											localSettings.backdrop_blur = e.currentTarget.checked;
										}}
									/>
									<span>Backdrop Blur</span>
								</label>
							</div>
							{#if localSettings.backdrop_blur}
								<div class="setting-row">
									<Label>Blur Strength</Label>
									<select
										value={localSettings.blur_strength}
										onchange={(e) => {
											localSettings.blur_strength = e.currentTarget.value as 'light' | 'full';
										}}
										class="bg-select"
									>
										<option value="full">Full - Blur entire screen</option>
										<option value="light">Light - Blur only behind the canvas</option>
									</select>
								</div>
							{/if}
							<div class="setting-row">
								<Label>Panel Corner Radius: {localSettings.border_radius}px</Label>
								<Slider
									type="single"
									value={localSettings.border_radius}
									min={0}
									max={20}
									step={1}
									onValueChange={(val) => {
										localSettings.border_radius = val;
									}}
								/>
							</div>
							<div class="setting-row">
								<Label
									>Backdrop Darkness: {Math.round(localSettings.backdrop_darkness * 100)}%</Label
								>
								<Slider
									type="single"
									value={localSettings.backdrop_darkness}
									min={0}
									max={1.0}
									step={0.05}
									onValueChange={(val) => {
										localSettings.backdrop_darkness = val;
									}}
								/>
							</div>
						</section>
					{:else if activeTab === 'items'}
						<section class="settings-section">
							<h3>Default Item Appearance</h3>
							<p class="settings-note">
								Applied to new items as their default style. Font settings only affect items that
								show text.
							</p>
							<WidgetAppearanceSettings
								title=""
								hideCustomCss
								applyToAll
								bind:appearance={localSettings.default_appearance}
							/>
						</section>
					{:else if activeTab === 'edit'}
						<section class="settings-section">
							<h3>Edit Mode</h3>
							<div class="setting-row">
								<Label>Grid Size: {localSettings.grid_size}px</Label>
								<Slider
									type="single"
									value={localSettings.grid_size}
									min={10}
									max={400}
									step={10}
									onValueChange={(val) => {
										localSettings.grid_size = val;
									}}
								/>
							</div>
							<div class="setting-row">
								<Label>Grid Line Color</Label>
								<ColorInput
									value={localSettings.grid_line_color}
									onchange={(rgb) => (localSettings.grid_line_color = rgb)}
								/>
							</div>
							<div class="setting-row">
								<label class="checkbox-label">
									<input
										type="checkbox"
										checked={localSettings.magnetic_snap}
										onchange={(e) => {
											localSettings.magnetic_snap = e.currentTarget.checked;
										}}
									/>
									<span>Magnetic Snap to Grid</span>
								</label>
							</div>
						</section>
					{:else if activeTab === 'keys'}
						<section class="settings-section">
							<h3>Keyboard Shortcuts</h3>
							<div class="key-shortcuts">
								<KeybindRecorder
									bind:value={localSettings.keybind_toggle_canvas}
									label="Toggle canvas (global shortcut)"
								/>
								<KeybindRecorder
									bind:value={localSettings.keybind_toggle_edit}
									label="Enter / exit edit mode"
								/>
								<KeybindRecorder
									bind:value={localSettings.keybind_hide_canvas}
									label="Hide canvas"
								/>
								<KeybindRecorder
									bind:value={localSettings.keybind_undo}
									label="Undo last change (edit mode)"
								/>
							</div>
							<div class="key-shortcuts" style="margin-top: 24px;">
								<div class="key-shortcut-item key-static">
									<div class="key-combo">
										<span class="key-mouse">🖱️ Right Click</span>
									</div>
									<span class="key-desc"
										>Open menu (Enter Edit Mode / Open Settings on empty space)</span
									>
								</div>
							</div>
							<div class="key-shortcuts" style="margin-top: 24px;">
								<p class="key-hint">
									Per-item launch keybinds can be set from each item's own settings (right-click the
									item → Open Settings).
								</p>
							</div>
						</section>
					{:else}
						<section class="settings-section">
							<h3>Presets</h3>
							<div class="setting-row">
								<Label>Active Preset</Label>
								<div class="preset-select-row">
									<select
										value={selectedPreset}
										onchange={(e) => {
											selectedPreset = e.currentTarget.value;
										}}
										class="bg-select"
									>
										<option value="">-- None --</option>
										{#each presets as preset (preset)}
											<option value={preset}>{preset}</option>
										{/each}
									</select>
								</div>
							</div>
							{#if selectedPreset}
								<div class="setting-row">
									<div class="preset-actions">
										{#if isRenaming}
											<input
												type="text"
												placeholder="New name..."
												value={renameValue}
												oninput={(e) => {
													renameValue = e.currentTarget.value;
												}}
												class="preset-input"
											/>
											<button class="select-image-btn" onclick={handleRenamePreset}>Confirm</button>
											<button
												class="remove-image-btn"
												onclick={() => {
													isRenaming = false;
													renameValue = '';
												}}>Cancel</button
											>
										{:else if confirmDelete}
											<div class="confirm-row">
												<span>Delete "{selectedPreset}"?</span>
												<button class="remove-image-btn" onclick={doDeletePreset}>Delete</button>
												<button class="preset-action-btn" onclick={cancelDeletePreset}
													>Cancel</button
												>
											</div>
										{:else}
											<button
												class="preset-action-btn"
												onclick={() => {
													isRenaming = true;
													renameValue = selectedPreset;
												}}>Rename</button
											>
											<button class="remove-image-btn" onclick={handleDeletePreset}>Delete</button>
											<button class="preset-action-btn" onclick={handleExportPreset}>Export</button>
										{/if}
									</div>
								</div>
							{/if}
							<div class="setting-row">
								<Label>Save Current as New Preset</Label>
								<div class="preset-save-row">
									<input
										type="text"
										placeholder="Preset name..."
										value={newPresetName}
										oninput={(e) => {
											newPresetName = e.currentTarget.value;
										}}
										class="preset-input"
									/>
									<button class="select-image-btn" onclick={handleSavePreset}>Save</button>
									<button class="preset-action-btn" onclick={handleSaveDefaultPreset}
										>Create Blank</button
									>
								</div>
							</div>
							<div class="setting-row">
								<div class="preset-actions">
									<button class="preset-action-btn" onclick={handleImportPreset}
										>Import Preset...</button
									>
								</div>
							</div>
							{#if presetError}
								<div class="preset-message error">{presetError}</div>
							{/if}
							{#if presetSuccess}
								<div class="preset-message success">{presetSuccess}</div>
							{/if}
						</section>
					{/if}
				</div>

				<div class="modal-footer">
					<div class="footer-actions">
						<button class="cancel-btn" onclick={close}>Cancel</button>
						<button class="save-btn" onclick={handleSave}>Save Changes</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 10px;
		box-sizing: border-box;
	}

	.modal-anchor {
		width: min(750px, 92%);
		height: min(85%, 640px);
		transform: translate(
			clamp(calc(375px - 50vw), var(--canvas-dx, 0px), calc(50vw - 375px)),
			clamp(calc(320px - 50vh), var(--canvas-dy, 0px), calc(50vh - 320px))
		);
	}

	.modal-content {
		background: rgba(30, 30, 40, 0.95);
		backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.modal-header h2 {
		margin: 0;
		color: white;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.6);
		font-size: 1.25rem;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: white;
	}

	.settings-content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 12px 16px;
	}

	.settings-section {
		margin-bottom: 12px;
	}

	.settings-section h3 {
		margin: 0 0 8px 0;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.setting-row {
		margin-bottom: 10px;
	}

	.setting-row :global(label) {
		display: block;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		margin-bottom: 8px;
	}

	.image-row {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.image-path {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.75rem;
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.no-image {
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.875rem;
		font-style: italic;
	}

	.select-image-btn,
	.remove-image-btn {
		padding: 6px 12px;
		border-radius: 6px;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.2s ease;
	}

	.select-image-btn {
		background: rgba(120, 160, 200, 0.85);
		color: white;
	}

	.select-image-btn:hover {
		background: rgba(120, 160, 200, 1);
	}

	.remove-image-btn {
		background: var(--edit-danger-bg);
		color: var(--edit-control-fg);
	}

	.remove-image-btn:hover {
		background: var(--edit-danger-bg-hover);
	}

	.modal-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 16px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.2);
	}

	.footer-actions {
		display: flex;
		gap: 12px;
	}

	.cancel-btn,
	.save-btn {
		padding: 8px 16px;
		border-radius: 6px;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.2s ease;
	}

	.cancel-btn {
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.7);
	}

	.cancel-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.save-btn {
		background: rgba(120, 160, 200, 0.85);
		color: white;
	}

	.save-btn:hover {
		background: rgba(120, 160, 200, 1);
	}

	.bg-select {
		width: 100%;
		padding: 8px 12px;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background-color: rgba(30, 30, 40, 0.9);
		color: white;
		font-size: 0.875rem;
		cursor: pointer;
		outline: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		appearance: none;
		background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E');
		background-repeat: no-repeat;
		background-position: right 12px top 50%;
		background-size: 12px auto;
		padding-right: 36px;
	}

	.bg-select:hover {
		border-color: rgba(255, 255, 255, 0.3);
	}

	.bg-select:focus {
		border-color: rgba(120, 160, 200, 0.8);
	}

	.bg-select option {
		background: rgba(30, 30, 40, 1);
		color: white;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 10px;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: rgba(120, 160, 200, 0.9);
		cursor: pointer;
	}

	.position-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		max-width: 120px;
		margin: 0 auto;
	}

	.position-btn {
		width: 32px;
		height: 32px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(0, 0, 0, 0.3);
		color: rgba(255, 255, 255, 0.6);
		border-radius: 6px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		transition: all 0.2s ease;
	}

	.position-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.position-btn.active {
		background: rgba(120, 160, 200, 0.5);
		border-color: rgba(120, 160, 200, 0.8);
		color: white;
	}

	.position-labels {
		text-align: center;
		margin-top: 8px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.75rem;
	}

	.preset-select-row,
	.preset-save-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.preset-input {
		flex: 1;
		padding: 8px 12px;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(30, 30, 40, 0.9);
		color: white;
		font-size: 0.875rem;
		outline: none;
	}

	.preset-input:focus {
		border-color: rgba(120, 160, 200, 0.8);
	}

	.preset-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}

	.preset-action-btn {
		padding: 6px 12px;
		border-radius: 6px;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.2s ease;
		background: rgba(255, 255, 255, 0.1);
		color: rgba(255, 255, 255, 0.8);
	}

	.preset-action-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.preset-message {
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 0.875rem;
		margin-top: 4px;
	}

	.preset-message.error {
		background: rgba(239, 68, 68, 0.2);
		color: rgba(255, 150, 150, 1);
		border: 1px solid rgba(239, 68, 68, 0.4);
	}

	.preset-message.success {
		background: rgba(34, 197, 94, 0.2);
		color: rgba(150, 255, 150, 1);
		border: 1px solid rgba(34, 197, 94, 0.4);
	}

	.tab-nav {
		display: flex;
		gap: 0;
		padding: 0 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(0, 0, 0, 0.15);
	}

	.tab-btn {
		padding: 8px 14px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
		margin-bottom: -1px;
	}

	.tab-btn:hover {
		color: rgba(255, 255, 255, 0.8);
	}

	.tab-btn.active {
		color: white;
		border-bottom-color: rgba(120, 160, 200, 0.8);
		background: rgba(255, 255, 255, 0.05);
	}

	.settings-content::-webkit-scrollbar {
		width: 8px;
	}

	.settings-content::-webkit-scrollbar-track {
		background: rgba(255, 255, 255, 0.05);
	}

	.settings-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
	}

	.settings-content::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.key-shortcuts {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.key-shortcut-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
	}

	.key-combo {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.key-combo kbd {
		font-family: monospace;
		font-size: 0.85rem;
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		padding: 4px 10px;
		color: rgba(255, 255, 255, 0.9);
	}

	.key-mouse {
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		padding: 4px 10px;
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.85rem;
	}

	.key-desc {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
		text-align: right;
	}

	.key-hint {
		color: rgba(255, 255, 255, 0.35);
		font-size: 0.85rem;
		font-style: italic;
		margin: 0;
	}

	.settings-note {
		color: rgba(255, 255, 255, 0.55);
		font-size: 0.85rem;
		line-height: 1.45;
		margin: 0;
	}
</style>
