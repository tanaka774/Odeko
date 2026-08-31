<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import { sanitizeCustomHtml } from './custom-html';
	import { bridge } from './network-bridge.svelte';
	import type { CustomWidgetConfig, WidgetComponentProps } from './types';

	type Props = WidgetComponentProps<CustomWidgetConfig>;

	let { config = {}, borderRadius = 12 }: Props = $props();

	const content = $derived(config.content ?? '');
	const appearance = $derived(getWidgetAppearance(config, { borderRadius }));
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));

	// Sanitized at render time; the raw text stays in the config for editing.
	// Only this sanitized string ever reaches the DOM.
	const sanitized = $derived(sanitizeCustomHtml(content));

	/**
	 * Anchors inside user HTML must never navigate the webview (that would
	 * replace the launcher with the linked page). Fragment links scroll inside
	 * the widget; absolute links open in the system browser via the existing
	 * `open_url` command.
	 */
	function handleContentClick(event: MouseEvent) {
		const anchor = (event.target as HTMLElement).closest('a');
		if (!anchor) return;

		const href = anchor.getAttribute('href') ?? '';
		if (href.startsWith('#')) return;

		event.preventDefault();
		if (/^(?:https?|mailto):/i.test(href)) {
			void invoke('open_url', { url: href });
		}
	}
</script>

<div
	class="custom-widget"
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
	onclick={handleContentClick}
>
	{#if content.trim()}
		<!-- `sanitized` is DOMPurify output; the raw user string never reaches the DOM -->
		<div class="html-content">{@html sanitized}</div>
	{:else}
		<span class="placeholder-text">Empty — add HTML in the widget settings</span>
	{/if}

	{#if bridge.pending}
		<div class="net-prompt" role="alertdialog" aria-label="Network access request">
			<p class="net-prompt-text">
				This widget wants to fetch data from <strong>{bridge.pending.host}</strong>
			</p>
			<div class="net-prompt-actions">
				<button class="net-prompt-allow" onclick={() => bridge.resolvePrompt(true)}>Allow</button>
				<button class="net-prompt-deny" onclick={() => bridge.resolvePrompt(false)}>Deny</button>
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
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
		line-height: 1.5;
	}

	.html-content {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		overflow: auto;
	}

	.placeholder-text {
		color: rgba(255, 255, 255, 0.45);
		font-size: 0.9em;
	}

	.net-prompt {
		position: absolute;
		inset: 8px;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 10px;
		padding: 12px;
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
		padding: 6px 10px;
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

	/* User HTML arrives via {@html}, so component styles cannot reach it with
	   scoped selectors — use :global() scoped under the widget root. Tailwind's
	   preflight resets headings and lists to plain text, so restore a minimal
	   document look here. */
	.html-content :global(h1) {
		font-size: 1.6em;
		font-weight: 600;
		margin: 0.6em 0 0.4em;
	}
	.html-content :global(h2) {
		font-size: 1.4em;
		font-weight: 600;
		margin: 0.6em 0 0.4em;
	}
	.html-content :global(h3) {
		font-size: 1.2em;
		font-weight: 600;
		margin: 0.6em 0 0.4em;
	}
	.html-content :global(h4),
	.html-content :global(h5),
	.html-content :global(h6) {
		font-size: 1em;
		font-weight: 600;
		margin: 0.6em 0 0.4em;
	}
	.html-content :global(p) {
		margin: 0.4em 0;
	}
	.html-content :global(ul),
	.html-content :global(ol) {
		margin: 0.4em 0;
		padding-left: 1.6em;
	}
	.html-content :global(ul) {
		list-style: disc;
	}
	.html-content :global(ol) {
		list-style: decimal;
	}
	.html-content :global(li) {
		margin: 0.15em 0;
	}
	.html-content :global(a) {
		color: #7cb3e8;
		text-decoration: underline;
	}
	.html-content :global(a:hover) {
		color: #a5cdf5;
	}
	.html-content :global(blockquote) {
		margin: 0.5em 0;
		padding: 0.2em 1em;
		border-left: 3px solid rgba(255, 255, 255, 0.25);
		color: rgba(255, 255, 255, 0.8);
	}
	.html-content :global(code) {
		font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
		font-size: 0.9em;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 4px;
		padding: 0.1em 0.3em;
	}
	.html-content :global(pre) {
		margin: 0.5em 0;
		padding: 0.6em;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 6px;
		overflow-x: auto;
	}
	.html-content :global(pre code) {
		background: none;
		padding: 0;
	}
	.html-content :global(hr) {
		border: none;
		border-top: 1px solid rgba(255, 255, 255, 0.2);
		margin: 0.6em 0;
	}
	.html-content :global(img) {
		max-width: 100%;
		height: auto;
	}
	.html-content :global(table) {
		border-collapse: collapse;
		width: 100%;
	}
	.html-content :global(th),
	.html-content :global(td) {
		border: 1px solid rgba(255, 255, 255, 0.15);
		padding: 0.3em 0.5em;
		text-align: left;
	}
	.html-content :global(iframe) {
		width: 100%;
		/* Fill the widget vertically instead of sitting at the srcdoc's natural
		   height — the timer/whatever inside grows with the widget. */
		min-height: 100%;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		background: white;
	}
</style>
