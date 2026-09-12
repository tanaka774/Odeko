<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import type { MusicWidgetConfig } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: MusicWidgetConfig;
		onSave: (config: MusicWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');

	let localConfig = $state<MusicWidgetConfig>({
		showAlbumArt: true,
		showProgressBar: true,
		themeColor: '#86efac',
		...config
	});

	$effect(() => {
		if (isOpen) {
			localConfig = {
				showAlbumArt: true,
				showProgressBar: true,
				themeColor: '#86efac',
				...config
			};
			activeTab = 'settings';
		}
	});

	const defaultAppearance = {
		backgroundColor: 'rgba(0, 0, 0, 0.3)',
		backgroundOpacity: 0.3,
		padding: 16
	};

	function handleSave() {
		onSave(localConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	modalKey="music"
	bind:isOpen
	title="Music Player Settings"
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
			<SettingSection title="Theme">
				<SettingRow label="Theme Color" labelFor="themeColor">
					<div class="color-control">
						<input
							type="color"
							id="themeColor"
							value={localConfig.themeColor}
							oninput={(e) => {
								localConfig.themeColor = e.currentTarget.value;
							}}
						/>
						<input
							type="text"
							value={localConfig.themeColor}
							oninput={(e) => {
								localConfig.themeColor = e.currentTarget.value;
							}}
						/>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Display Options">
				<SettingRow>
					<div class="checkbox-group">
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showAlbumArt} />
							<span>Show Album Art</span>
						</label>
						<label class="checkbox-label">
							<input type="checkbox" bind:checked={localConfig.showProgressBar} />
							<span>Show Progress Bar</span>
						</label>
					</div>
				</SettingRow>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="music"
				bind:appearance={localConfig.appearance}
				defaults={defaultAppearance}
			/>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.hint {
		color: rgba(255, 255, 255, 0.5);
		font-size: calc(0.9714 * var(--modal-font-size));
		margin: 0;
	}
</style>
