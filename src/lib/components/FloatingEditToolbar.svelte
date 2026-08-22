<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		onSaveAndExit: () => void;
		onCancel: () => void;
		onUndo: () => void;
		onAddImageLink: () => void;
		onAddApp: () => void;
		onAddWidget: () => void;
		onOpenSettings: () => void;
		selectionCount: number;
		onDeleteSelected: () => void;
	}

	let {
		onSaveAndExit,
		onCancel,
		onUndo,
		onAddImageLink,
		onAddApp,
		onAddWidget,
		onOpenSettings,
		selectionCount = 0,
		onDeleteSelected
	}: Props = $props();

	let panelX = $state(0);
	let panelY = $state(0);
	let isDragging = $state(false);
	let dragOffsetX = $state(0);
	let dragOffsetY = $state(0);
	let panelEl: HTMLDivElement;

	onMount(() => {
		const container = panelEl.parentElement;
		if (container) {
			panelX = container.clientWidth - panelEl.offsetWidth - 16;
			panelY = 16;
		}
	});

	function handlePointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('button')) return;
		isDragging = true;
		const rect = panelEl.getBoundingClientRect();
		dragOffsetX = event.clientX - rect.left;
		dragOffsetY = event.clientY - rect.top;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isDragging) return;
		const container = panelEl.parentElement;
		if (!container) return;
		const containerRect = container.getBoundingClientRect();
		panelX = event.clientX - containerRect.left - dragOffsetX;
		panelY = event.clientY - containerRect.top - dragOffsetY;
	}

	function handlePointerUp(event: PointerEvent) {
		isDragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}
</script>

<svelte:window on:pointermove={handlePointerMove} on:pointerup={handlePointerUp} />

<div
	bind:this={panelEl}
	class="floating-toolbar"
	class:dragging={isDragging}
	role="toolbar"
	aria-label="Edit tools"
	onpointerdown={handlePointerDown}
	style="transform: translate({panelX}px, {panelY}px);"
>
	<div class="tb-titlebar"></div>
	{#if selectionCount > 0}
		<div class="tb-selection">
			<span>{selectionCount} selected</span>
			<button class="tb-delete" onclick={onDeleteSelected}>Delete</button>
		</div>
		<div class="tb-divider"></div>
	{/if}
	<button class="tb-item" onclick={onSaveAndExit}>Save & Exit</button>
	<button class="tb-item" onclick={onCancel}>Cancel</button>
	<button class="tb-item" onclick={onUndo}>Undo</button>
	<div class="tb-divider"></div>
	<button class="tb-item" onclick={onAddImageLink}>Add Image/Link</button>
	<button class="tb-item" onclick={onAddApp}>Add App</button>
	<button class="tb-item" onclick={onAddWidget}>Add Widget</button>
	<div class="tb-divider"></div>
	<button class="tb-item" onclick={onOpenSettings}>Settings</button>
</div>

<style>
	.floating-toolbar {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 500;
		background: rgba(20, 20, 30, 0.92);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		padding: 8px;
		min-width: 170px;
		user-select: none;
		cursor: grab;
		display: flex;
		flex-direction: column;
		gap: 2px;
		transition: box-shadow 0.2s ease;
	}

	.floating-toolbar.dragging {
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
		opacity: 0.95;
		cursor: grabbing;
	}

	.tb-titlebar {
		height: 6px;
		margin-bottom: 4px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.tb-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		font-size: 14px;
	}

	.tb-item:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.tb-selection {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 12px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 13px;
	}

	.tb-delete {
		padding: 4px 8px;
		background: var(--edit-danger-bg);
		border: 1px solid var(--edit-control-border);
		border-radius: 6px;
		color: var(--edit-control-fg);
		cursor: pointer;
		font-size: 12px;
		transition: all 0.2s ease;
	}

	.tb-delete:hover {
		background: var(--edit-danger-bg-hover);
	}

	.tb-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 2px 0;
	}
</style>
