<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { WeatherWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: WeatherWidgetConfig;
		onSave: (config: WeatherWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	function createDefaultConfig(): WeatherWidgetConfig {
		return {
			location: 'Tokyo',
			unit: 'celsius',
			refreshInterval: 30 * 60 * 1000,
			forecastHours: 3
		};
	}

	let localConfig = $state<WeatherWidgetConfig>(createDefaultConfig());

	$effect(() => {
		if (isOpen) {
			localConfig = {
				...createDefaultConfig(),
				...config
			};
			activeTab = 'settings';
		}
	});

	const refreshOptions = [
		{ value: 15 * 60 * 1000, label: '15 minutes' },
		{ value: 30 * 60 * 1000, label: '30 minutes' },
		{ value: 60 * 60 * 1000, label: '1 hour' }
	];

	const forecastOptions = [
		{ value: 0, label: 'No forecast' },
		{ value: 1, label: 'Next 1 hour' },
		{ value: 2, label: 'Next 2 hours' },
		{ value: 3, label: 'Next 3 hours' },
		{ value: 4, label: 'Next 4 hours' }
	];

	const defaultAppearance = {
		backgroundColor: '#1e293b',
		backgroundOpacity: 0.82,
		padding: 16
	};

	function handleSave() {
		onSave({
			...localConfig,
			location: localConfig.location?.trim() || 'Tokyo'
		});
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell bind:isOpen title="Weather Settings" onClose={handleClose} onSave={handleSave} tabKey={activeTab}>
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
			<SettingSection title="General">
				<SettingRow label="Location" labelFor="weather-location">
					<input
						id="weather-location"
						class="text-input"
						type="text"
						placeholder="Tokyo"
						bind:value={localConfig.location}
					/>
				</SettingRow>

				<SettingRow label="Temperature Unit">
					<div class="radio-group">
						<label class="radio-label">
							<input
								type="radio"
								name="weather-unit"
								value="celsius"
								bind:group={localConfig.unit}
							/>
							<span>Celsius</span>
						</label>
						<label class="radio-label">
							<input
								type="radio"
								name="weather-unit"
								value="fahrenheit"
								bind:group={localConfig.unit}
							/>
							<span>Fahrenheit</span>
						</label>
					</div>
				</SettingRow>

				<SettingRow label="Update Interval" labelFor="weather-refresh">
					<select
						id="weather-refresh"
						class="select-input"
						bind:value={localConfig.refreshInterval}
					>
						{#each refreshOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</SettingRow>

				<SettingRow label="Forecast" labelFor="weather-forecast">
					<select id="weather-forecast" class="select-input" bind:value={localConfig.forecastHours}>
						{#each forecastOptions as option}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="weather"
				bind:appearance={localConfig.appearance}
				defaults={defaultAppearance}
			/>
		{/if}
	</div>
</SettingsModalShell>
