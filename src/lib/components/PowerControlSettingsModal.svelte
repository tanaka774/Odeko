<script lang="ts">
	import { open } from '@tauri-apps/plugin-dialog';
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import KeybindRecorder from './KeybindRecorder.svelte';
	import {
		settingsStore,
		findKeybindConflict,
		type KeybindConfig
	} from '$lib/stores/settings.svelte';
	import type { PowerControlWidgetConfig, WidgetType } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: PowerControlWidgetConfig;
		widgetId?: string;
		widgetType?: WidgetType;
		keybind?: KeybindConfig;
		keybindGlobal?: boolean;
		widgetName: string;
		onSave: (config: PowerControlWidgetConfig) => void;
		onUpdateKeybind?: (keybind: KeybindConfig | null) => void;
		onUpdateKeybindGlobal?: (global: boolean) => void;
	}

	interface IconForConflictCheck {
		id: string;
		name: string;
		custom_name?: string | null;
		keybind?: KeybindConfig;
	}

	const EMPTY_KEYBIND: KeybindConfig = {
		key: '',
		ctrl: false,
		alt: false,
		shift: false,
		meta: false
	};

	let {
		isOpen = $bindable(false),
		config = {},
		widgetId,
		widgetType,
		keybind,
		keybindGlobal = false,
		widgetName,
		onSave,
		onUpdateKeybind = () => {},
		onUpdateKeybindGlobal = () => {}
	}: Props = $props();

	let activeTab = $state('settings');
	let recorderValue = $state<KeybindConfig>({ ...EMPTY_KEYBIND });
	let localKeybindGlobal = $state(false);

	let localConfig = $state<PowerControlWidgetConfig>({
		requireConfirmation: true,
		showLabel: true,
		buttonText: widgetName,
		iconType: 'default',
		iconPath: '',
		...config
	});

	$effect(() => {
		if (isOpen) {
			localConfig = {
				requireConfirmation: true,
				showLabel: true,
				buttonText: widgetName,
				iconType: 'default',
				iconPath: '',
				...config
			};
			recorderValue = keybind ? { ...keybind } : { ...EMPTY_KEYBIND };
			localKeybindGlobal = keybindGlobal;
			activeTab = 'settings';
		}
	});

	const defaultAppearance = {
		backgroundColor: 'rgba(0, 0, 0, 0.3)',
		backgroundOpacity: 0.3,
		padding: 16
	};

	let keybindError = $derived.by(() => {
		if (!recorderValue.key) return null;
		const s = settingsStore.settings;
		return findKeybindConflict(recorderValue, {
			excludeIconId: widgetId,
			appKeybinds: {
				toggle_launcher: s.keybind_toggle_launcher,
				toggle_edit: s.keybind_toggle_edit,
				hide_launcher: s.keybind_hide_launcher,
				undo: s.keybind_undo
			},
			icons: settingsStore.getCurrentIcons() as IconForConflictCheck[]
		});
	});

	function handleSave() {
		if (keybindError) return;

		onUpdateKeybind(recorderValue.key ? recorderValue : null);
		onUpdateKeybindGlobal(localKeybindGlobal);
		onSave({
			...localConfig,
			buttonText: localConfig.buttonText?.trim() || widgetName
		});
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	async function selectCustomIcon() {
		const selected = await open({
			multiple: false,
			directory: false,
			filters: [
				{
					name: 'Images',
					extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']
				}
			]
		});

		if (selected && typeof selected === 'string') {
			localConfig.iconType = 'custom';
			localConfig.iconPath = selected;
		}
	}

	function resetToDefaultIcon() {
		localConfig.iconType = 'default';
		localConfig.iconPath = '';
	}

	function clearKeybind() {
		recorderValue = { ...EMPTY_KEYBIND };
	}
</script>

<SettingsModalShell
	bind:isOpen
	title="{widgetName} Settings"
	onClose={handleClose}
	onSave={handleSave}
	tabKey={activeTab}
>
	<div class="settings-form">
		<TabBar
			{activeTab}
			onTabChange={(key) => (activeTab = key)}
			tabs={[
				{ key: 'settings', label: 'Settings' },
				{ key: 'appearance', label: 'Appearance' }
			]}
		/>

		{#if activeTab === 'settings'}
			<SettingSection title="Behavior">
				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.requireConfirmation} />
						<span>Require Confirmation</span>
					</label>
				</SettingRow>

				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.showLabel} />
						<span>Show Label</span>
					</label>
				</SettingRow>

				{#if localConfig.showLabel}
					<SettingRow label="Label Text" labelFor="buttonText">
						<input
							id="buttonText"
							class="text-input"
							type="text"
							placeholder={widgetName}
							bind:value={localConfig.buttonText}
						/>
					</SettingRow>
				{/if}

				<SettingRow>
					<div class="keybind-section">
						<KeybindRecorder
							bind:value={recorderValue}
							label="Power shortcut"
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
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Icon">
				<SettingRow>
					<div class="radio-group">
						<label class="radio-label">
							<input
								type="radio"
								name="iconType"
								value="default"
								bind:group={localConfig.iconType}
							/>
							<span>Default</span>
						</label>
						<label class="radio-label">
							<input
								type="radio"
								name="iconType"
								value="custom"
								bind:group={localConfig.iconType}
							/>
							<span>Custom</span>
						</label>
					</div>
				</SettingRow>

				{#if localConfig.iconType === 'custom'}
					<SettingRow>
						<div class="custom-icon-section">
							<div class="button-row">
								<button class="select-btn" onclick={selectCustomIcon} type="button">
									Select Image
								</button>
								{#if localConfig.iconPath}
									<button class="reset-btn" onclick={resetToDefaultIcon} type="button">Reset</button
									>
								{/if}
							</div>
							{#if localConfig.iconPath}
								<p class="file-path">{localConfig.iconPath}</p>
							{/if}
						</div>
					</SettingRow>
				{/if}
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType={widgetType}
				bind:appearance={localConfig.appearance}
				defaults={defaultAppearance}
				hideFields={localConfig.showLabel ? [] : ['textColor']}
			/>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.hint {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
		margin: 0;
		margin-top: -6px;
	}

	.custom-icon-section {
		padding: 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}

	.keybind-section {
		width: 100%;
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

	.button-row {
		display: flex;
		gap: 10px;
		align-items: center;
	}

	.select-btn {
		padding: 8px 16px;
		background: rgba(120, 160, 200, 0.85);
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.select-btn:hover {
		background: rgba(120, 160, 200, 1);
	}

	.reset-btn {
		padding: 8px 16px;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		color: rgba(255, 255, 255, 0.8);
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.reset-btn:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	.file-path {
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
		margin: 8px 0 0 0;
		word-break: break-all;
	}
</style>
