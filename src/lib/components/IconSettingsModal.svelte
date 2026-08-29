<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { loadIconDataUrl } from '$lib/icon-image';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import KeybindRecorder from './KeybindRecorder.svelte';
	import type { LauncherIcon } from '$lib/icons';
	import type { WidgetAppearanceConfig } from '$lib/widgets/types';
	import {
		settingsStore,
		findKeybindConflict,
		type KeybindConfig
	} from '$lib/stores/settings.svelte';
	import './settings/modal-form.css';

	let {
		isOpen = $bindable(false),
		icon,
		onSave = () => {},
		onUpdateIcon = (id: string, iconPath: string) => {},
		onUpdateUrl = (id: string, url: string | undefined) => {},
		onClearImage = (id: string) => {},
		onUpdateShowName = (id: string, showName: boolean) => {},
		onUpdateCustomName = (id: string, customName: string | null) => {},
		onUpdateFontFamily = (id: string, fontFamily: string | null) => {},
		onUpdateFontSize = (id: string, fontSize: number | null) => {},
		onUpdateArgs = (id: string, args: string | null) => {},
		onUpdateKeybind = (id: string, keybind: KeybindConfig | null) => {},
		onUpdateKeybindGlobal = (id: string, global: boolean) => {},
		onUpdateAppearance = () => {}
	}: {
		isOpen: boolean;
		icon: LauncherIcon | null;
		onSave?: () => void;
		onUpdateIcon?: (id: string, iconPath: string) => void;
		onUpdateUrl?: (id: string, url: string | undefined) => void;
		onClearImage?: (id: string) => void;
		onUpdateShowName?: (id: string, showName: boolean) => void;
		onUpdateCustomName?: (id: string, customName: string | null) => void;
		onUpdateFontFamily?: (id: string, fontFamily: string | null) => void;
		onUpdateFontSize?: (id: string, fontSize: number | null) => void;
		onUpdateArgs?: (id: string, args: string | null) => void;
		onUpdateKeybind?: (id: string, keybind: KeybindConfig | null) => void;
		onUpdateKeybindGlobal?: (id: string, global: boolean) => void;
		onUpdateAppearance?: (id: string, appearance: WidgetAppearanceConfig | undefined) => void;
	} = $props();

	let localUrl = $state('');
	let localIconPath = $state('');
	let localShowName = $state(true);
	let localCustomName = $state('');
	let localFontFamily = $state('');
	let localFontSize = $state(14);
	let localArgs = $state('');
	let localAppearance = $state<WidgetAppearanceConfig | undefined>(undefined);
	let localKeybindGlobal = $state(false);
	let recorderValue = $state<KeybindConfig>({
		key: '',
		ctrl: false,
		alt: false,
		shift: false,
		meta: false
	});

	const EMPTY_KEYBIND: KeybindConfig = {
		key: '',
		ctrl: false,
		alt: false,
		shift: false,
		meta: false
	};

	$effect(() => {
		if (isOpen && icon) {
			localUrl = icon.url || '';
			localIconPath = icon.icon_path ?? '';
			localShowName = icon.show_name ?? true;
			localCustomName = icon.custom_name ?? '';
			localFontFamily = icon.font_family ?? '';
			localFontSize = icon.font_size ?? 14;
			localArgs = icon.args ?? '';
			localAppearance = icon.appearance ? { ...icon.appearance } : undefined;
			localKeybindGlobal = icon.keybind_global ?? false;
			recorderValue = icon.keybind ? { ...icon.keybind } : { ...EMPTY_KEYBIND };
		}
	});

	// Whether this icon can have a launch keybind (apps/links/images only).
	let isLaunchable = $derived(
		icon?.icon_type === 'app' || icon?.icon_type === 'link' || icon?.icon_type === 'image'
	);

	// Check the currently recorded keybind against app-level keybinds and other icons.
	// Returns a human-readable conflict message, or null if it's safe (or empty).
	let keybindError = $derived.by(() => {
		const kb = recorderValue;
		if (!kb.key) return null;
		const s = settingsStore.settings;
		return findKeybindConflict(kb, {
			excludeIconId: icon?.id,
			appKeybinds: {
				toggle_launcher: s.keybind_toggle_launcher,
				toggle_edit: s.keybind_toggle_edit,
				hide_launcher: s.keybind_hide_launcher,
				undo: s.keybind_undo
			},
			icons: settingsStore.getCurrentIcons()
		});
	});

	function clearKeybind() {
		recorderValue = { ...EMPTY_KEYBIND };
	}

	function close() {
		isOpen = false;
	}

	function handleSave() {
		if (!icon) return;
		if (localUrl.trim()) {
			onUpdateUrl(icon.id, localUrl.trim());
		} else if (icon.url) {
			onUpdateUrl(icon.id, undefined);
		}
		if (localIconPath !== (icon.icon_path ?? '')) {
			if (localIconPath === '') {
				onClearImage(icon.id);
			} else {
				onUpdateIcon(icon.id, localIconPath);
			}
		}
		onUpdateShowName(icon.id, localShowName);
		onUpdateCustomName(icon.id, localCustomName.trim() || null);
		onUpdateFontFamily(icon.id, localFontFamily.trim() || null);
		onUpdateFontSize(icon.id, localFontSize || null);
		onUpdateArgs(icon.id, localArgs.trim() || null);
		// Persist keybind only when set and not in conflict with another binding.
		const resolvedKeybind = recorderValue.key && !keybindError ? recorderValue : null;
		onUpdateKeybind(icon.id, resolvedKeybind);
		onUpdateKeybindGlobal(icon.id, localKeybindGlobal);
		onUpdateAppearance(icon.id, localAppearance);
		onSave?.();
		close();
	}

	async function selectFile() {
		const selected = await open({
			multiple: false,
			filters: [
				{
					name: 'Images',
					extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
				}
			]
		});
		if (selected && typeof selected === 'string') {
			localIconPath = convertFileSrc(selected);
		}
	}

	async function enterUrl() {
		const url = prompt('Enter image URL:', localIconPath || 'https://');
		if (url && url.trim()) {
			localIconPath = url.trim();
		}
	}

	function clearImage() {
		localIconPath = '';
	}
