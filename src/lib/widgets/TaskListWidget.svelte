<script lang="ts">
	import { flag, ratio } from './widget-state';
	import {
		colorWithOpacity,
		getAppearanceBackground,
		getAppearanceBorder,
		getWidgetAppearance
	} from './appearance';
	import NoteTabBar from './NoteTabBar.svelte';
	import { notesStore } from '$lib/stores/notes.svelte';
	import {
		createTaskGroup,
		normalizeTaskGroups,
		TASK_GROUP_COLORS,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type TaskListWidgetConfig,
		type Task,
		type TaskGroup,
		type WidgetComponentProps
	} from './types';

	type Props = WidgetComponentProps<TaskListWidgetConfig>;

	let { config = {}, isEditMode = false, borderRadius = 12, onConfigChange }: Props = $props();

	const noteId = $derived(notesStore.effectiveId('tasks', config.noteId));
	const note = $derived(notesStore.get('tasks', noteId));
	const ready = $derived(!!note?.loaded);
	const groups = $derived(normalizeTaskGroups(note?.data));
	const activeGroup = $derived(
		groups.find((group: TaskGroup) => group.id === config.activeGroupId) ?? groups[0]
	);
	const autoDisappearEnabled = $derived(config.autoDisappearEnabled ?? true);
	const autoDisappearHours = $derived(config.autoDisappearHours ?? 24);
	const appearance = $derived(
		getWidgetAppearance(config, { ...WIDGET_TYPE_APPEARANCE_DEFAULTS.tasklist, borderRadius })
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const textColor90 = $derived(colorWithOpacity(appearance.textColor, 0.9));
	const textColor50 = $derived(colorWithOpacity(appearance.textColor, 0.5));
	const textColor40 = $derived(colorWithOpacity(appearance.textColor, 0.4));

	let newTaskText = $state('');

	$effect(() => {
		void notesStore.load('tasks', noteId);
	});

	const taskSections = $derived.by(() => {
		const now = Date.now();
		const disappearMs = autoDisappearHours * 60 * 60 * 1000;
		const uncompleted: Task[] = [];
		const completed: Task[] = [];
		for (const task of ready ? (activeGroup?.tasks ?? []) : []) {
			if (!task.completed) uncompleted.push(task);
			else if (!autoDisappearEnabled) completed.push(task);
			else if (task.completedAt && now - task.completedAt < disappearMs) completed.push(task);
		}
		return { uncompletedTasks: uncompleted, completedTasks: completed };
	});

	const taskCount = $derived(
		taskSections.uncompletedTasks.length + taskSections.completedTasks.length
	);

	function generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
	}

	function writeGroups(next: TaskGroup[]) {
		notesStore.setData('tasks', noteId, { groups: next });
	}

	function updateActiveTasks(update: (tasks: Task[]) => Task[]) {
		if (!ready || !activeGroup) return;
		writeGroups(
			groups.map((group) =>
				group.id === activeGroup.id ? { ...group, tasks: update(group.tasks) } : group
			)
		);
	}

	function addTask() {
		const text = newTaskText.trim();
		if (!text) return;
		updateActiveTasks((tasks) => [
			...tasks,
			{ id: generateId(), text, completed: false, createdAt: Date.now() }
		]);
		newTaskText = '';
	}

	function toggleTask(taskId: string) {
		updateActiveTasks((tasks) =>
			tasks.map((task) =>
				task.id === taskId
					? {
							...task,
							completed: !task.completed,
							completedAt: !task.completed ? Date.now() : undefined
						}
					: task
			)
		);
	}

	function deleteTask(taskId: string) {
		updateActiveTasks((tasks) => tasks.filter((task) => task.id !== taskId));
	}

	function selectGroup(groupId: string) {
		if (groupId !== activeGroup?.id) onConfigChange?.({ ...config, activeGroupId: groupId });
	}

	function addGroup() {
		if (!ready) return;
		const group = createTaskGroup('', TASK_GROUP_COLORS[groups.length % TASK_GROUP_COLORS.length]);
		writeGroups([...groups, group]);
		onConfigChange?.({ ...config, activeGroupId: group.id });
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') addTask();
	}
</script>

