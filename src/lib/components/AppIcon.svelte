<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import Link from '@lucide/svelte/icons/link';
	import Package from '@lucide/svelte/icons/package';
	import Rocket from '@lucide/svelte/icons/rocket';
	import Settings from '@lucide/svelte/icons/settings';

	import type { LauncherIcon } from '$lib/icons';
	import { keybindToString } from '$lib/stores/settings.svelte';
	import { loadIconDataUrl } from '$lib/icon-image';
	import { launchIcon } from '$lib/launch';
	import Portal from '$lib/components/Portal.svelte';
	import WidgetCss from '$lib/widgets/WidgetCss.svelte';
	import {
		getWidgetAppearance,
		getAppearanceBackground,
		getAppearanceBorder,
		colorWithOpacity
	} from '$lib/widgets/appearance';
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
	let contextMenuEl = $state<HTMLDivElement | null>(null);
	let flipContextMenuX = $state(false);
	let flipContextMenuY = $state(false);

	let hasClickAction = $derived(
		icon.icon_type === 'app' ||
			(icon.icon_type === 'link' && icon.url) ||
			(icon.icon_type === 'image' && icon.url)
	);

	let cursor = $derived(
		isEditMode ? (hoverResizeDir ? RESIZE_CURSORS[hoverResizeDir] : 'move') : undefined
	);

	// Icons share the widget appearance system. Unset fields fall back to the
	// icon defaults below.
	const appearance = $derived(
		getWidgetAppearance(
			{ appearance: icon.appearance },
			{
				backgroundColor: 'rgba(255, 255, 255, 1)',
				backgroundOpacity: 0.2,
				padding: icon.icon_type === 'image' ? 0 : 8
			}
		)
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const hoverBackground = $derived(
		colorWithOpacity(appearance.backgroundColor, Math.min(1, appearance.backgroundOpacity + 0.1))
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

	// The menu is rendered via Portal (into <body>), so measure it after it
	// mounts and flip it back toward the window when it would overflow an edge.
	$effect(() => {
		if (showContextMenu && contextMenuEl) {
			const rect = contextMenuEl.getBoundingClientRect();
			flipContextMenuX = rect.right > window.innerWidth;
			flipContextMenuY = rect.bottom > window.innerHeight;
		}
	});

	function handleContextMenu(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		if (isEditMode) {
			onSelect(icon.id, false);
		}
		// Viewport coordinates: the menu is rendered into <body>, so it no
		// longer inherits the icon's position.
		contextMenuX = event.clientX;
		contextMenuY = event.clientY;
		showContextMenu = true;
	}

	function closeContextMenu() {
		showContextMenu = false;
	}

	// Escape closes the menu.
	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showContextMenu) {
			closeContextMenu();
		}
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
		if (event.button !== 0) return;

		event.preventDefault();

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const resizeDirFromEdge = getResizeDirAtPoint(rect, event.clientX, event.clientY);

		if (resizeDirFromEdge) {
			onSelect(icon.id, false);
			isResizing = true;
			resizeDir = resizeDirFromEdge;
			resizeStartX = event.clientX;
			resizeStartY = event.clientY;
			resizeStartRect = { x: icon.x, y: icon.y, width: icon.width, height: icon.height };
			onDragStart();
			onDraggingChange(icon.id, true);
		} else if (event.ctrlKey || event.metaKey) {
			onSelect(icon.id, true);
		} else if (!selected) {
			onSelect(icon.id, false);
			isDragging = true;
			dragOffsetX = event.clientX - icon.x;
			dragOffsetY = event.clientY - icon.y;
			onDragStart();
			onDraggingChange(icon.id, true);
		} else {
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
				const nearestGridX1 = Math.round(rawX / gridSize) * gridSize;
				const nearestGridY1 = Math.round(rawY / gridSize) * gridSize;
				const distToGridX1 = Math.abs(rawX - nearestGridX1);
				const distToGridY1 = Math.abs(rawY - nearestGridY1);

				const nearestGridX2 = Math.round((rawX + icon.width) / gridSize) * gridSize - icon.width;
				const nearestGridY2 = Math.round((rawY + icon.height) / gridSize) * gridSize - icon.height;
				const distToGridX2 = Math.abs(rawX - nearestGridX2);
				const distToGridY2 = Math.abs(rawY - nearestGridY2);

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
	data-item-id={icon.id}
	style="width: 100%; height: 100%; --appearance-background: {widgetBackground}; --appearance-hover-background: {hoverBackground}; --appearance-border: {widgetBorder}; --appearance-border-radius: {appearance.borderRadius}px; --appearance-text-color: {appearance.textColor}; --appearance-font-family: {appearance.fontFamily}; --appearance-font-size: {appearance.fontSize}px; --appearance-padding: {appearance.padding}px; --appearance-opacity: {appearance.opacity}; cursor: {cursor};"
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
		<span class="icon-label">{icon.custom_name ?? icon.name}</span>
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

	<WidgetCss id={icon.id} appearance={icon.appearance} />
</div>

<svelte:window onkeydown={handleWindowKeydown} />

{#if showContextMenu}
	<Portal>
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
		<div
			bind:this={contextMenuEl}
			class="context-menu"
			oncontextmenu={(e) => {
				// Right-clicking the menu itself must not trigger the webview's
				// native menu or bubble anywhere.
				e.preventDefault();
				e.stopPropagation();
			}}
			style="left: {contextMenuX}px; top: {contextMenuY}px; transform: {flipContextMenuX
				? 'translateX(-100%)'
				: ''} {flipContextMenuY ? 'translateY(-100%)' : ''};"
		>
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
	</Portal>
{/if}

<style>
	.app-icon {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: var(--appearance-background, rgba(255, 255, 255, 0.2));
		border: var(--appearance-border, none);
		border-radius: var(--appearance-border-radius, 24px);
		color: var(--appearance-text-color, #ffffff);
		font-size: var(--appearance-font-size, 16px);
		font-family: var(--appearance-font-family, system-ui);
		padding: var(--appearance-padding, 8px);
		opacity: var(--appearance-opacity, 1);
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			box-shadow 0.2s ease,
			opacity 0.2s ease;
		user-select: none;
		box-sizing: border-box;
	}
	.app-icon.no-click-action {
		cursor: default;
	}

	.app-icon:not(.no-click-action):hover {
		background: var(--appearance-hover-background, rgba(255, 255, 255, 0.3));
	}

	.app-icon.edit-mode {
		cursor: move;
		border: 1px dashed var(--edit-outline);
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
		font-size: clamp(1em, 4vw, 2em);
		font-weight: bold;
		color: rgba(255, 255, 255, 0.9);
	}
	.icon-label {
		margin-top: 4px;
		font-size: clamp(0.625em, 2vw, 0.875em);
		color: var(--appearance-text-color, rgba(255, 255, 255, 0.8));
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
		position: fixed;
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

	.keybind-badge.shift-right {
		left: 16px;
	}
</style>
