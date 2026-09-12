<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import {
		TEXT_APPEARANCE_FIELDS,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type DrawingWidgetConfig
	} from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: DrawingWidgetConfig;
		onSave: (config: DrawingWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let localConfig = $state<DrawingWidgetConfig>({ ...config });

	$effect(() => {
		if (isOpen) {
			localConfig = { ...config };
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
	modalKey="drawing"
	bind:isOpen
	title="Drawing Settings"
	onClose={handleClose}
	onSave={handleSave}
>
	<div class="settings-form">
		<WidgetAppearanceSettings
			widgetType="drawing"
			bind:appearance={localConfig.appearance}
			defaults={WIDGET_TYPE_APPEARANCE_DEFAULTS.drawing ?? {}}
			hideFields={['backgroundColor', 'backgroundOpacity', ...TEXT_APPEARANCE_FIELDS]}
		/>
	</div>
</SettingsModalShell>
