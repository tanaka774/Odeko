<script lang="ts">
	import PowerControlBaseWidget from './PowerControlBaseWidget.svelte';
	import type { RestartWidgetConfig, WidgetComponentProps } from './types';

	type Props = WidgetComponentProps<RestartWidgetConfig>;

	let { config = {}, borderRadius = 12, isEditMode = false }: Props = $props();
</script>

<PowerControlBaseWidget
	{config}
	{borderRadius}
	{isEditMode}
	actionType="restart"
	defaultIcon="🔄"
/>
