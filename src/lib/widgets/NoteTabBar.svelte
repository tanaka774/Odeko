<script lang="ts">
	interface Tab {
		id: string;
		name: string;
		color: string;
	}

	interface Props {
		tabs: Tab[];
		activeId: string | undefined;
		canAdd: boolean;
		/** Extra class on each tab, the name custom CSS targets. */
		tabClass: string;
		onselect: (id: string) => void;
		onadd: () => void;
	}

	let { tabs, activeId, canAdd, tabClass, onselect, onadd }: Props = $props();

	let bar = $state<HTMLDivElement | null>(null);
	let canScrollLeft = $state(false);
	let canScrollRight = $state(false);
	let previousCount: number | null = null;

	$effect(() => {
		const el = bar;
		const count = tabs.length;
		if (!el) return;
		previousCount ??= count;
		const update = () => {
			canScrollLeft = el.scrollLeft > 2;
			canScrollRight = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
		};
		update();
		el.addEventListener('scroll', update);
		const observer = new ResizeObserver(update);
		observer.observe(el);
		if (count > previousCount) el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
		previousCount = count;
		return () => {
			el.removeEventListener('scroll', update);
			observer.disconnect();
		};
	});

	function scroll(direction: -1 | 1) {
		bar?.scrollBy({ left: direction * 120, behavior: 'smooth' });
	}
</script>

<div class="tab-bar-container">
	{#if canScrollLeft}
		<button
			type="button"
			class="tab-scroll-btn"
			onclick={() => scroll(-1)}
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

	<div class="tab-bar" bind:this={bar} role="tablist">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				class="note-tab {tabClass}"
				class:active={tab.id === activeId}
				role="tab"
				aria-selected={tab.id === activeId}
				style:--tab-color={tab.color}
				onclick={() => onselect(tab.id)}
				title={tab.name}
			>
				<span class="tab-name">{tab.name}</span>
			</button>
		{/each}
	</div>

	{#if canAdd}
		<button type="button" class="add-tab-btn" onclick={onadd} title="Add tab">
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
			onclick={() => scroll(1)}
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

<style>
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

	.note-tab {
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

	.note-tab:hover {
		background: color-mix(in srgb, var(--tab-color) 28%, rgba(255, 255, 255, 0.06));
		color: var(--widget-text-color-90);
	}

	.note-tab.active {
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
</style>
