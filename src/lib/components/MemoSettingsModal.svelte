<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import NoteSourceSection from './settings/NoteSourceSection.svelte';
	import TabListEditor from './settings/TabListEditor.svelte';
	import { notesStore, type NoteChoice } from '$lib/stores/notes.svelte';
	import {
		createMemoTab,
		normalizeMemoTabs,
		TASK_GROUP_COLORS,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type MemoTab,
		type MemoWidgetConfig
	} from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: MemoWidgetConfig;
		onSave: (config: MemoWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');
	let localConfig = $state<MemoWidgetConfig>({ wordWrap: true });
	let choice = $state<NoteChoice>({ shared: true, selected: 'main' });
	let tabs = $state<MemoTab[]>([]);

	function loadTabs(id: string) {
		tabs = structuredClone($state.snapshot(normalizeMemoTabs(notesStore.get('memo', id)?.data)));
	}

	$effect(() => {
		if (isOpen) {
			localConfig = { wordWrap: true, ...config };
			activeTab = 'settings';
			const current = notesStore.effectiveId('memo', config.noteId);
			void notesStore.load('memo', current).then(() => {
				choice = notesStore.initialChoice('memo', config.noteId);
				loadTabs(notesStore.sourceId('memo', config.noteId, choice));
			});
		}
	});

	async function handleSave() {
		const noteId = await notesStore.applyChoice(
			'memo',
			config.noteId,
			choice,
			{ tabs: $state.snapshot(tabs) },
			'Memo'
		);
		onSave({ ...localConfig, noteId });
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	function confirmDelete(tab: MemoTab): boolean {
		return !tab.content.trim() || confirm(`Delete tab "${tab.name}" and its text?`);
	}
</script>

<SettingsModalShell
	modalKey="memo"
	bind:isOpen
	title="Memo Settings"
	onClose={handleClose}
	onSave={handleSave}
	tabKey={activeTab}
	height="auto"
>
	<div class="settings-form">
		<TabBar
			{activeTab}
			onTabChange={(key) => (activeTab = key)}
			tabs={[
				{ key: 'settings', label: 'Settings' },
				{ key: 'tabs', label: 'Tabs' },
				{ key: 'appearance', label: 'Appearance' }
			]}
		/>

		{#if activeTab === 'settings'}
			<NoteSourceSection kind="memo" noteId={config.noteId} bind:choice onswitch={loadTabs} />
			<SettingSection title="Text Appearance">
				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.wordWrap} />
						<span>Word Wrap</span>
					</label>
				</SettingRow>
			</SettingSection>
		{:else if activeTab === 'tabs'}
			<TabListEditor
				bind:tabs
				count={(tab) => `${tab.content.length} chars`}
				create={() => createMemoTab('', TASK_GROUP_COLORS[tabs.length % TASK_GROUP_COLORS.length])}
				{confirmDelete}
			/>
		{:else}
			<WidgetAppearanceSettings
				widgetType="memo"
				bind:appearance={localConfig.appearance}
				defaults={WIDGET_TYPE_APPEARANCE_DEFAULTS.memo ?? {}}
			/>
		{/if}
	</div>
</SettingsModalShell>
