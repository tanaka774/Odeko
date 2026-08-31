<script lang="ts">
	import type { PowerControlWidgetConfig } from './types';
	import { convertFileSrc } from '@tauri-apps/api/core';
	import { isBrowserImageUrl } from '$lib/icon-image';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import { executePowerAction, type PowerActionType } from '$lib/power-control';

	interface Props {
		config?: PowerControlWidgetConfig;
		borderRadius?: number;
		isEditMode?: boolean;
		actionType: PowerActionType;
		defaultIcon: string;
	}

	let {
		config = {},
		borderRadius = 12,
		isEditMode = false,
		actionType,
		defaultIcon
	}: Props = $props();

	// Config values with defaults
	const requireConfirmation = $derived(config.requireConfirmation ?? true);
	const showLabel = $derived(config.showLabel ?? true);
	const buttonText = $derived(
		config.buttonText ??
			(actionType === 'sleep' ? 'Sleep' : actionType === 'restart' ? 'Restart' : 'Shutdown')
	);
	const iconType = $derived(config.iconType ?? 'default');
	const iconPath = $derived(config.iconPath ?? '');
	const appearance = $derived(
		getWidgetAppearance(config, {
			backgroundColor: 'rgba(0, 0, 0, 0.3)',
			backgroundOpacity: 0.3,
			borderRadius,
			padding: 16
		})
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));

	// Get icon URL (custom or default). Browser image URLs (http/https/asset/data)
	// are used as-is; local file paths are converted to asset protocol URLs.
	const iconUrl = $derived(
		iconType === 'custom' && iconPath
			? isBrowserImageUrl(iconPath)
				? iconPath
				: convertFileSrc(iconPath)
			: null
	);

	// Execute the power action
	async function executeAction() {
		// Don't trigger action in edit mode
		if (isEditMode) return;

		await executePowerAction(actionType, requireConfirmation);
	}
</script>

<button
	class="power-widget"
	class:edit-mode={isEditMode}
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
	onclick={executeAction}
	disabled={isEditMode}
>
	{#if iconUrl}
		<img src={iconUrl} alt="" class="custom-icon" />
	{:else}
		<span class="default-icon">{defaultIcon}</span>
	{/if}

	{#if showLabel}
		<span class="label">{buttonText}</span>
	{/if}
</button>

<style>
	.power-widget {
		width: 100%;
		height: 100%;
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
	}

	.power-widget:hover {
		transform: scale(1.05);
		background: rgba(0, 0, 0, 0.4);
	}

	.power-widget:active {
		transform: scale(0.98);
	}

	.power-widget.edit-mode {
		cursor: move;
		pointer-events: none;
	}

	.power-widget.edit-mode:hover {
		transform: none;
		background: var(--appearance-background);
	}

	.default-icon {
		font-size: 3rem;
		line-height: 1;
	}

	.custom-icon {
		width: 100%;
		flex: 1;
		min-height: 0;
		object-fit: contain;
		border-radius: 8px;
	}

	.label {
		color: inherit;
		font-size: 0.9em;
		font-weight: 500;
		text-align: center;
	}
</style>
