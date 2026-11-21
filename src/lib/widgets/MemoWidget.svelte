<script lang="ts">
	import { flag } from './widget-state';
	import { getAppearanceBackground, getAppearanceBorder, getWidgetAppearance } from './appearance';
	import NoteTabBar from './NoteTabBar.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import {
		createMemoTab,
		normalizeMemoTabs,
		TASK_GROUP_COLORS,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type MemoTab,
		type MemoWidgetConfig,
		type WidgetComponentProps
	} from './types';

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

	const noteId = $derived(notesStore.effectiveId('memo', config.noteId));
	const note = $derived(notesStore.get('memo', noteId));
	const ready = $derived(!!note?.loaded);
	const tabs = $derived(normalizeMemoTabs(note?.data));
	const activeTab = $derived(tabs.find((tab) => tab.id === config.activeTabId) ?? tabs[0]);
	const content = $derived(ready ? (activeTab?.content ?? '') : '');

	$effect(() => {
		void notesStore.load('memo', noteId);
	});

	function writeTabs(next: MemoTab[]) {
		notesStore.setData('memo', noteId, { tabs: next });
	}

	function handleInput(event: Event) {
		const value = (event.target as HTMLTextAreaElement).value;
		writeTabs(tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, content: value } : tab)));
	}

	function selectTab(id: string) {
		if (id !== activeTab?.id) onConfigChange?.({ ...config, activeTabId: id });
	}

	function addTab() {
		const tab = createMemoTab('', TASK_GROUP_COLORS[tabs.length % TASK_GROUP_COLORS.length]);
		writeTabs([...tabs, tab]);
		onConfigChange?.({ ...config, activeTabId: tab.id });
	}
</script>

<div
	class="memo-widget"
	data-empty={flag(!content.trim())}
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
	{#if tabs.length > 1}
		<NoteTabBar
			{tabs}
			activeId={activeTab?.id}
			canAdd={!isEditMode}
			tabClass="memo-tab"
			onselect={selectTab}
			onadd={addTab}
		/>
	{/if}
	<textarea
		class="memo-content"
		value={content}
		readonly={!ready}
		oninput={handleInput}
		onblur={() => notesStore.flush('memo', noteId)}
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

	.memo-content:focus {
		outline: none;
	}
</style>
