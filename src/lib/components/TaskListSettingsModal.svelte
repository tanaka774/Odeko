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
		createTaskGroup,
		normalizeTaskGroups,
		TASK_GROUP_COLORS,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type TaskGroup,
		type TaskListWidgetConfig
	} from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: TaskListWidgetConfig;
		onSave: (config: TaskListWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('settings');
	let localConfig = $state<TaskListWidgetConfig>({});
	let choice = $state<NoteChoice>({ shared: true, selected: 'main', newName: '' });
	let groups = $state<TaskGroup[]>([]);
	let baseGroups: TaskGroup[] = [];
	const dirty = $derived(JSON.stringify(groups) !== JSON.stringify(baseGroups));

	function loadGroups(id: string) {
		baseGroups = structuredClone(
			$state.snapshot(normalizeTaskGroups(notesStore.get('tasks', id)?.data))
		);
		groups = structuredClone(baseGroups);
	}

	$effect(() => {
		if (isOpen) {
			localConfig = { autoDisappearEnabled: true, autoDisappearHours: 24, ...config };
			activeTab = 'settings';
			const current = notesStore.effectiveId('tasks', config.noteId);
			void Promise.all([notesStore.load('tasks', current), notesStore.refreshList('tasks')]).then(
				() => {
					choice = notesStore.initialChoice('tasks', config.noteId);
					loadGroups(notesStore.sourceId('tasks', config.noteId, choice));
				}
			);
		}
	});

	const defaultAppearance = WIDGET_TYPE_APPEARANCE_DEFAULTS.tasklist ?? {};

	const allTasks = $derived(groups.flatMap((group) => group.tasks));

	async function handleSave() {
		const noteId = await notesStore.applyChoice(
			'tasks',
			config.noteId,
			choice,
			{ groups: $state.snapshot(groups) },
			{ groups: baseGroups },
			'Tasks'
		);
		onSave({ ...localConfig, noteId });
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	function confirmDelete(group: TaskGroup): boolean {
		const taskCount = group.tasks.length;
		return confirm(
			taskCount > 0
				? `Delete tab "${group.name}" and its ${taskCount} task(s)?`
				: `Delete tab "${group.name}"?`
		);
	}

	function handleClearCompleted() {
		groups = groups.map((group) => ({
			...group,
			tasks: group.tasks.filter((task) => !task.completed)
		}));
	}

	function handleClearAll() {
		groups = groups.map((group) => ({ ...group, tasks: [] }));
	}
</script>

<SettingsModalShell
	modalKey="tasklist"
	bind:isOpen
	title="Task List Settings"
	onClose={handleClose}
	onSave={handleSave}
	tabKey={activeTab}
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

		{#if activeTab === 'tabs'}
			<TabListEditor
				bind:tabs={groups}
				count={(group) => `${group.tasks.length} tasks`}
				create={() =>
					createTaskGroup('', TASK_GROUP_COLORS[groups.length % TASK_GROUP_COLORS.length])}
				{confirmDelete}
			/>
		{:else if activeTab === 'settings'}
			<NoteSourceSection
				kind="tasks"
				noteId={config.noteId}
				bind:choice
				{dirty}
				onswitch={loadGroups}
			/>
			<SettingSection title="Auto-Disappear">
				<SettingRow>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={localConfig.autoDisappearEnabled} />
						<span>Enable auto-disappear for completed tasks</span>
					</label>
				</SettingRow>

				{#if localConfig.autoDisappearEnabled}
					<SettingRow label="Disappear after: {localConfig.autoDisappearHours} hours">
						<input
							type="range"
							class="range-input"
							min="1"
							max="168"
							step="1"
							bind:value={localConfig.autoDisappearHours}
						/>
						<div class="range-labels">
							<span>1h</span>
							<span>24h</span>
							<span>1 week</span>
						</div>
					</SettingRow>
				{/if}
			</SettingSection>

			<SettingSection title="Task Management">
				<SettingRow>
					<div class="action-buttons">
						<button class="action-btn secondary" onclick={handleClearCompleted} type="button">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polyline points="3 6 5 6 21 6"></polyline>
								<path
									d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
								></path>
								<line x1="10" y1="11" x2="10" y2="17"></line>
								<line x1="14" y1="11" x2="14" y2="17"></line>
							</svg>
							Clear Completed
						</button>
						<button class="action-btn danger" onclick={handleClearAll} type="button">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<polyline points="3 6 5 6 21 6"></polyline>
								<path
									d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
								></path>
							</svg>
							Clear All Tasks
						</button>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="Statistics">
				<div class="stats-grid">
					<div class="stat-item">
						<span class="stat-value">{allTasks.length}</span>
						<span class="stat-label">Total Tasks</span>
					</div>
					<div class="stat-item">
						<span class="stat-value">{allTasks.filter((t) => t.completed).length}</span>
						<span class="stat-label">Completed</span>
					</div>
					<div class="stat-item">
						<span class="stat-value">{allTasks.filter((t) => !t.completed).length}</span>
						<span class="stat-label">Pending</span>
					</div>
				</div>
			</SettingSection>
		{:else}
			<WidgetAppearanceSettings
				widgetType="tasklist"
				bind:appearance={localConfig.appearance}
				defaults={defaultAppearance}
			/>
		{/if}
	</div>
</SettingsModalShell>

<style>
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: calc(0.8571 * var(--modal-font-size));
	}

	.stat-item {
		background: rgba(255, 255, 255, 0.05);
		padding: calc(1.1429 * var(--modal-font-size));
		border-radius: 8px;
		text-align: center;
	}

	.stat-value {
		display: block;
		color: white;
		font-size: calc(1.7143 * var(--modal-font-size));
		font-weight: 700;
		margin-bottom: calc(0.2857 * var(--modal-font-size));
	}

	.stat-label {
		display: block;
		color: rgba(255, 255, 255, 0.5);
		font-size: calc(0.8571 * var(--modal-font-size));
	}
</style>
