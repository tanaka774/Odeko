<script lang="ts">
	import { flag } from './widget-state';
	import { invoke } from '@tauri-apps/api/core';
	import DOMPurify from 'dompurify';
	import { marked } from 'marked';
	import { untrack } from 'svelte';
	import Send from '@lucide/svelte/icons/send';
	import Square from '@lucide/svelte/icons/square';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import X from '@lucide/svelte/icons/x';
	import { imagesFromClipboard, MAX_IMAGES, prepareImage, type ChatImage } from '$lib/ai/images';
	import { createChatSession, type ChatPart, type StoredChat } from '$lib/ai/chat.svelte';
	import { chatKey, deleteChat, loadChat, saveChat } from '$lib/ai/chat-store';
	import ChatTabBar from './ChatTabBar.svelte';
	import { aiSettingsStore } from '$lib/ai/settings.svelte';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import type { AiChatWidgetConfig, ChatTab, WidgetComponentProps } from './types';
	import {
		createChatTab,
		normalizeChatTabs,
		TASK_GROUP_COLORS,
		WIDGET_TYPE_APPEARANCE_DEFAULTS
	} from './types';

	type Props = WidgetComponentProps<AiChatWidgetConfig>;

	let {
		config = {},
		widgetId = '',
		isEditMode = false,
		borderRadius = 12,
		onConfigChange
	}: Props = $props();

	const appearance = $derived(
		getWidgetAppearance(config, { ...WIDGET_TYPE_APPEARANCE_DEFAULTS.aichat, borderRadius })
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));

	let latestConfig: AiChatWidgetConfig = untrack(() => config);
	$effect.pre(() => {
		latestConfig = config;
	});

	type Session = ReturnType<typeof createChatSession>;

	const tabs = $derived(normalizeChatTabs(config));
	const activeTabId = $derived(
		tabs.some((tab) => tab.id === config.activeTabId) ? config.activeTabId! : tabs[0].id
	);
	const sessions = new Map<string, Session>();
	let sessionsVersion = $state(0);

	function sessionFor(tabId: string): Session {
		const existing = sessions.get(tabId);
		if (existing) return existing;
		const created = createChatSession({
			profileId: () => latestConfig.profileId,
			instructions: () => latestConfig.instructions ?? '',
			onPersist: (chat) => {
				if (widgetId) saveChat(chatKey(widgetId, tabId), chat);
			}
		});
		sessions.set(tabId, created);
		queueMicrotask(() => sessionsVersion++);
		if (widgetId) void loadChat(chatKey(widgetId, tabId)).then((chat) => created.restore(chat));
		return created;
	}

	const session = $derived(sessionFor(activeTabId));
	const busyTabs = $derived.by(() => {
		void sessionsVersion;
		return new Set([...sessions].filter(([, s]) => s.busy).map(([id]) => id));
	});

	$effect(() => {
		const id = widgetId;
		if (!id) return;
		const legacy = untrack(() => (config as { chat?: StoredChat }).chat);
		if (!legacy) return;
		const first = untrack(() => normalizeChatTabs(config)[0].id);
		saveChat(chatKey(id, first), legacy);
		untrack(() => sessionFor(first)).restore(legacy);
		const rest: AiChatWidgetConfig & { chat?: StoredChat } = { ...untrack(() => config) };
		delete rest.chat;
		untrack(() => onConfigChange?.(rest));
	});

	function updateTabs(next: ChatTab[], activeId: string) {
		onConfigChange?.({ ...latestConfig, tabs: next, activeTabId: activeId });
	}

	function selectTab(id: string) {
		if (id !== activeTabId) updateTabs(tabs, id);
	}

	function addTab() {
		const color = TASK_GROUP_COLORS[tabs.length % TASK_GROUP_COLORS.length];
		const tab = createChatTab(color);
		updateTabs([...tabs, tab], tab.id);
	}

	let editingTabId = $state<string | null>(null);
	const editingTab = $derived(tabs.find((tab) => tab.id === editingTabId) ?? null);

	function editTab(patch: Partial<ChatTab>) {
		if (!editingTabId) return;
		updateTabs(
			tabs.map((tab) => (tab.id === editingTabId ? { ...tab, ...patch } : tab)),
			activeTabId
		);
	}

	function deleteTab(id: string) {
		editingTabId = null;
		sessions.get(id)?.dispose();
		sessions.delete(id);
		sessionsVersion++;
		if (widgetId) deleteChat(chatKey(widgetId, id));
		const remaining = tabs.filter((tab) => tab.id !== id);
		if (remaining.length === 0) {
			const fresh = createChatTab();
			updateTabs([fresh], fresh.id);
			return;
		}
		const index = tabs.findIndex((tab) => tab.id === id);
		const nextActive =
			id === activeTabId ? remaining[Math.min(index, remaining.length - 1)].id : activeTabId;
		updateTabs(remaining, nextActive);
	}

	void aiSettingsStore.load();
	const profile = $derived(aiSettingsStore.profile(config.profileId));

	let input = $state('');
	let attachments = $state<ChatImage[]>([]);
	let attachError = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);
	let log = $state<HTMLDivElement | null>(null);
	let stickToBottom = true;

	$effect(() => {
		void JSON.stringify(session.messages);
		void session.permission;
		if (log && stickToBottom) log.scrollTop = log.scrollHeight;
	});

	function handleScroll() {
		if (!log) return;
		stickToBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
	}

	const canSend = $derived(input.trim().length > 0 || attachments.length > 0);

	function submit() {
		const text = input;
		if (!canSend || session.busy) return;
		const images = attachments;
		input = '';
		attachments = [];
		attachError = '';
		stickToBottom = true;
		void session.send(text, images);
	}

	async function attach(files: Iterable<File>) {
		attachError = '';
		for (const file of files) {
			if (!file.type.startsWith('image/')) continue;
			if (attachments.length >= MAX_IMAGES) {
				attachError = `Up to ${MAX_IMAGES} images per message`;
				break;
			}
			try {
				attachments = [...attachments, await prepareImage(file)];
			} catch (error) {
				attachError = (error as Error).message;
			}
		}
	}

	function handlePaste(event: ClipboardEvent) {
		const files = imagesFromClipboard(event);
		if (files.length === 0) return;
		event.preventDefault();
		void attach(files);
	}

	function handleDrop(event: DragEvent) {
		const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
		if (files.length === 0) return;
		event.preventDefault();
		void attach(files);
	}

	function clearChat() {
		session.clear();
		if (widgetId) deleteChat(chatKey(widgetId, activeTabId));
	}

	function handleKeydown(event: KeyboardEvent) {
		event.stopPropagation();
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			submit();
		}
	}

	const USAGE_URL = 'https://chatgpt.com/settings/usage';

	function openUrl(url: string) {
		void invoke('open_url', { url });
	}

	function renderMarkdown(text: string): string {
		return DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }) as string);
	}

	function handleLogClick(event: MouseEvent) {
		const anchor = (event.target as HTMLElement).closest('a');
		if (!anchor) return;
		event.preventDefault();
		const href = anchor.getAttribute('href') ?? '';
		if (/^https?:/i.test(href)) void invoke('open_url', { url: href });
	}

	const TOOL_LABELS: Record<string, string> = {
		load_skill: 'Load skill',
		web_search: 'Search',
		fetch_page: 'Read page',
		get_config: 'Read config',
		patch_config: 'Change config',
		get_docs: 'Read docs',
		list_examples: 'List examples',
		check_shader: 'Check shader'
	};

	function toolLabel(part: Extract<ChatPart, { type: 'tool' }>): string {
		const base = TOOL_LABELS[part.name] ?? part.name;
		const input = part.input as
			| { path?: string; topic?: string; name?: string; query?: string; url?: string }
			| undefined;
		const detail = input?.path ?? input?.topic ?? input?.name ?? input?.query ?? input?.url;
		return detail ? `${base} ${detail}` : base;
	}