<div
	class="tasklist-widget"
	data-empty={flag(taskCount === 0)}
	data-all-done={flag(taskCount > 0 && taskSections.uncompletedTasks.length === 0)}
	data-remaining={taskSections.uncompletedTasks.length}
	style:--done-ratio={ratio(taskSections.completedTasks.length, taskCount)}
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--widget-text-color-90={textColor90}
	style:--widget-text-color-50={textColor50}
	style:--widget-text-color-40={textColor40}
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	<NoteTabBar
		tabs={groups}
		activeId={activeGroup?.id}
		canAdd={!isEditMode}
		tabClass="task-tab"
		onselect={selectGroup}
		onadd={addGroup}
	/>

	<div class="task-input-container">
		<input
			class="task-input"
			disabled={!ready}
			type="text"
			bind:value={newTaskText}
			onkeydown={handleKeyDown}
		/>
	</div>

	{#snippet taskItem(task: Task)}
		<div class="task-item" class:completed={task.completed}>
			<label class="task-checkbox-label">
				<input
					type="checkbox"
					class="task-checkbox"
					checked={task.completed}
					onchange={() => toggleTask(task.id)}
				/>
				<span class="checkbox-custom"></span>
				<span class="task-text">{task.text}</span>
			</label>
			{#if !isEditMode}
				<button class="delete-btn" onclick={() => deleteTask(task.id)} title="Delete task">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="3 6 5 6 21 6"></polyline>
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
						></path>
					</svg>
				</button>
			{/if}
		</div>
	{/snippet}

	<div class="task-list">
		{#if taskSections.uncompletedTasks.length > 0}
			<div class="task-section">
				{#each taskSections.uncompletedTasks as task (task.id)}
					{@render taskItem(task)}
				{/each}
			</div>
		{/if}

		<!-- Completed Tasks Section -->
		{#if taskSections.completedTasks.length > 0}
			<div class="task-section completed-section">
				{#each taskSections.completedTasks as task (task.id)}
					{@render taskItem(task)}
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.tasklist-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		box-sizing: border-box;
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
	}

	.task-input-container {
		display: flex;
		gap: 8px;
		padding: 8px 10px;
	}

	.task-input {
		flex: 1;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		color: inherit;
		font-size: 0.875em;
		outline: none;
		transition: border-color 0.2s ease;
	}

	.task-input:focus {
		border-color: rgba(200, 100, 255, 0.6);
	}

	.task-input::placeholder {
		color: var(--widget-text-color-40);
	}

	.task-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.task-section {
		margin-bottom: 8px;
	}

	.completed-section {
		margin-top: 12px;
		padding-top: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.task-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px;
		margin-bottom: 4px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		transition: all 0.2s ease;
	}

	.task-item:last-child {
		margin-bottom: 0;
	}

	.task-item:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	.task-item.completed {
		opacity: 0.5;
	}

	.task-item.completed .task-text {
		text-decoration: line-through;
		color: var(--widget-text-color-50);
	}

	.task-checkbox-label {
		display: flex;
		align-items: center;
		gap: 10px;
		flex: 1;
		cursor: pointer;
	}

	.task-checkbox {
		display: none;
	}

	.checkbox-custom {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.task-checkbox:checked + .checkbox-custom {
		background: rgba(100, 200, 100, 0.6);
		border-color: rgba(100, 200, 100, 0.8);
	}

	.task-checkbox:checked + .checkbox-custom::after {
		content: '✓';
		color: white;
		font-size: 12px;
		font-weight: bold;
	}

	.task-text {
		font-size: 0.875em;
		color: var(--widget-text-color-90);
		word-break: break-word;
		line-height: 1.4;
	}

	.delete-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--edit-danger-bg);
		border: none;
		border-radius: 4px;
		color: var(--edit-control-fg);
		cursor: pointer;
		transition: all 0.2s ease;
		opacity: 0;
		flex-shrink: 0;
	}

	.task-item:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: var(--edit-danger-bg-hover);
		color: var(--edit-control-fg);
	}

	/* Scrollbar styling */
	.task-list::-webkit-scrollbar {
		width: 6px;
	}

	.task-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.task-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.task-list::-webkit-scrollbar-thumb:hover {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
