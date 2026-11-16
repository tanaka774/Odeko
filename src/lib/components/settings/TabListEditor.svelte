<script lang="ts" generics="T extends { id: string; name: string; color: string }">
	import SettingSection from './SettingSection.svelte';

	interface Props {
		tabs: T[];
		count: (tab: T) => string;
		create: () => T;
		confirmDelete: (tab: T) => boolean;
	}

	let { tabs = $bindable(), count, create, confirmDelete }: Props = $props();

	function remove(tab: T) {
		if (tabs.length <= 1 || !confirmDelete(tab)) return;
		tabs = tabs.filter((other) => other.id !== tab.id);
	}
</script>

<SettingSection title="Tabs">
	{#each tabs as tab (tab.id)}
		<div class="group-editor">
			<input type="color" class="group-color-input" bind:value={tab.color} title="Tab color" />
			<input type="text" class="group-name-input" bind:value={tab.name} />
			<span class="group-task-count">{count(tab)}</span>
			<button
				class="action-btn danger group-delete-btn"
				onclick={() => remove(tab)}
				title="Delete tab"
				type="button"
				disabled={tabs.length <= 1}
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
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
					></path>
				</svg>
			</button>
		</div>
	{/each}
	<button class="action-btn secondary" onclick={() => (tabs = [...tabs, create()])} type="button">
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

<style>
	.group-editor {
		display: flex;
		align-items: center;
		gap: calc(0.7143 * var(--modal-font-size));
		padding: calc(0.5714 * var(--modal-font-size)) calc(0.7143 * var(--modal-font-size));
		margin-bottom: calc(0.5714 * var(--modal-font-size));
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}

	.group-color-input {
		width: calc(2.2857 * var(--modal-font-size));
		height: calc(2.2857 * var(--modal-font-size));
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
		padding: calc(0.5714 * var(--modal-font-size)) calc(0.7143 * var(--modal-font-size));
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: white;
		font-size: calc(1 * var(--modal-font-size));
		outline: none;
	}

	.group-name-input:focus {
		border-color: rgba(120, 160, 200, 0.8);
	}

	.group-task-count {
		color: rgba(255, 255, 255, 0.5);
		font-size: calc(0.8571 * var(--modal-font-size));
		white-space: nowrap;
	}

	.group-delete-btn {
		width: calc(2.1429 * var(--modal-font-size));
		height: calc(2.1429 * var(--modal-font-size));
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
