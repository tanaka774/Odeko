<script lang="ts">
	import { flag } from './widget-state';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import HtmlPage from '$lib/components/HtmlPage.svelte';
	import { bridge, newPageToken } from '$lib/page-bridge.svelte';
	import { watchTextFile } from '$lib/file-watch';
	import type { CustomWidgetConfig, WidgetComponentProps } from './types';

	type Props = WidgetComponentProps<CustomWidgetConfig>;

	let { config = {}, widgetId, isEditMode = false, borderRadius = 12 }: Props = $props();

	const appearance = $derived(getWidgetAppearance(config, { borderRadius }));
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const scripts = $derived(config.scripts ?? true);
	const linkedFile = $derived(config.watch ? (config.file ?? null) : null);

	let watchedSource = $state<string | null>(null);
	let fileError = $state('');

	$effect(() => {
		const path = linkedFile;
		watchedSource = null;
		fileError = '';
		if (!path) return;
		return watchTextFile(
			path,
			(content) => {
				fileError = '';
				watchedSource = content;
			},
			(error) => (fileError = String(error))
		);
	});

	const source = $derived(watchedSource ?? config.content ?? '');
	// A new token per source, so a reload never answers the old page's requests.
	const token = $derived.by(() => {
		void source;
		void scripts;
		return newPageToken();
	});
	const request = $derived(bridge.pendingFor(token));
</script>

<div
	class="custom-widget"
	data-scripts={flag(scripts)}
	data-linked={flag(Boolean(linkedFile))}
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	{#key token}
		<HtmlPage
			class="html-frame"
			title="Custom HTML widget"
			kind="widget"
			{widgetId}
			{token}
			{source}
			{scripts}
		/>
	{/key}

	{#if isEditMode}
		<div class="edit-cover"></div>
	{/if}

	{#if fileError}
		<p class="file-error">{fileError}</p>
	{/if}

	{#if request}
		<div class="net-prompt" role="alertdialog" aria-label="Network access request">
			<p class="net-prompt-text">
				This widget wants to fetch data from <strong>{request.host}</strong>
			</p>
			<div class="net-prompt-actions">
				<button class="net-prompt-allow" onclick={() => bridge.resolvePrompt(request, true)}
					>Allow</button
				>
				<button class="net-prompt-deny" onclick={() => bridge.resolvePrompt(request, false)}
					>Deny</button
				>
			</div>
		</div>
	{/if}
</div>

<style>
	.custom-widget {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
	}

	.custom-widget :global(.html-frame) {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: transparent;
		color-scheme: normal;
	}

	.edit-cover {
		position: absolute;
		inset: 0;
	}

	.file-error {
		position: absolute;
		left: 4px;
		right: 4px;
		bottom: 4px;
		margin: 0;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(127, 29, 29, 0.9);
		color: #fff;
		font-size: 12px;
	}

	.net-prompt {
		position: absolute;
		inset: 4px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 8px;
		padding: 8px;
		background: rgba(20, 20, 30, 0.96);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		font-size: 0.85em;
	}

	.net-prompt-text {
		margin: 0;
		word-break: break-all;
	}

	.net-prompt-actions {
		display: flex;
		gap: 8px;
	}

	.net-prompt-actions button {
		flex: 1;
		padding: 4px 8px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
	}

	.net-prompt-allow {
		background: #2f7d5c;
		color: white;
	}

	.net-prompt-deny {
		background: rgba(255, 255, 255, 0.12);
		color: white;
	}
</style>
