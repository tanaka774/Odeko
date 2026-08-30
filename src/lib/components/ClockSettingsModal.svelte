<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { ClockWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: ClockWidgetConfig;
		onSave: (config: ClockWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('digital');

	function createLocalConfig(sourceConfig: ClockWidgetConfig): ClockWidgetConfig {
		return {
			displayMode: 'digital',
			format: '24h',
			showSeconds: true,
			showDate: true,
			timezone: 'local',
			analogBackgroundColor: '#f2f4f8',
			analogBackgroundOpacity: 0.75,
			analogNumberColor: '#080a0e',
			analogTickColor: '#080a0e',
			analogHourHandColor: '#080a0e',
			analogMinuteHandColor: '#080a0e',
			analogSecondHandColor: '#3a7ee8',
			analogShowNumbers: false,
			analogShowSecondHand: true,
			...sourceConfig
		};
	}

	let localConfig = $state<ClockWidgetConfig>(createLocalConfig(config));

	$effect(() => {
		if (!isOpen) return;
		const nextConfig = createLocalConfig(config);
		localConfig = nextConfig;
		activeTab = nextConfig.displayMode ?? 'digital';
	});

	const timezones = [
		{ value: 'local', label: 'Local Time' },
		{ value: 'UTC', label: 'UTC' },
		{ value: 'America/New_York', label: 'New York (EST/EDT)' },
		{ value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
		{ value: 'America/Denver', label: 'Denver (MST/MDT)' },
		{ value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
		{ value: 'Europe/London', label: 'London (GMT/BST)' },
		{ value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
		{ value: 'Europe/Berlin', label: 'Berlin (CET/CEST)' },
		{ value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
		{ value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
		{ value: 'Asia/Dubai', label: 'Dubai (GST)' },
		{ value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
		{ value: 'Pacific/Auckland', label: 'Auckland (NZST/NZDT)' }
	];

	const defaultAppearance = {
		backgroundColor: 'rgba(0, 0, 0, 0.3)',
		backgroundOpacity: 0.3,
		padding: 16
	};

	function getBackgroundOpacityPercent() {
		return Math.round((localConfig.analogBackgroundOpacity ?? 0.75) * 100);
	}

	function updateBackgroundOpacity(event: Event) {
		const opacityPercent = Number((event.currentTarget as HTMLInputElement).value);
		localConfig.analogBackgroundOpacity = Number((opacityPercent / 100).toFixed(2));
	}

	function handleSave() {
		onSave(localConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	// Switching to the Digital/Analog tab is the display-mode switch — no
	// extra radio group needed (and a one-option radio group was confusing).
	function handleTabChange(key: string) {
		activeTab = key;
		if (key === 'digital' || key === 'analog') {
			localConfig.displayMode = key;
		}
	}
</script>

<SettingsModalShell
	bind:isOpen
	title="Clock Settings"
	onClose={handleClose}
	onSave={handleSave}
	tabKey={activeTab}
>
	<div class="settings-form">
		<TabBar
			{activeTab}
			onTabChange={handleTabChange}
			tabs={[
				{ key: 'digital', label: 'Digital' },
				{ key: 'analog', label: 'Analog' },
				{ key: 'appearance', label: 'Appearance' }
			]}
		/>

		{#if activeTab === 'digital' || activeTab === 'analog'}
			{#if activeTab === 'digital'}
				<SettingSection title="Time Format">
					<SettingRow>
						<div class="radio-group">
							<label class="radio-label">
								<input type="radio" name="format" value="12h" bind:group={localConfig.format} />
								<span>12-hour (AM/PM)</span>
							</label>
							<label class="radio-label">
								<input type="radio" name="format" value="24h" bind:group={localConfig.format} />
								<span>24-hour</span>
							</label>
						</div>
					</SettingRow>
				</SettingSection>

				<SettingSection title="Display Options">
					<SettingRow>
						<div class="checkbox-group">
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={localConfig.showSeconds} />
								<span>Show seconds</span>
							</label>
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={localConfig.showDate} />
								<span>Show date</span>
							</label>
						</div>
					</SettingRow>
				</SettingSection>
			{:else}
				<SettingSection title="Colors">
					<SettingRow label="Background Color" labelFor="analogBackgroundColor">
						<div class="color-control">
							<input
								type="color"
								id="analogBackgroundColor"
								bind:value={localConfig.analogBackgroundColor}
							/>
							<input type="text" bind:value={localConfig.analogBackgroundColor} />
						</div>
					</SettingRow>

					<SettingRow label="Number Color" labelFor="analogNumberColor">
						<div class="color-control">
							<input
								type="color"
								id="analogNumberColor"
								bind:value={localConfig.analogNumberColor}
							/>
							<input type="text" bind:value={localConfig.analogNumberColor} />
						</div>
					</SettingRow>

					<SettingRow label="Tick Color" labelFor="analogTickColor">
						<div class="color-control">
							<input type="color" id="analogTickColor" bind:value={localConfig.analogTickColor} />
							<input type="text" bind:value={localConfig.analogTickColor} />
						</div>
					</SettingRow>

					<SettingRow label="Hour Hand Color" labelFor="analogHourHandColor">
						<div class="color-control">
							<input
								type="color"
								id="analogHourHandColor"
								bind:value={localConfig.analogHourHandColor}
							/>
							<input type="text" bind:value={localConfig.analogHourHandColor} />
						</div>
					</SettingRow>

					<SettingRow label="Minute Hand Color" labelFor="analogMinuteHandColor">
						<div class="color-control">
							<input
								type="color"
								id="analogMinuteHandColor"
								bind:value={localConfig.analogMinuteHandColor}
							/>
							<input type="text" bind:value={localConfig.analogMinuteHandColor} />
						</div>
					</SettingRow>

					<SettingRow label="Second Hand Color" labelFor="analogSecondHandColor">
						<div class="color-control">
							<input
								type="color"
								id="analogSecondHandColor"
								bind:value={localConfig.analogSecondHandColor}
							/>
							<input type="text" bind:value={localConfig.analogSecondHandColor} />
						</div>
					</SettingRow>
				</SettingSection>

				<SettingSection title="Opacity">
					<SettingRow
						label="Background Opacity: {getBackgroundOpacityPercent()}%"
						labelFor="analogBackgroundOpacity"
					>
						<input
							type="range"
							id="analogBackgroundOpacity"
							class="range-input"
							min="0"
							max="100"
							step="5"
							value={getBackgroundOpacityPercent()}
							oninput={updateBackgroundOpacity}
						/>
						<div class="range-labels">
							<span>Transparent</span>
							<span>Solid</span>
						</div>
					</SettingRow>
				</SettingSection>

				<SettingSection title="Display Options">
					<SettingRow>
						<div class="checkbox-group">
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={localConfig.analogShowNumbers} />
								<span>Show numbers 1-12</span>
							</label>
							<label class="checkbox-label">
								<input type="checkbox" bind:checked={localConfig.analogShowSecondHand} />
								<span>Show second hand</span>
							</label>
						</div>
					</SettingRow>
				</SettingSection>
			{/if}

			<SettingSection title="Timezone">
				<SettingRow labelFor="timezone">
					<select id="timezone" class="select-input" bind:value={localConfig.timezone}>
						{#each timezones as tz (tz.value)}
							<option value={tz.value}>{tz.label}</option>
						{/each}
					</select>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="clock"
				bind:appearance={localConfig.appearance}
				defaults={{
					...defaultAppearance,
					padding: localConfig.displayMode === 'analog' ? 10 : 16
				}}
				hideFields={localConfig.displayMode === 'analog' ? ['textColor'] : []}
			/>
		{/if}
	</div>
</SettingsModalShell>
