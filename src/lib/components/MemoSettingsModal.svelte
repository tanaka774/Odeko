<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { MemoWidgetConfig } from '$lib/widgets/types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: MemoWidgetConfig;
		onSave: (config: MemoWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<MemoWidgetConfig>({
		content: '',
		fontSize: 14,
		fontFamily: 'system-ui',
		wordWrap: true,
		...config
	});

	let useCustomFont = $state(false);
	let customFontValue = $state('');

	const fontOptions = [
		{ value: 'system-ui', label: 'System UI (Default)' },
		{ value: 'Arial, sans-serif', label: 'Arial' },
		{ value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
		{ value: 'Georgia, serif', label: 'Georgia' },
		{ value: 'Times New Roman, serif', label: 'Times New Roman' },
		{ value: 'Courier New, monospace', label: 'Courier New' },
		{ value: 'Verdana, sans-serif', label: 'Verdana' },
		{ value: 'Consolas, monospace', label: 'Consolas' },
		{ value: 'Monaco, monospace', label: 'Monaco' },
		{ value: 'Fira Code, monospace', label: 'Fira Code' },
		{ value: 'Segoe UI, sans-serif', label: 'Segoe UI' },
		{ value: 'Roboto, sans-serif', label: 'Roboto' },
		{ value: 'Inter, sans-serif', label: 'Inter' },
		{ value: 'custom', label: 'Custom Font...' }
	];

	$effect(() => {
		if (isOpen) {
			localConfig = {
				content: '',
				fontSize: 14,
				fontFamily: 'system-ui',
				wordWrap: true,
				...config
			};

			activeTab = 'settings';

			const isCustom = !fontOptions.some((opt) => opt.value === config.fontFamily);
			useCustomFont = isCustom || config.fontFamily === 'custom';
			customFontValue = isCustom ? config.fontFamily || '' : '';
		}
	});

	function handleSave() {
		const finalConfig = {
			...localConfig,
			fontFamily: useCustomFont ? customFontValue : localConfig.fontFamily
		};
		onSave(finalConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	function handleFontChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		if (target.value === 'custom') {
			useCustomFont = true;
			localConfig.fontFamily = customFontValue || 'Arial';
		} else {
			useCustomFont = false;
			localConfig.fontFamily = target.value;
		}
	}
</script>

<SettingsModalShell
	bind:isOpen
	title="Memo Settings"
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
			<SettingSection title="Text Appearance">
				<SettingRow label="Font Size: {localConfig.fontSize}px">
					<input
						class="range-input"
						type="range"
						min="10"
						max="32"
						bind:value={localConfig.fontSize}
					/>
				</SettingRow>

				<SettingRow label="Font Family">
					<select
						class="select-input"
						value={useCustomFont ? 'custom' : localConfig.fontFamily}
						onchange={handleFontChange}
					>
						{#each fontOptions as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
					{#if useCustomFont}
						<input
							type="text"
							class="text-input custom-font-input"
							placeholder="Enter font name (e.g., 'Fira Code')"
							bind:value={customFontValue}
						/>
					{/if}
				</SettingRow>

				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.wordWrap} />
						<span>Word Wrap</span>
					</label>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="memo"
				bind:appearance={localConfig.appearance}
				defaults={WIDGET_TYPE_APPEARANCE_DEFAULTS.memo ?? {}}
			/>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.custom-font-input {
		margin-top: 8px;
	}
</style>
