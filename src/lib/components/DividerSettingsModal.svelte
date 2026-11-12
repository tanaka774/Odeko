<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import {
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type DividerLineStyle,
		type DividerWidgetConfig
	} from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: DividerWidgetConfig;
		onSave: (config: DividerWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	function createLocalConfig(source: DividerWidgetConfig): DividerWidgetConfig {
		return {
			orientation: 'horizontal',
			lineStyle: 'solid',
			thickness: 1,
			color: '#ffffff',
			label: '',
			...source
		};
	}

	let localConfig = $state<DividerWidgetConfig>(createLocalConfig(config));

	$effect(() => {
		if (isOpen) {
			localConfig = createLocalConfig(config);
			activeTab = 'settings';
		}
	});

	const lineStyles: { value: DividerLineStyle; label: string }[] = [
		{ value: 'solid', label: 'Solid' },
		{ value: 'dashed', label: 'Dashed' },
		{ value: 'dotted', label: 'Dotted' },
		{ value: 'double', label: 'Double' },
		{ value: 'fade', label: 'Fade' }
	];

	function handleSave() {
		onSave({ ...localConfig });
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	modalKey="divider"
	bind:isOpen
	title="Divider Settings"
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
			<SettingSection title="Line">
				<SettingRow label="Direction">
					<div class="radio-group">
						<label class="radio-label">
							<input
								type="radio"
								name="divider-orientation"
								value="horizontal"
								bind:group={localConfig.orientation}
							/>
							<span>Horizontal</span>
						</label>
						<label class="radio-label">
							<input
								type="radio"
								name="divider-orientation"
								value="vertical"
								bind:group={localConfig.orientation}
							/>
							<span>Vertical</span>
						</label>
					</div>
				</SettingRow>

				<SettingRow label="Style" labelFor="divider-style">
					<select id="divider-style" class="select-input" bind:value={localConfig.lineStyle}>
						{#each lineStyles as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</SettingRow>

				<SettingRow label="Thickness: {localConfig.thickness}px" labelFor="divider-thickness">
					<input
						id="divider-thickness"
						class="range-input"
						type="range"
						min="1"
						max="16"
						step="1"
						bind:value={localConfig.thickness}
					/>
				</SettingRow>

				<SettingRow label="Color" labelFor="divider-color">
					<div class="color-control">
						<input type="color" id="divider-color" bind:value={localConfig.color} />
						<input type="text" aria-label="Line color" bind:value={localConfig.color} />
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Label">
				<SettingRow label="Text in the middle" labelFor="divider-label">
					<input id="divider-label" class="text-input" type="text" bind:value={localConfig.label} />
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="divider"
				bind:appearance={localConfig.appearance}
				defaults={WIDGET_TYPE_APPEARANCE_DEFAULTS.divider ?? {}}
				hideFields={['borderColor', 'borderWidth', 'borderStyle']}
			/>
		{/if}
	</div>
</SettingsModalShell>
