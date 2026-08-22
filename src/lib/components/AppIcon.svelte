<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import Link from '@lucide/svelte/icons/link';
	import Package from '@lucide/svelte/icons/package';
	import Rocket from '@lucide/svelte/icons/rocket';
	import Settings from '@lucide/svelte/icons/settings';

	import type { LauncherIcon } from '$lib/icons';
	import { settingsStore, keybindToString } from '$lib/stores/settings.svelte';
	import { loadIconDataUrl } from '$lib/icon-image';
	import { launchIcon } from '$lib/launch';
	import {
		computeResizeRect,
		getResizeDirAtPoint,
		RESIZE_CURSORS,
		type ResizeDir
	} from '$lib/resize';

	let {
		icon,
		isEditMode,
		snapToGrid = true,
		gridSize = 40,
		selected = false,
		multiDragActive = false,
		onDragStart,
		onPositionChange,
		onSizeChange,
		onIconChange,
		onTypeChange,
		onOpenSettings,
		onOpenSettingsFromViewMode,
		onEnterEditMode,
		onSelect,
		onStartGroupDrag,
		onBringToFront = () => {},
		onSendToBack = () => {},
		onRemove = () => {},
		onDraggingChange = () => {}
	} = $props<{
		icon: LauncherIcon;
		isEditMode: boolean;
		snapToGrid?: boolean;
		gridSize?: number;
		selected?: boolean;
		multiDragActive?: boolean;
		onDragStart: () => void;
		onPositionChange: (id: string, x: number, y: number) => void;
		onSizeChange: (id: string, width: number, height: number) => void;
		onIconChange: (id: string, iconPath: string) => void;
		onTypeChange: (id: string, type: 'app' | 'image' | 'link', url?: string) => void;
		onOpenSettings: () => void;
		onOpenSettingsFromViewMode: () => void;
		onEnterEditMode: () => void;
		onSelect: (id: string, additive: boolean) => void;
		onStartGroupDrag: (id: string, clientX: number, clientY: number) => void;
		onBringToFront: (id: string) => void;
		onSendToBack: (id: string) => void;
		onRemove: (id: string) => void;
		onDraggingChange: (id: string, interacting: boolean) => void;
	}>();

	let isDragging = $state(false);
	let isResizing = $state(false);
	let resizeDir = $state<ResizeDir | null>(null);
	let dragOffsetX = $state(0);
	let dragOffsetY = $state(0);
	let resizeStartX = $state(0);
	let resizeStartY = $state(0);
	let resizeStartRect = $state({ x: 0, y: 0, width: 0, height: 0 });
	let hoverResizeDir = $state<ResizeDir | null>(null);
	let imageDataUrl = $state<string | undefined>(undefined);
	let showContextMenu = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);

	let hasClickAction = $derived(
		icon.icon_type === 'app' ||
			(icon.icon_type === 'link' && icon.url) ||
			(icon.icon_type === 'image' && icon.url)
	);

	let cursor = $derived(
		isEditMode ? (hoverResizeDir ? RESIZE_CURSORS[hoverResizeDir] : 'move') : undefined
	);

	// Per-icon override wins; otherwise follow the launcher-wide setting.
	let bgColor = $derived(icon.background_color ?? settingsStore.settings.icon_background_color);
	let bgOpacity = $derived(
		icon.background_opacity ?? settingsStore.settings.icon_background_opacity
	);

	const MIN_SIZE = 40;
	const SNAP_THRESHOLD = 10;

	async function loadImageData(path: string | undefined) {
		if (!path) {
			imageDataUrl = undefined;
			return;
		}

		imageDataUrl = await loadIconDataUrl(path);
	}

	$effect(() => {
		if (icon.icon_path) {
			loadImageData(icon.icon_path);
		} else {
			imageDataUrl = undefined;
		}
	});

	async function handleClick() {
		if (isEditMode) return;
		await launchIcon(icon);
	}

	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		if (isEditMode) {
			// In edit mode, right-click selects the icon and opens its menu.
			onSelect(icon.id, false);
		}
		const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
		contextMenuX = event.clientX - rect.left;
		contextMenuY = event.clientY - rect.top;
		showContextMenu = true;
	}

	function closeContextMenu() {
		showContextMenu = false;
	}

	function handleBringToFront() {
		closeContextMenu();
		onBringToFront(icon.id);
	}

	function handleSendToBack() {
		closeContextMenu();
		onSendToBack(icon.id);
	}

	function handleRemove() {
		closeContextMenu();
		onRemove(icon.id);
	}

	function handleOpenSettingsInEditMode() {
		closeContextMenu();
		onOpenSettings();
	}

	function handleOpenSettingsFromViewMode() {
		closeContextMenu();
		onOpenSettingsFromViewMode();
	}

	function handleEnterEditMode() {
		closeContextMenu();
		onEnterEditMode();
	}

	function handlePointerDown(event: PointerEvent) {
		if (!isEditMode) return;
		if (event.button !== 0) return; // Only left-click (button 0) for dragging

		// Prevent the browser from starting a text selection while dragging/resizing.
		// Without this, dragging to the grid edge can select every icon on the page.
		event.preventDefault();

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const resizeDirFromEdge = getResizeDirAtPoint(rect, event.clientX, event.clientY);

		if (resizeDirFromEdge) {
			// Resizing acts on a single item and does not require preselecting it.
			onSelect(icon.id, false);
			isResizing = true;
			resizeDir = resizeDirFromEdge;
			resizeStartX = event.clientX;
			resizeStartY = event.clientY;
			resizeStartRect = { x: icon.x, y: icon.y, width: icon.width, height: icon.height };
			onDragStart();
			onDraggingChange(icon.id, true);
		} else if (event.ctrlKey || event.metaKey) {
			// Ctrl/Cmd + click toggles selection; do not start a drag.
			onSelect(icon.id, true);
		} else if (!selected) {
			// Clicking an unselected item clears the selection and starts a single drag.
			onSelect(icon.id, false);
			isDragging = true;
			dragOffsetX = event.clientX - icon.x;
			dragOffsetY = event.clientY - icon.y;
			onDragStart();
			onDraggingChange(icon.id, true);
		} else {
			// Dragging an already selected item moves the whole selection.
			onStartGroupDrag(icon.id, event.clientX, event.clientY);
			isDragging = true;
			onDraggingChange(icon.id, true);
		}

		target.setPointerCapture(event.pointerId);
	}

	function handlePointerMove(event: PointerEvent) {
		if (!isEditMode || multiDragActive) return;

		if (isDragging) {
			let rawX = event.clientX - dragOffsetX;
			let rawY = event.clientY - dragOffsetY;

			if (snapToGrid) {
				// Snap based on top-left
				const nearestGridX1 = Math.round(rawX / gridSize) * gridSize;
				const nearestGridY1 = Math.round(rawY / gridSize) * gridSize;
				const distToGridX1 = Math.abs(rawX - nearestGridX1);
				const distToGridY1 = Math.abs(rawY - nearestGridY1);

				// Snap based on bottom-right
				const nearestGridX2 = Math.round((rawX + icon.width) / gridSize) * gridSize - icon.width;
				const nearestGridY2 = Math.round((rawY + icon.height) / gridSize) * gridSize - icon.height;
				const distToGridX2 = Math.abs(rawX - nearestGridX2);
				const distToGridY2 = Math.abs(rawY - nearestGridY2);

				// Use whichever snap is closer (or no snap if both are too far)
				if (distToGridX1 <= SNAP_THRESHOLD && distToGridX1 <= distToGridX2) {
					rawX = nearestGridX1;
				} else if (distToGridX2 <= SNAP_THRESHOLD) {
					rawX = nearestGridX2;
				}

				if (distToGridY1 <= SNAP_THRESHOLD && distToGridY1 <= distToGridY2) {
					rawY = nearestGridY1;
				} else if (distToGridY2 <= SNAP_THRESHOLD) {
					rawY = nearestGridY2;
				}
			}

			onPositionChange(icon.id, rawX, rawY);
		} else if (isResizing && resizeDir) {
			const deltaX = event.clientX - resizeStartX;
			const deltaY = event.clientY - resizeStartY;
			const rect = computeResizeRect(resizeStartRect, resizeDir, deltaX, deltaY, {
				square: true,
				minSize: MIN_SIZE,
				snap: snapToGrid,
				gridSize,
				snapThreshold: SNAP_THRESHOLD
			});

			if (rect.x !== icon.x || rect.y !== icon.y) {
				onPositionChange(icon.id, rect.x, rect.y);
			}
			if (rect.width !== icon.width || rect.height !== icon.height) {
				onSizeChange(icon.id, rect.width, rect.height);
			}
		} else {
			// Idle: show the resize cursor while hovering an edge or corner.
			const elRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			hoverResizeDir = getResizeDirAtPoint(elRect, event.clientX, event.clientY);
		}
	}

	function handlePointerUp(event: PointerEvent) {
		const target = event.currentTarget as HTMLElement;
		target.releasePointerCapture(event.pointerId);
		isDragging = false;
		isResizing = false;
		resizeDir = null;
		hoverResizeDir = null;
		onDraggingChange(icon.id, false);
	}

	function isGif(path: string | undefined): boolean {
		return path?.toLowerCase().endsWith('.gif') ?? false;
	}

	const typeLabel = $derived(`${icon.icon_type} item`);
