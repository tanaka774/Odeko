<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import { colorToHexInputValue } from '$lib/widgets/appearance';
	import type { SystemWidgetConfig } from '$lib/widgets/types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from '$lib/widgets/types';
	import './settings/modal-form.css';

	interface Props {
		isOpen?: boolean;
		config?: SystemWidgetConfig;
		onSave: (config: SystemWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<SystemWidgetConfig>({
		showCpu: true,
		showMemory: true,
		showDisk: true,
		showPercentage: true,
		showActualUsage: true,
		refreshInterval: 2000,
		...config
	});

	$effect(() => {
		if (isOpen) {
			localConfig = {
				showCpu: true,
				showMemory: true,
				showDisk: true,
				showPercentage: true,
				showActualUsage: true,
				refreshInterval: 2000,
				...config
			};
			activeTab = 'settings';
		}
	});

	const refreshOptions = [
		{ value: 1000, label: '1 second' },
		{ value: 2000, label: '2 seconds' },
		{ value: 5000, label: '5 seconds' },
		{ value: 10000, label: '10 seconds' }
	];

	const defaultAppearance = WIDGET_TYPE_APPEARANCE_DEFAULTS.system ?? {};

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
	title="System Monitor Settings"
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
			<SettingSection title="Display Metrics">
				<SettingRow>
					<div class="checkbox-group">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showCpu} />
							<span>CPU Usage</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showMemory} />
							<span>Memory (RAM)</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showDisk} />
							<span>Disk Usage</span>
						</label>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Display Details">
				<SettingRow>
					<div class="checkbox-group">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showPercentage} />
							<span>Show percentage</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showActualUsage} />
							<span>Show actual usage</span>
						</label>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Update Interval">
				<SettingRow labelFor="refresh">
					<select id="refresh" class="select-input" bind:value={localConfig.refreshInterval}>
						{#each refreshOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="system"
				bind:appearance={localConfig.appearance}
				defaults={defaultAppearance}
			/>

			<SettingSection title="Gauge Bar Colors">
				<SettingRow label="Gauge Low Color" labelFor="system-gauge-low-color">
					<div class="color-control">
						<input
							id="system-gauge-low-color"
							type="color"
							value={colorToHexInputValue(localConfig.gaugeLowColor, '#39ff14')}
							oninput={(event) => (localConfig.gaugeLowColor = event.currentTarget.value)}
						/>
						<input
							type="text"
							value={localConfig.gaugeLowColor ?? ''}
							placeholder="#39ff14"
							oninput={(event) => (localConfig.gaugeLowColor = event.currentTarget.value)}
						/>
					</div>
				</SettingRow>

				<SettingRow label="Gauge Mid Color" labelFor="system-gauge-mid-color">
					<div class="color-control">
						<input
							id="system-gauge-mid-color"
							type="color"
							value={colorToHexInputValue(localConfig.gaugeMidColor, '#e6c619')}
							oninput={(event) => (localConfig.gaugeMidColor = event.currentTarget.value)}
						/>
						<input
							type="text"
							value={localConfig.gaugeMidColor ?? ''}
							placeholder="#e6c619"
							oninput={(event) => (localConfig.gaugeMidColor = event.currentTarget.value)}
						/>
					</div>
				</SettingRow>

				<SettingRow label="Gauge High Color" labelFor="system-gauge-high-color">
					<div class="color-control">
						<input
							id="system-gauge-high-color"
							type="color"
							value={colorToHexInputValue(localConfig.gaugeHighColor, '#e63219')}
							oninput={(event) => (localConfig.gaugeHighColor = event.currentTarget.value)}
						/>
						<input
							type="text"
							value={localConfig.gaugeHighColor ?? ''}
							placeholder="#e63219"
							oninput={(event) => (localConfig.gaugeHighColor = event.currentTarget.value)}
						/>
					</div>
				</SettingRow>

				<SettingRow label="Gauge Track Color" labelFor="system-gauge-track-color">
					<div class="color-control">
						<input
							id="system-gauge-track-color"
							type="color"
							value={colorToHexInputValue(localConfig.gaugeTrackColor, '#000000')}
							oninput={(event) => (localConfig.gaugeTrackColor = event.currentTarget.value)}
						/>
						<input
							type="text"
							value={localConfig.gaugeTrackColor ?? ''}
							placeholder="rgba(0, 0, 0, 0.35)"
							oninput={(event) => (localConfig.gaugeTrackColor = event.currentTarget.value)}
						/>
					</div>
				</SettingRow>
			</SettingSection>
		{/if}
	</div>
</SettingsModalShell>
