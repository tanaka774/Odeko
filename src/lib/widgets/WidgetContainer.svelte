<script lang="ts">
	import type { WidgetType, WidgetConfigType } from './types';
	import { WIDGET_COMPONENTS } from './registry';

	interface Props {
		widgetType: WidgetType;
		/** Stable instance id; exposed as `data-widget-id` so user custom CSS
		 *  can be scoped to exactly this widget. */
		id?: string;
		config?: WidgetConfigType;
		isEditMode?: boolean;
		borderRadius?: number;
		onConfigChange?: (config: WidgetConfigType) => void;
	}

	let {
		widgetType,
		id,
		config,
		isEditMode = false,
		borderRadius = 12,
		onConfigChange
	}: Props = $props();

	const component = $derived(WIDGET_COMPONENTS[widgetType]);
</script>

<div class="widget-container" data-widget-id={id}>
	{#if component}
		{@const Widget = component}
		<Widget {config} widgetId={id} {isEditMode} {borderRadius} {onConfigChange} />
	{:else}
		<div class="placeholder-widget" style="border-radius: {borderRadius}px;">
			<span class="placeholder-text">Unknown Widget</span>
		</div>
	{/if}
</div>

<style>
	.widget-container {
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.placeholder-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.3);
		color: rgba(255, 255, 255, 0.7);
		gap: 12px;
		padding: 16px;
		box-sizing: border-box;
	}

	.placeholder-text {
		font-size: 0.9rem;
		text-align: center;
		opacity: 0.8;
	}
</style>