</script>

<div
	class="app-icon"
	class:edit-mode={isEditMode}
	class:dragging={isDragging}
	class:resizing={isResizing}
	class:selected
	class:image-type={icon.icon_type === 'image'}
	class:link-type={icon.icon_type === 'link'}
	class:no-click-action={!isEditMode && !hasClickAction}
	style="width: 100%; height: 100%; border-radius: {settingsStore.settings
		.border_radius}px; --icon-bg-color: {bgColor}; --icon-bg-opacity: {bgOpacity}; cursor: {cursor};"
	role="button"
	tabindex="0"
	onclick={handleClick}
	oncontextmenu={handleContextMenu}
	onkeydown={(e) => !isEditMode && e.key === 'Enter' && handleClick()}
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointerleave={() => (hoverResizeDir = null)}
>
	<div class="icon-content">
		{#if imageDataUrl}
			<img
				src={imageDataUrl}
				alt={icon.name}
				class="icon-image"
				class:gif={isGif(icon.icon_path)}
				draggable="false"
			/>
		{:else if icon.icon_path}
			<div class="icon-placeholder loading">
				<span class="icon-initial">⏳</span>
			</div>
		{:else}
			<div class="icon-placeholder">
				{#if icon.icon_type === 'image'}
					<span class="icon-initial">🖼️</span>
				{:else if icon.icon_type === 'link'}
					<span class="icon-initial">🔗</span>
				{:else}
					<span class="icon-initial">{icon.name.charAt(0).toUpperCase()}</span>
				{/if}
			</div>
		{/if}
	</div>

	{#if icon.icon_type !== 'image' && (icon.show_name ?? true)}
		<span
			class="icon-label"
			style:font-family={icon.font_family || 'inherit'}
			style:font-size={icon.font_size ? `${icon.font_size}px` : 'inherit'}
			>{icon.custom_name ?? icon.name}</span
		>
	{/if}

	{#if isEditMode}
		<div class="edit-indicator" title={typeLabel} aria-label={typeLabel}>
			{#if icon.icon_type === 'app'}
				<Rocket size={13} strokeWidth={2.2} />
			{:else if icon.icon_type === 'image'}
				<ImageIcon size={13} strokeWidth={2.2} />
			{:else if icon.icon_type === 'link'}
				<Link size={13} strokeWidth={2.2} />
			{:else if icon.icon_type === 'widget'}
				<Settings size={13} strokeWidth={2.2} />
			{:else}
				<Package size={13} strokeWidth={2.2} />
			{/if}
		</div>
	{/if}

	{#if icon.icon_type === 'link' && icon.url && isEditMode}
		<div class="url-badge" title={icon.url}>🌐</div>
	{/if}

	{#if isEditMode && icon.keybind?.key}
		<div
			class="keybind-badge"
			class:shift-right={icon.icon_type === 'link' && !!icon.url}
			title="Keybind: {keybindToString(icon.keybind)}"
		>
			{keybindToString(icon.keybind)}
		</div>
	{/if}
</div>

{#if showContextMenu}
	<button
		type="button"
		class="context-menu-overlay"
		aria-label="Close context menu"
		onclick={closeContextMenu}
		oncontextmenu={(e) => {
			e.preventDefault();
			closeContextMenu();
		}}
	></button>
	<div class="context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;">
		{#if isEditMode}
			<button class="context-menu-item" onclick={handleOpenSettingsInEditMode}>
				<span class="item-label">Open Settings...</span>
			</button>
			<div class="context-menu-divider"></div>
			<button class="context-menu-item" onclick={handleBringToFront}>
				<span class="item-label">Bring to Front</span>
			</button>
			<button class="context-menu-item" onclick={handleSendToBack}>
				<span class="item-label">Send to Back</span>
			</button>
			<div class="context-menu-divider"></div>
			<button class="context-menu-item" onclick={handleRemove}>
				<span class="item-label">Remove</span>
			</button>
		{:else}
			<button class="context-menu-item" onclick={handleOpenSettingsFromViewMode}>
				<span class="item-label">Open Settings...</span>
			</button>
			<button class="context-menu-item" onclick={handleEnterEditMode}>
				<span class="item-label">Enter Edit Mode</span>
			</button>
		{/if}
	</div>
{/if}

<style>
	.app-icon {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: rgba(var(--icon-bg-color, 255, 255, 255), var(--icon-bg-opacity, 0.2));
		border: none;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			opacity 0.2s ease;
		padding: 8px;
		user-select: none;
		box-sizing: border-box;
	}
	.app-icon.no-click-action {
		cursor: default;
	}

	.app-icon:not(.no-click-action):hover {
		background: rgba(var(--icon-bg-color, 255, 255, 255), calc(var(--icon-bg-opacity, 0.2) + 0.1));
	}
	.app-icon.image-type {
		border: none;
		padding: 0;
	}
	/* Image and link icons share the same var-based background as app icons:
	   the per-icon override when set, otherwise the launcher-wide default. */
	.app-icon.edit-mode {
		cursor: move;
		border: 1px dashed var(--edit-outline);
		background: rgba(var(--icon-bg-color, 255, 255, 255), var(--icon-bg-opacity, 0.2));
		touch-action: none;
	}
	.app-icon.edit-mode.selected {
		border: 1px solid var(--edit-outline-strong);
		box-shadow: 0 0 0 2px var(--edit-outline-strong);
		z-index: 20;
	}
	.app-icon.dragging {
		opacity: 0.8;
		z-index: 1000;
		box-shadow: var(--launcher-drag-shadow);
	}
	.app-icon.resizing {
		z-index: 1000;
	}
	.icon-content {
		width: 100%;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}
	.icon-image {
		width: 100%;
		height: 100%;
		object-fit: contain;
		border-radius: 12px;
	}
	.icon-image.gif {
		image-rendering: auto;
	}
	.icon-placeholder {
		width: 60%;
		height: 60%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		max-width: 48px;
		max-height: 48px;
	}
	.icon-placeholder.loading {
		background: rgba(100, 200, 255, 0.2);
	}
	.icon-initial {
		font-size: clamp(16px, 4vw, 32px);
		font-weight: bold;
		color: rgba(255, 255, 255, 0.9);
	}
	.icon-label {
		margin-top: 4px;
		font-size: clamp(10px, 2vw, 14px);
		color: rgba(255, 255, 255, 0.8);
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 90%;
	}
	.edit-indicator {
		position: absolute;
		top: -8px;
		left: -8px;
		width: 24px;
		height: 24px;
		background: var(--edit-control-bg);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--edit-control-fg);
		border: 1px solid var(--edit-control-border);
		box-shadow: var(--edit-control-shadow);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	.context-menu-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		padding: 0;
		background: transparent;
		border: none;
		z-index: 998;
	}
	.context-menu {
		position: absolute;
		background: rgba(30, 30, 40, 0.95);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 12px;
		padding: 4px;
		z-index: 999;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
		min-width: 150px;
	}
	.context-menu-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 7px 10px;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.9);
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		font-size: 14px;
	}
	.context-menu-item:hover {
		background: rgba(255, 255, 255, 0.15);
	}
	.item-label {
		flex: 1;
	}
	.context-menu-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 8px 0;
	}
	.add-image-hint {
		position: absolute;
		bottom: 4px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 9px;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
		white-space: nowrap;
		pointer-events: none;
	}
	.url-badge {
		position: absolute;
		bottom: -8px;
		left: -8px;
		width: 20px;
		height: 20px;
		background: rgba(100, 255, 100, 0.9);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		cursor: help;
	}
	.keybind-badge {
		position: absolute;
		bottom: -8px;
		left: -8px;
		max-width: 90px;
		padding: 2px 6px;
		background: var(--edit-control-bg);
		border: 1px solid var(--edit-control-border);
		border-radius: 6px;
		box-shadow: var(--edit-control-shadow);
		color: var(--edit-control-fg);
		font-family: monospace;
		font-size: 10px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		pointer-events: none;
	}
	/* When a url-badge occupies the bottom-left corner (link icons with a URL),
	   shift the keybind badge right so the two don't overlap. */
	.keybind-badge.shift-right {
		left: 16px;
	}
</style>
