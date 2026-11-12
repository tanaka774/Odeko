<script lang="ts">
	import { getAppearanceBackground, getWidgetAppearance } from './appearance';
	import type { DividerWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';

	type Props = WidgetComponentProps<DividerWidgetConfig>;

	let { config = {} }: Props = $props();

	const appearance = $derived(getWidgetAppearance(config, WIDGET_TYPE_APPEARANCE_DEFAULTS.divider));
	const background = $derived(getAppearanceBackground(appearance));
	const vertical = $derived(config.orientation === 'vertical');
	const lineStyle = $derived(config.lineStyle ?? 'solid');
	const thickness = $derived(Math.max(1, config.thickness ?? 1));
	const color = $derived(config.color || '#ffffff');
	const label = $derived(config.label?.trim() ?? '');
</script>

<div
	class="divider-widget"
	class:vertical
	class:fade={lineStyle === 'fade'}
	style:--appearance-background={background}
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
	style:--divider-color={color}
	style:--divider-thickness="{lineStyle === 'double' ? Math.max(3, thickness) : thickness}px"
	style:--divider-style={lineStyle === 'fade' ? 'solid' : lineStyle}
>
	<span class="divider-line start"></span>
	{#if label}
		<span class="divider-label">{label}</span>
		<span class="divider-line end"></span>
	{/if}
</div>

<style>
	.divider-widget {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 0.6em;
		background: var(--appearance-background);
		border-radius: var(--appearance-border-radius);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
		color: var(--appearance-text-color);
		font-family: var(--appearance-font-family);
		font-size: var(--appearance-font-size);
	}

	.divider-widget.vertical {
		flex-direction: column;
	}

	.divider-line {
		flex: 1;
		min-width: 0;
		min-height: 0;
		border-top: var(--divider-thickness) var(--divider-style) var(--divider-color);
	}

	.vertical .divider-line {
		border-top: none;
		border-left: var(--divider-thickness) var(--divider-style) var(--divider-color);
	}

	.fade .divider-line {
		border: none;
		height: var(--divider-thickness);
		background: linear-gradient(to right, transparent, var(--divider-color), transparent);
	}

	.fade .divider-line.start:not(:last-child) {
		background: linear-gradient(to right, transparent, var(--divider-color));
	}

	.fade .divider-line.end {
		background: linear-gradient(to right, var(--divider-color), transparent);
	}

	.vertical.fade .divider-line {
		height: auto;
		width: var(--divider-thickness);
		background: linear-gradient(to bottom, transparent, var(--divider-color), transparent);
	}

	.vertical.fade .divider-line.start:not(:last-child) {
		background: linear-gradient(to bottom, transparent, var(--divider-color));
	}

	.vertical.fade .divider-line.end {
		background: linear-gradient(to bottom, var(--divider-color), transparent);
	}

	.divider-label {
		flex-shrink: 0;
		white-space: nowrap;
		line-height: 1;
	}
</style>
