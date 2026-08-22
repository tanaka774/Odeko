<script lang="ts">
	interface TabItem {
		key: string;
		label: string;
	}

	interface Props {
		tabs: TabItem[];
		activeTab: string;
		onTabChange?: (key: string) => void;
	}

	let { tabs, activeTab, onTabChange = () => {} }: Props = $props();
</script>

<div class="tab-nav" role="tablist">
	{#each tabs as tab (tab.key)}
		<button
			type="button"
			class="tab-btn"
			class:active={activeTab === tab.key}
			onclick={() => onTabChange(tab.key)}
			role="tab"
			aria-selected={activeTab === tab.key}
		>
			{tab.label}
		</button>
	{/each}
</div>

<style>
	.tab-nav {
		display: flex;
		gap: 0;
		margin: -12px -16px 12px -16px;
		padding: 0 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		/* Stays pinned at the top of the scrolling modal body so the tabs
		   remain reachable no matter how far the content scrolls. */
		position: sticky;
		top: 0;
		z-index: 1;
		background: rgba(30, 30, 40, 0.98);
	}

	.tab-btn {
		padding: 12px 20px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
		margin-bottom: -1px;
	}

	.tab-btn:hover {
		color: rgba(255, 255, 255, 0.8);
	}

	.tab-btn.active {
		color: white;
		border-bottom-color: rgba(120, 160, 200, 0.8);
		background: rgba(255, 255, 255, 0.05);
	}
</style>
