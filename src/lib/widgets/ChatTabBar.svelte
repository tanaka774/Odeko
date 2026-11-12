<script lang="ts">
	import type { ChatTab } from './types';

	interface Props {
		tabs: ChatTab[];
		activeId: string;
		busyIds: Set<string>;
		disabled?: boolean;
		onselect: (id: string) => void;
		onadd: () => void;
		onedit: (id: string) => void;
	}

	let { tabs, activeId, busyIds, disabled = false, onselect, onadd, onedit }: Props = $props();

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
</script>

<div class="chat-tab-bar-container">
	{#if canScrollLeft}
		<button
			type="button"
			class="tab-scroll-btn"
			onclick={() => bar?.scrollBy({ left: -120, behavior: 'smooth' })}
			title="Scroll tabs left"
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg
			>
		</button>
	{/if}

	<div class="chat-tab-bar" bind:this={bar} role="tablist">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				class="chat-tab"
				class:active={tab.id === activeId}
				class:busy={busyIds.has(tab.id)}
				role="tab"
				aria-selected={tab.id === activeId}
				style:--tab-color={tab.color}
				onclick={() => onselect(tab.id)}
				ondblclick={() => onedit(tab.id)}
				oncontextmenu={(event) => {
					event.preventDefault();
					event.stopPropagation();
					onedit(tab.id);
				}}
				title={tab.name}
			>
				<span class="tab-name">{tab.name}</span>
			</button>
		{/each}
	</div>

	{#if !disabled}
		<button type="button" class="add-tab-btn" onclick={onadd} title="New chat">
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"
				></line></svg
			>
		</button>
	{/if}

	{#if canScrollRight}
		<button
			type="button"
			class="tab-scroll-btn"
			onclick={() => bar?.scrollBy({ left: 120, behavior: 'smooth' })}
			title="Scroll tabs right"
		>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg
			>
		</button>
	{/if}
</div>

<style>
	.chat-tab-bar-container {
		display: flex;
		align-items: stretch;
		gap: 4px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	.chat-tab-bar {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 4px;
		overflow-x: auto;
		scrollbar-width: none;
	}

	.chat-tab-bar::-webkit-scrollbar {
		display: none;
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
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
	}

	.tab-scroll-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		opacity: 1;
	}

	.chat-tab {
		display: flex;
		align-items: center;
		height: 24px;
		padding: 0 10px;
		background: color-mix(in srgb, var(--tab-color) 20%, rgba(255, 255, 255, 0.04));
		border: none;
		border-radius: 8px 8px 0 0;
		color: inherit;
		opacity: 0.6;
		font: inherit;
		font-size: 0.8125em;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		min-width: 30px;
		max-width: 140px;
		transition: background 0.2s ease;
	}

	.chat-tab:hover {
		background: color-mix(in srgb, var(--tab-color) 28%, rgba(255, 255, 255, 0.06));
		opacity: 0.9;
	}

	.chat-tab.active {
		background: color-mix(in srgb, var(--tab-color) 45%, rgba(255, 255, 255, 0.08));
		opacity: 0.95;
		box-shadow: inset 0 -2px 0 var(--tab-color);
	}

	.chat-tab.busy:not(.active) {
		animation: chat-tab-pulse 1.2s ease-in-out infinite;
	}

	@keyframes chat-tab-pulse {
		50% {
			opacity: 0.35;
		}
	}

	.tab-name {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.add-tab-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px dashed rgba(255, 255, 255, 0.3);
		border-radius: 8px 8px 0 0;
		color: inherit;
		opacity: 0.6;
		cursor: pointer;
		flex-shrink: 0;
	}

	.add-tab-btn:hover {
		border-color: currentColor;
		opacity: 1;
	}
</style>
