<script lang="ts">
	import {
		colorWithOpacity,
		getAppearanceBackground,
		getAppearanceBorder,
		getWidgetAppearance
	} from './appearance';
	import {
		createTaskGroup,
		normalizeTaskGroups,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type TaskListWidgetConfig,
		type Task,
		type TaskGroup,
		type WidgetComponentProps
	} from './types';

	type Props = WidgetComponentProps<TaskListWidgetConfig>;

	let { config = {}, isEditMode = false, borderRadius = 12, onConfigChange }: Props = $props();

	// Config values with defaults
	const groups = $derived(normalizeTaskGroups(config));
	const activeGroupId = $derived(config.activeGroupId ?? groups[0]?.id);
	const activeGroup = $derived(
		groups.find((group: TaskGroup) => group.id === activeGroupId) ?? groups[0]
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

	// Local state
	let newTaskText = $state('');
	let inputRef = $state<HTMLInputElement | null>(null);
	let tabBarRef = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);

	// Track whether the tab bar overflows so the scroll buttons can appear
	let previousTabCount: number | null = null;

	$effect(() => {
		const bar = tabBarRef;
		const currentCount = groups.length;
		if (!bar) return;

		// Initialize on first run (the guard prevents scrolling on mount)
		if (previousTabCount === null) {
			previousTabCount = currentCount;
		}

		const update = () => {
			canScrollLeft = bar.scrollLeft > 2;
			canScrollRight = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2;
		};

		update();
		bar.addEventListener('scroll', update);
		const observer = new ResizeObserver(update);
		observer.observe(bar);

		// Scroll to the newest tab when one is added
		if (currentCount > previousTabCount) {
			bar.scrollTo({ left: bar.scrollWidth, behavior: 'smooth' });
		}
		previousTabCount = currentCount;

		return () => {
			bar.removeEventListener('scroll', update);
			observer.disconnect();
		};
	});

	// Scroll the tab bar by a fixed amount
	function scrollTabs(direction: -1 | 1) {
		tabBarRef?.scrollBy({ left: direction * 120, behavior: 'smooth' });
	}

	// Filter and separate tasks of the active tab
	const taskSections = $derived.by(() => {
		const now = Date.now();
		const disappearMs = autoDisappearHours * 60 * 60 * 1000;
		const activeTasks = activeGroup?.tasks ?? [];

		const uncompleted: Task[] = [];
		const completed: Task[] = [];

		activeTasks.forEach((task: Task) => {
			if (!task.completed) {
				uncompleted.push(task);
			} else {
				// Check auto-disappear for completed tasks
				if (!autoDisappearEnabled) {
					completed.push(task);
				} else if (task.completedAt) {
					const age = now - task.completedAt;
					if (age < disappearMs) {
						completed.push(task);
					}
				}
			}
		});

		return { uncompletedTasks: uncompleted, completedTasks: completed };
	});

	// Generate unique ID
	function generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	// Add new task to the active tab
	function addTask() {
		const text = newTaskText.trim();
		if (!text || !activeGroup) return;

		const newTask: Task = {
			id: generateId(),
			text,
			completed: false,
			createdAt: Date.now()
		};

		const updatedGroups = groups.map((group: TaskGroup) =>
			group.id === activeGroup.id ? { ...group, tasks: [...group.tasks, newTask] } : group
		);
		updateGroups(updatedGroups);
		newTaskText = '';
	}

	// Toggle task completion (active tab only)
	function toggleTask(taskId: string) {
		const updatedGroups = groups.map((group: TaskGroup) => {
			if (group.id === activeGroup?.id) {
				return {
					...group,
					tasks: group.tasks.map((task: Task) => {
						if (task.id === taskId) {
							return {
								...task,
								completed: !task.completed,
								completedAt: !task.completed ? Date.now() : undefined
							};
						}
						return task;
					})
				};
			}
			return group;
		});
		updateGroups(updatedGroups);
	}

	// Delete task (active tab only)
	function deleteTask(taskId: string) {
		const updatedGroups = groups.map((group: TaskGroup) => {
			if (group.id === activeGroup?.id) {
				return {
					...group,
					tasks: group.tasks.filter((task: Task) => task.id !== taskId)
				};
			}
			return group;
		});
		updateGroups(updatedGroups);
	}

	// Switch to a tab
	function selectGroup(groupId: string) {
		if (groupId === activeGroupId || !onConfigChange) return;
		onConfigChange({ ...config, activeGroupId: groupId });
	}

	// Add a new tab and switch to it
	function addGroup() {
		if (!onConfigChange) return;
		const newGroup = createTaskGroup();
		onConfigChange({
			...config,
			groups: [...groups, newGroup],
			activeGroupId: newGroup.id
		});
	}

	// Update config and persist
	function updateGroups(updatedGroups: TaskGroup[]) {
		if (onConfigChange) {
			onConfigChange({
				...config,
				groups: updatedGroups
			});
		}
	}

	// Handle Enter key in input
	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			addTask();
		}
	}
