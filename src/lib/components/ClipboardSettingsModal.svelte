<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { ClipboardWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: ClipboardWidgetConfig;
		onSave: (config: ClipboardWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<ClipboardWidgetConfig>({
		history: [],
		maxEntries: 20,
		showTimestamps: true,
		captureImages: true,
		...config
	});

	$effect(() => {
		if (isOpen) {
			localConfig = {
				history: [],
				maxEntries: 20,
				showTimestamps: true,
				captureImages: true,
				...config
			};
			activeTab = 'settings';
		}
	});

	function handleSave() {
		onSave(localConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	bind:isOpen
	title="Clipboard Settings"
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
			<SettingSection title="History">
				<SettingRow label="Max Entries: {localConfig.maxEntries}">
					<input
						class="range-input"
						type="range"
						min="10"
						max="100"
						step="5"
						bind:value={localConfig.maxEntries}
					/>
				</SettingRow>

				<SettingRow label="Capturing">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.captureImages} />
						<span>Capture images (Windows, Linux, macOS)</span>
					</label>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Display">
				<SettingRow label="Timestamps">
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.showTimestamps} />
						<span>Show the time each item was copied</span>
					</label>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings widgetType="clipboard" bind:appearance={localConfig.appearance} />
		{/if}
	</div>
</SettingsModalShell>
