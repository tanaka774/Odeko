<script lang="ts">
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import type { MemoWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';

	type Props = WidgetComponentProps<MemoWidgetConfig>;

	let { config = {}, isEditMode = false, borderRadius = 12, onConfigChange }: Props = $props();

	const wordWrap = $derived(config.wordWrap ?? true);
	const appearance = $derived(
		getWidgetAppearance(config, {
			...WIDGET_TYPE_APPEARANCE_DEFAULTS.memo,
			borderRadius,
			padding: 12
		})
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));

	let currentContent = $state(config.content ?? '');
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		currentContent = config.content ?? '';
	});

	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		const newContent = target.value;
		currentContent = newContent;

		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}

		saveTimeout = setTimeout(() => {
			if (onConfigChange) {
				onConfigChange({
					...config,
					content: newContent
				});
			}
		}, 1000);
	}

	function handleBlur() {
		if (saveTimeout) {
			clearTimeout(saveTimeout);
		}
		if (onConfigChange) {
			onConfigChange({
				...config,
				content: currentContent
			});
		}
	}
</script>

<div
	class="memo-widget"
	style="
			--appearance-text-color: {appearance.textColor};
			--appearance-font-family: {appearance.fontFamily};
			--appearance-font-size: {appearance.fontSize}px;
			--appearance-background: {widgetBackground};
			--appearance-border: {widgetBorder};
			--appearance-border-radius: {appearance.borderRadius}px;
			--appearance-padding: {appearance.padding}px;
			--appearance-opacity: {appearance.opacity};
			--word-wrap: {wordWrap ? 'break-word' : 'normal'};
			--white-space: {wordWrap ? 'pre-wrap' : 'pre'};
		"
>
	<textarea
		class="memo-content"
		value={currentContent}
		oninput={handleInput}
		onblur={handleBlur}
		placeholder=""
		spellcheck="false"
	></textarea>
</div>

<style>
	.memo-widget {
		width: 100%;
		height: 100%;
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		opacity: var(--appearance-opacity);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
	}

	.memo-content {
		flex: 1;
		width: 100%;
		height: 100%;
		border: none;
		outline: none;
		resize: none;
		background: transparent;
		color: var(--appearance-text-color);
		font-size: 1em;
		font-family: inherit;
		line-height: 1.6;
		padding: var(--appearance-padding);
		margin: 0;
		overflow-y: auto;
		word-wrap: var(--word-wrap);
		white-space: var(--white-space);
	}

	.memo-content::placeholder {
		color: var(--appearance-text-color);
		opacity: 0.4;
	}

	.memo-content:focus {
		outline: none;
	}
</style>