</script>

<div
	class="tasklist-widget"
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
	<div class="tab-bar-container">
		{#if canScrollLeft}
			<button
				type="button"
				class="tab-scroll-btn"
				onclick={() => scrollTabs(-1)}
				title="Scroll tabs left"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="15 18 9 12 15 6"></polyline>
				</svg>
			</button>
		{/if}

		<div class="tab-bar" bind:this={tabBarRef} role="tablist">
			{#each groups as group (group.id)}
				<button
					type="button"
					class="task-tab"
					class:active={group.id === activeGroupId}
					role="tab"
					aria-selected={group.id === activeGroupId}
					style:--tab-color={group.color}
					onclick={() => selectGroup(group.id)}
					title={group.name}
				>
					<span class="tab-name">{group.name}</span>
				</button>
			{/each}
		</div>

		{#if !isEditMode}
			<button type="button" class="add-tab-btn" onclick={addGroup} title="Add tab">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="12" y1="5" x2="12" y2="19"></line>
					<line x1="5" y1="12" x2="19" y2="12"></line>
				</svg>
			</button>
		{/if}

		{#if canScrollRight}
			<button
				type="button"
				class="tab-scroll-btn"
				onclick={() => scrollTabs(1)}
				title="Scroll tabs right"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="9 18 15 12 9 6"></polyline>
				</svg>
			</button>
		{/if}
	</div>

	<div class="task-input-container">
		<input
			bind:this={inputRef}
			class="task-input"
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

	.tab-bar-container {
		display: flex;
		align-items: stretch;
		gap: 4px;
		padding: 8px 8px 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.tab-bar {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
		scrollbar-width: none; /* Firefox */
	}

	.tab-bar::-webkit-scrollbar {
		display: none; /* WebKit: hide the overlay scrollbar so it never overlaps the tabs */
	}

	.tab-scroll-btn {
		width: 24px;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 6px;
		color: var(--widget-text-color-50);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.tab-scroll-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: var(--widget-text-color-90);
	}

	.task-tab {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 28px;
		padding: 0 10px;
		background: color-mix(in srgb, var(--tab-color) 20%, rgba(255, 255, 255, 0.04));
		border: none;
		border-radius: 8px 8px 0 0;
		color: var(--widget-text-color-50);
		font-size: 0.8125em;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.2s ease;
		flex-shrink: 0;
		min-width: 30px;
		max-width: 140px;
	}

	.task-tab:hover {
		background: color-mix(in srgb, var(--tab-color) 28%, rgba(255, 255, 255, 0.06));
		color: var(--widget-text-color-90);
	}

	.task-tab.active {
		background: color-mix(in srgb, var(--tab-color) 45%, rgba(255, 255, 255, 0.08));
		color: var(--widget-text-color-90);
		box-shadow: inset 0 -2px 0 var(--tab-color);
	}

	.tab-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.add-tab-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px dashed rgba(255, 255, 255, 0.3);
		border-radius: 8px 8px 0 0;
		color: var(--widget-text-color-50);
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
		margin-left: 2px;
	}

	.add-tab-btn:hover {
		border-color: var(--widget-text-color-90);
		color: var(--widget-text-color-90);
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
