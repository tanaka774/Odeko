<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { loadIconDataUrl } from '$lib/icon-image';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import KeybindRecorder from './KeybindRecorder.svelte';
	import {
		getWidgetAppearance,
		getAppearanceBackground,
		getAppearanceBorder
	} from '$lib/widgets/appearance';
	import type { LauncherIcon, IconType } from '$lib/icons';
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
		onUpdateIcon = () => {},
		onUpdateUrl = () => {},
		onClearImage = () => {},
		onUpdateShowName = () => {},
		onUpdateCustomName = () => {},
		onUpdateFontFamily = () => {},
		onUpdateFontSize = () => {},
		onUpdateArgs = () => {},
		onUpdateKeybind = () => {},
		onUpdateKeybindGlobal = () => {},
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

	let activeTab = $state('icon');
	let iconSourceMode = $state<'file' | 'url'>('file');
	let localFilePath = $state('');
	let localUrlValue = $state('');
	let localUrl = $state('');
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

	// Titles match the other settings modals ("<Item> Settings") and name the
	// actual item type instead of calling every non-app icon an "Image".
	const TYPE_TITLES: Record<IconType, string> = {
		app: 'App Icon Settings',
		image: 'Image Settings',
		link: 'Link Settings',
		widget: 'Widget Icon Settings'
	};
	let modalTitle = $derived(
		icon ? (TYPE_TITLES[icon.icon_type] ?? 'Icon Settings') : 'Icon Settings'
	);

	// Every icon type gets the same three tabs; only the third tab's label
	// changes (images have no display name to configure).
	let tabs = $derived<{ key: string; label: string }[]>(
		icon
			? icon.icon_type === 'image'
				? [
						{ key: 'icon', label: 'Icon' },
						{ key: 'appearance', label: 'Appearance' },
						{ key: 'shortcut', label: 'Shortcut' }
					]
				: [
						{ key: 'icon', label: 'Icon' },
						{ key: 'appearance', label: 'Appearance' },
						{ key: 'name', label: 'Name & Shortcut' }
					]
			: []
	);

	// Reset the local working copy once per open (tracked by icon id, so
	// in-place icon updates while the modal is open do not yank the user
	// back to the first tab).
	let lastOpenedIconId = $state<string | null>(null);
	$effect(() => {
		if (isOpen && icon && lastOpenedIconId !== icon.id) {
			lastOpenedIconId = icon.id;
			activeTab = 'icon';
			iconSourceMode = detectSourceMode(icon.icon_path);
			localFilePath = iconSourceMode === 'file' ? (icon.icon_path ?? '') : '';
			localUrlValue = iconSourceMode === 'url' ? (icon.icon_path ?? '') : '';
			localUrl = icon.url || '';
			localShowName = icon.show_name ?? true;
			localCustomName = icon.custom_name ?? '';
			localFontFamily = icon.font_family ?? '';
			localFontSize = icon.font_size ?? 14;
			localArgs = icon.args ?? '';
			localAppearance = icon.appearance ? { ...icon.appearance } : undefined;
			localKeybindGlobal = icon.keybind_global ?? false;
			recorderValue = icon.keybind ? { ...icon.keybind } : { ...EMPTY_KEYBIND };
		} else if (!isOpen) {
			lastOpenedIconId = null;
		}
	});

	// A stored icon path may be a picked file (raw path or converted
	// asset:// URL) or a user-entered http(s)/data URL.
	function detectSourceMode(path: string | undefined): 'file' | 'url' {
		if (!path) return 'file';
		return /^https?:\/\//i.test(path) || path.startsWith('data:image/') ? 'url' : 'file';
	}

	// The effective source driving both the modal preview and the save.
	let previewSource = $derived(iconSourceMode === 'url' ? localUrlValue.trim() : localFilePath);
	let previewImage = $state<string | undefined>(undefined);
	$effect(() => {
		const source = previewSource;
		if (!source) {
			previewImage = undefined;
			return;
		}
		let cancelled = false;
		void loadIconDataUrl(source)
			.then((url) => {
				if (!cancelled) previewImage = url || undefined;
			})
			.catch(() => {
				if (!cancelled) previewImage = undefined;
			});
		return () => {
			cancelled = true;
		};
	});

	let hasCustomSource = $derived(localFilePath !== '' || localUrlValue.trim() !== '');

	// Mirror of AppIcon.svelte's fallback defaults: the launcher-wide corner
	// radius and no padding for raw images.
	const appearanceDefaults = $derived(
		icon
			? {
					backgroundColor: 'rgba(255, 255, 255, 1)',
					backgroundOpacity: 0.2,
					borderRadius: settingsStore.settings.border_radius,
					padding: icon.icon_type === 'image' ? 0 : 8
				}
			: {}
	);
	const previewAppearance = $derived(
		getWidgetAppearance({ appearance: localAppearance }, appearanceDefaults)
	);
	const previewBackground = $derived(getAppearanceBackground(previewAppearance));
	const previewBorder = $derived(getAppearanceBorder(previewAppearance));

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
		const effectiveSource = iconSourceMode === 'url' ? localUrlValue.trim() : localFilePath;
		if (effectiveSource !== (icon.icon_path ?? '')) {
			if (effectiveSource === '') {
				onClearImage(icon.id);
			} else {
				onUpdateIcon(icon.id, effectiveSource);
			}
		}
		if (localUrl.trim()) {
			onUpdateUrl(icon.id, localUrl.trim());
		} else if (icon.url) {
			onUpdateUrl(icon.id, undefined);
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
			localFilePath = convertFileSrc(selected);
		}
	}

	function clearImage() {
		localFilePath = '';
		localUrlValue = '';
	}
