<script lang="ts">
	import WidgetAppearanceSettings from './WidgetAppearanceSettings.svelte';
	import SettingsModalShell from './settings/SettingsModalShell.svelte';
	import TabBar from './settings/TabBar.svelte';
	import SettingSection from './settings/SettingSection.svelte';
	import SettingRow from './settings/SettingRow.svelte';
	import {
		createTaskGroup,
		normalizeTaskGroups,
		WIDGET_TYPE_APPEARANCE_DEFAULTS,
		type TaskListWidgetConfig
	} from '$lib/widgets/types';

	interface Props {
		isOpen?: boolean;
		config?: TaskListWidgetConfig;
		onSave: (config: TaskListWidgetConfig) => void;
	}

	let { isOpen = $bindable(false), config = {}, onSave }: Props = $props();

	let activeTab = $state('tabs');

	// Build a local config that always contains a normalized list of tabs
	function buildLocalConfig(cfg: TaskListWidgetConfig = {}): TaskListWidgetConfig {
		const merged = {
			autoDisappearEnabled: true,
			autoDisappearHours: 24,
			...cfg
		};
		return {
			autoDisappearEnabled: merged.autoDisappearEnabled,
			autoDisappearHours: merged.autoDisappearHours,
			appearance: merged.appearance,
			groups: normalizeTaskGroups(merged)
		};
	}

	let localConfig = $state<TaskListWidgetConfig>(buildLocalConfig(config));

	$effect(() => {
		if (isOpen) {
			localConfig = buildLocalConfig(config);
			activeTab = 'tabs';
		}
	});

	const defaultAppearance = WIDGET_TYPE_APPEARANCE_DEFAULTS.tasklist ?? {};

	const allTasks = $derived((localConfig.groups ?? []).flatMap((group) => group.tasks));

	function handleSave() {
		onSave(localConfig);
		isOpen = false;
	}

	function handleClose() {
		isOpen = false;
	}

	function handleAddGroup() {
		localConfig = {
			...localConfig,
			groups: [...(localConfig.groups ?? []), createTaskGroup()]
		};
	}

	function handleDeleteGroup(groupId: string) {
		const target = localConfig.groups?.find((group) => group.id === groupId);
		if (!target) return;

		const taskCount = target.tasks.length;
		const message =
			taskCount > 0
				? `Delete tab "${target.name}" and its ${taskCount} task(s)?`
				: `Delete tab "${target.name}"?`;
		if (!confirm(message)) return;

		localConfig = {
			...localConfig,
			groups: localConfig.groups?.filter((group) => group.id !== groupId) ?? []
		};
	}

	function handleClearCompleted() {
		localConfig = {
			...localConfig,
			groups:
				localConfig.groups?.map((group) => ({
					...group,
					tasks: group.tasks.filter((task) => !task.completed)
				})) ?? []
		};
	}

	function handleClearAll() {
		localConfig = {
			...localConfig,
			groups:
				localConfig.groups?.map((group) => ({
					...group,
					tasks: []
				})) ?? []
		};
	}
</script>

<SettingsModalShell
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
				{ key: 'tabs', label: 'Tabs' },
				{ key: 'settings', label: 'Settings' },
				{ key: 'appearance', label: 'Appearance' }
			]}
		/>

		{#if activeTab === 'tabs'}
			<SettingSection title="Tabs">
				{#each localConfig.groups ?? [] as group (group.id)}
					<div class="group-editor">
						<input
							type="color"
							class="group-color-input"
							bind:value={group.color}
							title="Tab color"
						/>
						<input type="text" class="group-name-input" bind:value={group.name} />
						<span class="group-task-count">{group.tasks.length} tasks</span>
						<button
							class="action-btn danger group-delete-btn"
							onclick={() => handleDeleteGroup(group.id)}
							title="Delete tab"
							type="button"
							disabled={(localConfig.groups?.length ?? 0) <= 1}
						>
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
								<path
									d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
								></path>
							</svg>
						</button>
					</div>
				{/each}
				<button class="action-btn secondary" onclick={handleAddGroup} type="button">
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
						<line x1="12" y1="5" x2="12" y2="19"></line>
						<line x1="5" y1="12" x2="19" y2="12"></line>
					</svg>
					Add Tab
				</button>
			</SettingSection>
		{:else if activeTab === 'settings'}
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
		gap: 12px;
	}

	.stat-item {
		background: rgba(255, 255, 255, 0.05);
		padding: 16px;
		border-radius: 8px;
		text-align: center;
	}

	.stat-value {
		display: block;
		color: white;
		font-size: 24px;
		font-weight: 700;
		margin-bottom: 4px;
	}

	.stat-label {
		display: block;
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
	}

	.group-editor {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		margin-bottom: 8px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}

	.group-color-input {
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: 6px;
		background: none;
		cursor: pointer;
		flex-shrink: 0;
	}

	.group-name-input {
		flex: 1;
		min-width: 0;
		padding: 8px 10px;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: white;
		font-size: 14px;
		outline: none;
	}

	.group-name-input:focus {
		border-color: rgba(120, 160, 200, 0.8);
	}

	.group-task-count {
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
		white-space: nowrap;
	}

	.group-delete-btn {
		width: 30px;
		height: 30px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.group-delete-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
</style>
