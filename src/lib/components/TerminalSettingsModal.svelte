<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { TerminalWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: TerminalWidgetConfig;
		onSave: (config: TerminalWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<TerminalWidgetConfig>({
		fontSize: 14,
		fontFamily: 'Consolas',
		...config
	});

	$effect(() => {
		if (isOpen) {
			localConfig = {
				fontSize: 14,
				fontFamily: 'Consolas',
				...config
			};
			activeTab = 'settings';
		}
	});

	const fontFamilies = [
		{ value: 'Consolas', label: 'Consolas' },
		{ value: 'Courier New', label: 'Courier New' },
		{ value: 'Fira Code', label: 'Fira Code' },
		{ value: 'JetBrains Mono', label: 'JetBrains Mono' },
		{ value: 'Source Code Pro', label: 'Source Code Pro' },
		{ value: 'Monaco', label: 'Monaco' }
	];

	const defaultAppearance = {
		backgroundColor: 'rgba(30, 30, 30, 0.95)',
		backgroundOpacity: 0.95,
		padding: 0
	};

	function handleSave() {
		const nextConfig = { ...localConfig };
		delete nextConfig.backgroundOpacity;
		delete nextConfig.theme;

		onSave(nextConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	bind:isOpen
	title="Terminal Settings"
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
			<SettingSection title="Font">
				<SettingRow label="Font Size: {localConfig.fontSize}px" labelFor="fontSize">
					<input
						id="fontSize"
						class="range-input"
						type="range"
						min="10"
						max="20"
						step="1"
						bind:value={localConfig.fontSize}
					/>
					<div class="range-labels">
						<span>10px</span>
						<span>20px</span>
					</div>
				</SettingRow>

				<SettingRow label="Font Family" labelFor="fontFamily">
					<select id="fontFamily" class="select-input" bind:value={localConfig.fontFamily}>
						{#each fontFamilies as font (font.value)}
							<option value={font.value}>{font.label}</option>
						{/each}
					</select>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="terminal"
				bind:appearance={localConfig.appearance}
				defaults={defaultAppearance}
				hideFields={['textColor', 'padding']}
			/>
		{/if}
	</div>
</SettingsModalShell>