</script>

{#if icon}
	<SettingsModalShell
		bind:isOpen
		title={modalTitle}
		onClose={close}
		onSave={handleSave}
		maxWidth="480px"
		tabKey={activeTab}
	>
		<div class="settings-form">
			<TabBar {activeTab} onTabChange={(key) => (activeTab = key)} {tabs} />

			{#if activeTab === 'icon'}
				<SettingSection title="Icon">
					<div class="icon-preview">
						<div class="preview-box">
							{#if previewImage}
								<img src={previewImage} alt="Preview" class="preview-image" />
							{:else if icon.icon_type === 'app'}
								<div class="preview-placeholder">System Default</div>
							{:else}
								<div class="preview-placeholder">No Image</div>
							{/if}
						</div>

						<div class="segmented" role="group" aria-label="Icon source">
							<button
								type="button"
								class="segment"
								class:active={iconSourceMode === 'file'}
								onclick={() => (iconSourceMode = 'file')}
							>
								File
							</button>
							<button
								type="button"
								class="segment"
								class:active={iconSourceMode === 'url'}
								onclick={() => (iconSourceMode = 'url')}
							>
								URL
							</button>
						</div>

						{#if iconSourceMode === 'file'}
							<input
								class="text-input readonly-input"
								type="text"
								readonly
								value={localFilePath}
								placeholder="Choose an image file"
							/>
							<div class="action-buttons">
								<button class="action-btn" onclick={selectFile} type="button">
									{localFilePath ? 'Change File' : 'Choose File'}
								</button>
								{#if hasCustomSource}
									<button class="action-btn danger" onclick={clearImage} type="button">
										{icon.icon_type === 'app' ? 'Reset to Default' : 'Remove'}
									</button>
								{/if}
							</div>
						{:else}
							<input
								class="text-input"
								type="text"
								bind:value={localUrlValue}
								placeholder="https://example.com/icon.png"
							/>
							<div class="action-buttons">
								{#if hasCustomSource}
									<button class="action-btn danger" onclick={clearImage} type="button">
										{icon.icon_type === 'app' ? 'Reset to Default' : 'Remove'}
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</SettingSection>

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

				{#if icon.icon_type === 'link'}
					<SettingSection title="Link URL">
						<SettingRow label="Open this URL on click">
							<input
								class="text-input"
								type="text"
								bind:value={localUrl}
								placeholder="https://example.com"
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
			{:else if activeTab === 'appearance'}
				<SettingSection title="Preview">
					<div class="tile-preview-wrap">
						<div
							class="tile-preview"
							style:background={previewBackground}
							style:border={previewBorder}
							style:border-radius="{previewAppearance.borderRadius}px"
							style:padding="{previewAppearance.padding}px"
							style:opacity={previewAppearance.opacity}
						>
							{#if previewImage}
								<img src={previewImage} alt="" class="tile-preview-image" />
							{:else}
								<span class="tile-preview-initial"
									>{icon.icon_type === 'image'
										? '🖼️'
										: icon.icon_type === 'link'
											? '🔗'
											: icon.name.charAt(0).toUpperCase()}</span
								>
							{/if}
							{#if icon.icon_type !== 'image' && localShowName}
								<span
									class="tile-preview-label"
									style:color={previewAppearance.textColor}
									style:font-family={localFontFamily || 'inherit'}
									style:font-size="{localFontSize}px">{localCustomName.trim() || icon.name}</span
								>
							{/if}
						</div>
					</div>
				</SettingSection>

				<WidgetAppearanceSettings
					widgetType="icon"
					bind:appearance={localAppearance}
					defaults={appearanceDefaults}
					opacityLabel="Icon Opacity"
					hideFields={icon.icon_type === 'image' || !localShowName ? ['textColor'] : []}
				/>
			{:else}
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
								<input
									class="text-input"
									type="number"
									min="8"
									max="48"
									bind:value={localFontSize}
								/>
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

	.segmented {
		display: flex;
		gap: 3px;
		padding: 3px;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
	}

	.segment {
		flex: 1;
		padding: 6px 0;
		background: transparent;
		border: none;
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.segment:hover {
		color: white;
	}

	.segment.active {
		background: rgba(255, 255, 255, 0.12);
		color: white;
		font-weight: 500;
	}

	/* Live preview tile mirroring AppIcon.svelte's rendering, so appearance
	   tweaks are visible before saving. */
	.tile-preview-wrap {
		display: flex;
		justify-content: center;
		padding: 16px;
		background: rgba(0, 0, 0, 0.25);
		border: 1px dashed rgba(255, 255, 255, 0.12);
		border-radius: 12px;
	}

	.tile-preview {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 96px;
		height: 96px;
		box-sizing: border-box;
		gap: 4px;
		overflow: hidden;
	}

	.tile-preview-image {
		flex: 1;
		min-height: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 12px;
	}

	.tile-preview-initial {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.75rem;
		font-weight: bold;
		color: rgba(255, 255, 255, 0.9);
	}

	.tile-preview-label {
		flex-shrink: 0;
		max-width: 100%;
		margin-top: 4px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: center;
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
