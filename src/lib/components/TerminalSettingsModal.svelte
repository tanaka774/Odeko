<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import type { TerminalWidgetConfig } from '$lib/widgets/types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: TerminalWidgetConfig;
		onSave: (config: TerminalWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let localConfig = $state<TerminalWidgetConfig>({ ...config });

	$effect(() => {
		if (isOpen) {
			localConfig = { ...config };
		}
	});

	const defaultAppearance = WIDGET_TYPE_APPEARANCE_DEFAULTS.terminal ?? {};

	function handleSave() {
		onSave(localConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}
</script>

<SettingsModalShell
	modalKey="terminal"
	bind:isOpen
	title="Terminal Settings"
	onClose={handleClose}
	onSave={handleSave}
>
	<div class="settings-form">
		<WidgetAppearanceSettings
			widgetType="terminal"
			bind:appearance={localConfig.appearance}
			defaults={defaultAppearance}
			hideFields={['textColor', 'padding']}
		/>
	</div>
</SettingsModalShell>