</script>

<div
	class="aichat-widget"
	data-busy={flag(busyTabs.size > 0)}
	class:editing={isEditMode}
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	<ChatTabBar
		{tabs}
		activeId={activeTabId}
		busyIds={busyTabs}
		disabled={isEditMode}
		onselect={selectTab}
		onadd={addTab}
		onedit={(id) => (editingTabId = editingTabId === id ? null : id)}
	/>
	{#if editingTab}
		<div class="chat-tab-editor">
			<input
				type="color"
				value={editingTab.color}
				oninput={(event) => editTab({ color: event.currentTarget.value })}
				title="Tab color"
			/>
			<input
				type="text"
				class="tab-name-input"
				value={editingTab.name}
				oninput={(event) => editTab({ name: event.currentTarget.value })}
				onkeydown={(event) => {
					event.stopPropagation();
					if (event.key === 'Enter' || event.key === 'Escape') editingTabId = null;
				}}
				aria-label="Tab name"
			/>
			<button title="Delete chat" onclick={() => editingTab && deleteTab(editingTab.id)}>
				<Trash2 size={13} />
			</button>
			<button title="Done" onclick={() => (editingTabId = null)}><X size={13} /></button>
		</div>
	{/if}
	<div class="chat-log" bind:this={log} onscroll={handleScroll} role="log">
		{#if session.messages.length === 0}
			<div class="chat-empty">
				{#if !aiSettingsStore.loaded}
					…
				{:else if profile}
					{profile.name} · {profile.model}
					{#if profile.kind === 'chatgpt'}
						<div>
							Using ChatGPT plan ·
							<button class="chat-link" onclick={() => openUrl(USAGE_URL)}>Manage usage</button>
						</div>
					{/if}
				{:else}
					Add an AI provider in this widget's settings to start.
				{/if}
			</div>
		{/if}
		{#each session.messages as message (message.id)}
			<div
				class="chat-message"
				class:chat-user={message.role === 'user'}
				class:chat-assistant={message.role === 'assistant'}
			>
				{#each message.parts as part, index (index)}
					{#if part.type === 'image'}
						<img class="chat-image" src={part.image.url} alt="" />
					{:else if part.type === 'text'}
						{#if message.role === 'user'}
							<div class="chat-text">{part.text}</div>
						{:else}
							<div class="chat-text markdown" role="presentation" onclick={handleLogClick}>
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- DOMPurify output -->
								{@html renderMarkdown(part.text)}
							</div>
						{/if}
					{:else if part.type === 'reasoning'}
						<details class="chat-reasoning">
							<summary>Thinking</summary>
							<div>{part.text}</div>
						</details>
					{:else if part.change}
						<div class="chat-change" class:reverted={part.change.reverted}>
							<span class="change-summary">{part.change.summary}</span>
							{#if part.change.note}
								<span class="change-state">{part.change.note}</span>
							{/if}
							{#if part.change.reverted}
								<span class="change-state">Reverted</span>
							{:else if session.canRevert(part.id)}
								<button
									class="chat-revert"
									title="Revert this change"
									onclick={() => void session.revert(part.id)}
								>
									<Undo2 size={13} />Revert
								</button>
							{/if}
						</div>
					{:else}
						<details class="chat-tool" class:error={part.status === 'error'}>
							<summary>
								<span class="tool-status {part.status}"></span>{toolLabel(part)}
							</summary>
							{#if part.output}<pre>{part.output}</pre>{/if}
						</details>
					{/if}
				{/each}
				{#if message.role === 'assistant' && message.parts.length === 0 && !message.error && session.busy}
					<div class="chat-pending">…</div>
				{/if}
				{#if message.error}
					<div class="chat-error">
						{message.error}
						{#if /subscription_sharing_usage_limit_exceeded|usage limit/i.test(message.error)}
							<button class="chat-link" onclick={() => openUrl(USAGE_URL)}>Manage usage</button>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		{#if session.permission}
			{@const request = session.permission}
			<div class="chat-permission">
				<div class="permission-title">{request.title}</div>
				<ul>
					{#each request.details as detail, index (index)}
						<li>{detail}</li>
					{/each}
				</ul>
				<div class="permission-actions">
					<button class="permission-allow" onclick={() => session.answerPermission('allow')}>
						{request.kind === 'config' ? 'Allow in this chat' : 'Allow'}
					</button>
					{#if request.kind === 'config'}
						<button onclick={() => session.answerPermission('always')}>Always allow</button>
					{/if}
					<button onclick={() => session.answerPermission('deny')}>Deny</button>
				</div>
			</div>
		{/if}
	</div>

	{#if attachments.length > 0 || attachError}
		<div class="chat-attachments">
			{#each attachments as image, index (index)}
				<div class="attachment">
					<img src={image.url} alt="" />
					<button
						title="Remove image"
						onclick={() => (attachments = attachments.filter((_, i) => i !== index))}
					>
						<X size={11} />
					</button>
				</div>
			{/each}
			{#if attachError}<span class="chat-error">{attachError}</span>{/if}
		</div>
	{/if}
	<div
		class="chat-input-row"
		role="group"
		ondragover={(event) => event.preventDefault()}
		ondrop={handleDrop}
	>
		<input
			bind:this={fileInput}
			type="file"
			accept="image/*"
			multiple
			hidden
			onchange={(event) => {
				void attach(event.currentTarget.files ?? []);
				event.currentTarget.value = '';
			}}
		/>
		<button class="chat-attach" title="Attach image" onclick={() => fileInput?.click()}>
			<ImagePlus size={15} />
		</button>
		<textarea
			class="chat-input"
			bind:value={input}
			onkeydown={handleKeydown}
			onpaste={handlePaste}
			rows="1"
			spellcheck="false"
			aria-label="Message"
		></textarea>
		{#if session.busy}
			<button class="chat-send" title="Stop" onclick={() => session.stop()}
				><Square size={15} /></button
			>
		{:else}
			<button class="chat-send" title="Send" disabled={!canSend} onclick={submit}>
				<Send size={15} />
			</button>
			{#if session.messages.length > 0}
				<button class="chat-clear" title="Clear conversation" onclick={clearChat}>
					<Trash2 size={15} />
				</button>
			{/if}
		{/if}
	</div>
</div>

<style>
	.aichat-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: 6px;
		box-sizing: border-box;
		padding: var(--appearance-padding);
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		opacity: var(--appearance-opacity);
		color: var(--appearance-text-color);
		font-family: var(--appearance-font-family);
		font-size: var(--appearance-font-size);
		overflow: hidden;
	}

	.aichat-widget.editing .chat-log,
	.aichat-widget.editing .chat-input-row {
		pointer-events: none;
	}

	.chat-tab-editor {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.chat-tab-editor input[type='color'] {
		width: 24px;
		height: 22px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
	}

	.tab-name-input {
		flex: 1;
		min-width: 0;
		padding: 2px 6px;
		border-radius: 6px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(0, 0, 0, 0.3);
		color: inherit;
		font: inherit;
		font-size: 0.85em;
		outline: none;
	}

	.chat-tab-editor button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		padding: 0;
		border: none;
		border-radius: 5px;
		background: rgba(255, 255, 255, 0.1);
		color: inherit;
		cursor: pointer;
	}

	.chat-tab-editor button:hover {
		background: rgba(255, 255, 255, 0.22);
	}

	.chat-log {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 8px;
		user-select: text;
	}

	.chat-empty {
		margin: auto;
		opacity: 0.55;
		font-size: 0.9em;
		text-align: center;
	}

	.chat-message {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.chat-user {
		align-items: flex-end;
	}

	.chat-user .chat-text {
		max-width: 85%;
		padding: 4px 8px;
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.12);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.chat-assistant .chat-text {
		line-height: 1.5;
		overflow-wrap: anywhere;
	}

	.markdown :global(p),
	.markdown :global(ul),
	.markdown :global(ol),
	.markdown :global(pre) {
		margin: 0 0 0.4em;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: 1.2em;
	}

	.markdown :global(code) {
		font-size: 0.9em;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
		padding: 0 3px;
	}

	.markdown :global(pre) {
		background: rgba(0, 0, 0, 0.35);
		border-radius: 6px;
		padding: 6px;
		overflow-x: auto;
	}

	.markdown :global(pre code) {
		background: none;
		padding: 0;
	}

	.markdown :global(a) {
		color: #8ec5ff;
	}

	.chat-reasoning,
	.chat-tool {
		font-size: 0.8em;
		opacity: 0.65;
	}

	.chat-reasoning > div,
	.chat-tool pre {
		margin: 2px 0 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 160px;
		overflow-y: auto;
		font-size: 0.95em;
	}

	.chat-tool summary,
	.chat-reasoning summary {
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.chat-tool.error {
		color: #fca5a5;
		opacity: 0.85;
	}

	.tool-status {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #4ade80;
		flex-shrink: 0;
	}

	.tool-status.running {
		background: #facc15;
		animation: aichat-pulse 1s ease-in-out infinite;
	}

	.tool-status.error {
		background: #f87171;
	}

	@keyframes aichat-pulse {
		50% {
			opacity: 0.3;
		}
	}

	.chat-change {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85em;
		padding: 3px 6px;
		border-radius: 6px;
		background: rgba(74, 222, 128, 0.12);
		border-left: 2px solid #4ade80;
	}

	.chat-change.reverted {
		background: rgba(255, 255, 255, 0.06);
		border-left-color: rgba(255, 255, 255, 0.3);
	}

	.chat-change.reverted .change-summary {
		text-decoration: line-through;
		opacity: 0.6;
	}

	.change-summary {
		flex: 1;
		min-width: 0;
	}

	.change-state {
		opacity: 0.6;
	}

	.chat-revert {
		display: flex;
		align-items: center;
		gap: 3px;
		border: none;
		border-radius: 4px;
		padding: 1px 5px;
		background: rgba(255, 255, 255, 0.12);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.chat-revert:hover {
		background: rgba(255, 255, 255, 0.22);
	}

	.chat-pending {
		opacity: 0.5;
		animation: aichat-pulse 1s ease-in-out infinite;
	}

	.chat-link {
		border: none;
		background: none;
		padding: 0;
		color: #8ec5ff;
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}

	.chat-error {
		font-size: 0.85em;
		color: #fca5a5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.chat-permission {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 8px;
		border-radius: 8px;
		background: rgba(250, 204, 21, 0.12);
		border-left: 2px solid #facc15;
		font-size: 0.88em;
	}

	.permission-title {
		font-weight: 600;
	}

	.chat-permission ul {
		margin: 0;
		padding-left: 1.1em;
		opacity: 0.85;
	}

	.permission-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.permission-actions button {
		border: none;
		border-radius: 5px;
		padding: 2px 8px;
		background: rgba(255, 255, 255, 0.14);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.permission-actions button:hover {
		background: rgba(255, 255, 255, 0.24);
	}

	.permission-actions .permission-allow {
		background: rgba(250, 204, 21, 0.35);
	}

	.chat-input-row {
		display: flex;
		align-items: flex-end;
		gap: 4px;
	}

	.chat-input {
		flex: 1;
		min-width: 0;
		resize: none;
		field-sizing: content;
		max-height: 8em;
		padding: 5px 7px;
		border-radius: 8px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(0, 0, 0, 0.3);
		color: inherit;
		font: inherit;
		outline: none;
	}

	.chat-input:focus {
		border-color: rgba(255, 255, 255, 0.4);
	}

	.chat-image {
		max-width: 85%;
		max-height: 180px;
		border-radius: 8px;
		object-fit: contain;
	}

	.chat-attachments {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px;
	}

	.attachment {
		position: relative;
	}

	.attachment img {
		width: 44px;
		height: 44px;
		object-fit: cover;
		border-radius: 6px;
		display: block;
	}

	.attachment button {
		position: absolute;
		top: -4px;
		right: -4px;
		width: 16px;
		height: 16px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		cursor: pointer;
	}

	.chat-send,
	.chat-attach,
	.chat-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		flex-shrink: 0;
		border: none;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.14);
		color: inherit;
		cursor: pointer;
	}

	.chat-clear,
	.chat-attach {
		background: transparent;
		opacity: 0.6;
	}

	.chat-send:hover:not(:disabled),
	.chat-attach:hover,
	.chat-clear:hover {
		background: rgba(255, 255, 255, 0.24);
		opacity: 1;
	}

	.chat-send:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
