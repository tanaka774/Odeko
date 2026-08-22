<script lang="ts">
	import PowerControlBaseWidget from './PowerControlBaseWidget.svelte';
	import type { ShutdownWidgetConfig, WidgetComponentProps } from './types';

	type Props = WidgetComponentProps<ShutdownWidgetConfig>;

	let { config = {}, borderRadius = 12, isEditMode = false }: Props = $props();
</script>

<PowerControlBaseWidget
	{config}
	{borderRadius}
	{isEditMode}
	actionType="shutdown"
	defaultIcon="⏻"
/>
