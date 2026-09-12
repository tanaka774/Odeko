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
		wordWrap: true,
		...config
	});

	$effect(() => {
		if (isOpen) {
			localConfig = {
				content: '',
				wordWrap: true,
				...config
			};
			activeTab = 'settings';
		}
	});

	function handleSave() {
		onSave({ ...localConfig });
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	modalKey="memo"
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
