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
		margin: -calc(0.8571 * var(--modal-font-size)) -calc(1.1429 * var(--modal-font-size))
			calc(0.8571 * var(--modal-font-size)) -calc(1.1429 * var(--modal-font-size));
		padding: 0 calc(1.1429 * var(--modal-font-size));
		border-bottom: 1px solid var(--modal-divider, rgba(255, 255, 255, 0.1));
		/* Stays pinned at the top of the scrolling modal body so the tabs
		   remain reachable no matter how far the content scrolls. The blur
		   keeps content scrolling underneath from smearing when the modal
		   background is translucent. */
		position: sticky;
		top: 0;
		z-index: 1;
		background: var(--modal-surface-bg, rgba(30, 30, 40, 0.98));
		backdrop-filter: blur(var(--modal-surface-blur, 20px));
	}

	.tab-btn {
		padding: calc(0.6429 * var(--modal-font-size)) calc(0.8571 * var(--modal-font-size));
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--modal-muted, rgba(255, 255, 255, 0.5));
		font-size: calc(1.0714 * var(--modal-font-size));
		cursor: pointer;
		transition: all 0.2s ease;
		margin-bottom: -calc(0.0714 * var(--modal-font-size));
	}

	.tab-btn:hover {
		color: var(--modal-text, rgba(255, 255, 255, 0.8));
	}

	.tab-btn.active {
		color: var(--modal-title-color, white);
		border-bottom-color: var(--modal-accent, rgba(120, 160, 200, 0.8));
		background: rgba(255, 255, 255, 0.05);
		background: color-mix(in srgb, var(--modal-accent, #78a0c8) 16%, transparent);
	}
</style>