</script>

{#if icon}
	<SettingsModalShell
		bind:isOpen
		title={icon.icon_type === 'app' ? 'App Icon Settings' : 'Image Settings'}
		onClose={close}
		onSave={handleSave}
		maxWidth="420px"
	>
		<div class="settings-form">
			<SettingSection title="Icon">
				<div class="icon-preview">
					<div class="preview-box">
						{#if localIconPath}
							{#await loadIconDataUrl(localIconPath)}
								<div class="preview-placeholder">Loading...</div>
							{:then previewImage}
								{#if previewImage}
									<img src={previewImage} alt="Preview" class="preview-image" />
								{:else}
									<div class="preview-placeholder">Preview unavailable</div>
								{/if}
							{:catch}
								<div class="preview-placeholder">Preview unavailable</div>
							{/await}
						{:else if icon.icon_type === 'app'}
							<div class="preview-placeholder">System Default</div>
						{:else}
							<div class="preview-placeholder">No Image</div>
						{/if}
					</div>

					<input
						class="text-input readonly-input"
						type="text"
						readonly
						value={localIconPath}
						placeholder={icon.icon_type === 'app' ? 'Using system default icon' : 'No image set'}
					/>

					<div class="action-buttons">
						{#if icon.icon_type === 'app'}
							<button class="action-btn" onclick={selectFile} type="button">
								{localIconPath ? 'Change Icon' : 'Set Custom Icon'}
							</button>
							<button class="action-btn" onclick={enterUrl} type="button">Enter URL</button>
							{#if localIconPath}
								<button class="action-btn danger" onclick={clearImage} type="button">
									Reset to Default
								</button>
							{/if}
						{:else}
							<button class="action-btn" onclick={selectFile} type="button">Choose File</button>
							<button class="action-btn" onclick={enterUrl} type="button">Enter URL</button>
							{#if localIconPath}
								<button class="action-btn danger" onclick={clearImage} type="button">
									Remove
								</button>
							{/if}
						{/if}
					</div>
				</div>
			</SettingSection>

			<WidgetAppearanceSettings
				widgetType="icon"
				bind:appearance={localAppearance}
				defaults={{
					backgroundColor: 'rgba(255, 255, 255, 1)',
					backgroundOpacity: 0.2,
					borderRadius: settingsStore.settings.border_radius,
					padding: icon.icon_type === 'image' ? 0 : 8
				}}
			/>

			{#if icon.icon_type === 'app' && icon.path}
				<SettingSection title="App Details">
					<SettingRow label="App Path">
						<input class="text-input readonly-input" type="text" readonly value={icon.path} />
					</SettingRow>
					<SettingRow label="Launch Arguments">
						<input
							class="text-input"
							type="text"
							bind:value={localArgs}
							placeholder="e.g., --private-window (optional)"
						/>
					</SettingRow>
				</SettingSection>
			{/if}

			{#if icon.icon_type === 'image'}
				<SettingSection title="Click Action">
					<SettingRow label="Open URL on click">
						<input
							class="text-input"
							type="text"
							bind:value={localUrl}
							placeholder="https://example.com"
						/>
					</SettingRow>
				</SettingSection>
			{/if}

			{#if icon.icon_type !== 'image'}
				<SettingSection title="Display Name">
					<SettingRow>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localShowName} />
							<span>Show app name</span>
						</label>
					</SettingRow>
					<SettingRow label="Custom Name">
						<input
							class="text-input"
							type="text"
							bind:value={localCustomName}
							placeholder="Custom name (optional)"
						/>
					</SettingRow>
					<div class="field-grid">
						<SettingRow label="Font Family">
							<input
								class="text-input"
								type="text"
								bind:value={localFontFamily}
								placeholder="e.g., Arial, sans-serif"
							/>
						</SettingRow>
						<SettingRow label="Font Size (px)">
							<input class="text-input" type="number" min="8" max="48" bind:value={localFontSize} />
						</SettingRow>
					</div>
				</SettingSection>
			{/if}

			{#if isLaunchable}
				<SettingSection title="Launch Keybind">
					<KeybindRecorder
						bind:value={recorderValue}
						label="Launch shortcut"
						onRemove={recorderValue.key ? clearKeybind : undefined}
					/>
					<SettingRow>
						<label class="checkbox-label" title="Works even when the launcher is hidden">
							<input type="checkbox" bind:checked={localKeybindGlobal} />
							<span>Global</span>
						</label>
					</SettingRow>
					{#if keybindError}
						<p class="keybind-error">{keybindError}</p>
					{/if}
				</SettingSection>
			{/if}
		</div>
	</SettingsModalShell>
{/if}

<style>
	.icon-preview {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 12px;
	}

	.preview-box {
		width: 120px;
		height: 120px;
		background: rgba(255, 255, 255, 0.05);
		border: 2px dashed rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		align-self: center;
	}

	.preview-image {
		width: 100%;
		height: 100%;
		object-fit: contain;
		padding: 8px;
	}

	.preview-placeholder {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.8125rem;
		text-align: center;
		padding: 8px;
	}

	.readonly-input {
		opacity: 0.75;
		cursor: text;
	}

	.action-buttons {
		justify-content: center;
	}

	.keybind-hint {
		margin: 0 0 4px 0;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1.4;
	}

	.keybind-error {
		margin: 4px 0 0 0;
		padding: 6px 10px;
		background: rgba(255, 80, 80, 0.15);
		border: 1px solid rgba(255, 100, 100, 0.4);
		border-radius: 6px;
		color: rgba(255, 200, 200, 0.95);
		font-size: 0.8rem;
	}
</style>
