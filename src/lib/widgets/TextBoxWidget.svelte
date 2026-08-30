<script lang="ts">
	import { getAppearanceBackground, getWidgetAppearance } from './appearance';
	import type { TextBoxWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';

	type Props = WidgetComponentProps<TextBoxWidgetConfig>;

	let { config = {}, isEditMode = false, onConfigChange }: Props = $props();

	// Default config values
	let content = $state(config.content ?? '');
	const fontSize = $derived(config.fontSize ?? 16);
	const fontFamily = $derived(config.fontFamily ?? 'system-ui');
	const textAlign = $derived(config.textAlign ?? 'left');
	const showBorderTop = $derived(config.showBorderTop ?? true);
	const showBorderRight = $derived(config.showBorderRight ?? true);
	const showBorderBottom = $derived(config.showBorderBottom ?? true);
	const showBorderLeft = $derived(config.showBorderLeft ?? true);
	const appearance = $derived(getWidgetAppearance(config, WIDGET_TYPE_APPEARANCE_DEFAULTS.textbox));
	const widgetBackground = $derived(getAppearanceBackground(appearance));

	// Auto-save content when it changes
	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		content = target.value;
		if (onConfigChange) {
			onConfigChange({
				...config,
				content: content
			});
		}
	}

	// Get border style for a specific edge
	function getBorderEdgeStyle(visible: boolean): string {
		if (!visible || appearance.borderStyle === 'none' || appearance.borderWidth === 0) {
			return 'none';
		}
		return `${appearance.borderWidth}px ${appearance.borderStyle} ${appearance.borderColor}`;
	}
</script>

<div
	class="textbox-widget"
	style="
			--font-size: {fontSize}px;
			--font-family: {fontFamily};
			--appearance-text-color: {appearance.textColor};
			--appearance-background: {widgetBackground};
			--text-align: {textAlign};
			--border-top: {getBorderEdgeStyle(showBorderTop)};
			--border-right: {getBorderEdgeStyle(showBorderRight)};
			--border-bottom: {getBorderEdgeStyle(showBorderBottom)};
			--border-left: {getBorderEdgeStyle(showBorderLeft)};
			--appearance-border-radius: {appearance.borderRadius}px;
			--appearance-padding: {appearance.padding}px;
			--appearance-opacity: {appearance.opacity};
		"
>
	<textarea
		class="textbox-content"
		value={content}
		oninput={handleInput}
		placeholder={isEditMode ? 'Type your text here...' : ''}
		readonly={!isEditMode}
		spellcheck="false"
	></textarea>
</div>

<style>
	.textbox-widget {
		width: 100%;
		height: 100%;
		background: var(--appearance-background);
		border-top: var(--border-top);
		border-right: var(--border-right);
		border-bottom: var(--border-bottom);
		border-left: var(--border-left);
		border-radius: var(--appearance-border-radius);
		padding: var(--appearance-padding);
		box-sizing: border-box;
		opacity: var(--appearance-opacity);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		position: relative;
	}

	.textbox-content {
		flex: 1;
		width: 100%;
		height: 100%;
		border: none;
		outline: none;
		resize: none;
		background: transparent;
		color: var(--appearance-text-color);
		font-size: var(--font-size);
		font-family: var(--font-family);
		text-align: var(--text-align);
		line-height: 1.5;
		padding: 0;
		margin: 0;
		overflow-y: auto;
		word-wrap: break-word;
		white-space: pre-wrap;
	}

	.textbox-content::placeholder {
		color: var(--appearance-text-color);
		opacity: 0.4;
	}

	.textbox-content:read-only {
		cursor: default;
	}

	.textbox-content:not(:read-only) {
		cursor: text;
	}

	.textbox-content:not(:read-only):focus {
		outline: none;
	}
</style>
