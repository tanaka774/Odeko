<script lang="ts">
	import PowerControlBaseWidget from './PowerControlBaseWidget.svelte';
	import type { SleepWidgetConfig, WidgetComponentProps } from './types';

	type Props = WidgetComponentProps<SleepWidgetConfig>;

	let { config = {}, borderRadius = 12, isEditMode = false }: Props = $props();
</script>

<PowerControlBaseWidget
	{config}
	{borderRadius}
	{isEditMode}
	actionType="sleep"
	defaultIcon="💤"
/>
