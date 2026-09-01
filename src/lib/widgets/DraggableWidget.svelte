<script lang="ts">
	import Settings from '@lucide/svelte/icons/settings';

	import type { WidgetType, WidgetConfigType } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';
	import { getWidgetAppearance } from './appearance';
	import WidgetContainer from './WidgetContainer.svelte';
	import WidgetCss from './WidgetCss.svelte';
	import ClockSettingsModal from '$lib/components/ClockSettingsModal.svelte';
	import SystemSettingsModal from '$lib/components/SystemSettingsModal.svelte';
	import WeatherSettingsModal from '$lib/components/WeatherSettingsModal.svelte';
	import TerminalSettingsModal from '$lib/components/TerminalSettingsModal.svelte';
	import MusicSettingsModal from '$lib/components/MusicSettingsModal.svelte';
	import TextBoxSettingsModal from '$lib/components/TextBoxSettingsModal.svelte';
	import MemoSettingsModal from '$lib/components/MemoSettingsModal.svelte';
	import TaskListSettingsModal from '$lib/components/TaskListSettingsModal.svelte';
	import SlideshowSettingsModal from '$lib/components/SlideshowSettingsModal.svelte';
	import DrawingSettingsModal from '$lib/components/DrawingSettingsModal.svelte';
	import PowerControlSettingsModal from '$lib/components/PowerControlSettingsModal.svelte';
	import ClipboardSettingsModal from '$lib/components/ClipboardSettingsModal.svelte';
	import CustomSettingsModal from '$lib/components/CustomSettingsModal.svelte';
	import Portal from '$lib/components/Portal.svelte';
	import type { KeybindConfig } from '$lib/stores/settings.svelte';
	import {
		computeResizeRect,
		getResizeDirAtPoint,
		RESIZE_CURSORS,
		type ResizeDir
	} from '$lib/resize';

	interface Props {
		id: string;
		widgetType: WidgetType;
		config?: WidgetConfigType;
		x: number;
		y: number;
		width: number;
		height: number;
		keybind?: KeybindConfig;
		keybindGlobal?: boolean;
		isEditMode: boolean;
		snapToGrid?: boolean;
		gridSize?: number;
		onDragStart: () => void;
		onPositionChange: (id: string, x: number, y: number) => void;
		onSizeChange: (id: string, width: number, height: number) => void;
		onConfigChange: (id: string, config: WidgetConfigType) => void;
		onKeybindChange?: (id: string, keybind: KeybindConfig | null) => void;
		onKeybindGlobalChange?: (id: string, global: boolean) => void;
		onDuplicate?: (id: string) => void;
		selected?: boolean;
		multiDragActive?: boolean;
		onSelect: (id: string, additive: boolean) => void;
		onStartGroupDrag: (id: string, clientX: number, clientY: number) => void;
		onEnterEditMode: () => void;
		onBringToFront: (id: string) => void;
		onSendToBack: (id: string) => void;
		onRemove?: (id: string) => void;
		onDraggingChange: (id: string, interacting: boolean) => void;
	}

	let {
		id,
		widgetType,
		config,
		x,
		y,
		width,
		height,
		keybind,
		keybindGlobal = false,
		isEditMode,
		snapToGrid = true,
		gridSize = 40,
		onDragStart,
		onPositionChange,
		onSizeChange,
		onConfigChange,
		onKeybindChange = () => {},
		onKeybindGlobalChange = () => {},
		onDuplicate = () => {},
		selected = false,
		multiDragActive = false,
		onSelect,
		onStartGroupDrag,
		onEnterEditMode,
		onBringToFront = () => {},
		onSendToBack = () => {},
		onRemove = () => {},
		onDraggingChange = () => {}
	}: Props = $props();

	let isDragging = $state(false);
	let isResizing = $state(false);
	let resizeDir = $state<ResizeDir | null>(null);
	let dragOffsetX = $state(0);
	let dragOffsetY = $state(0);
	let resizeStartX = $state(0);
	let resizeStartY = $state(0);
	let resizeStartRect = $state({ x: 0, y: 0, width: 0, height: 0 });
	let hoverResizeDir = $state<ResizeDir | null>(null);
	let showSettings = $state(false);
	let showContextMenu = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);
	let contextMenuEl = $state<HTMLDivElement | null>(null);
	let flipContextMenuX = $state(false);
	let flipContextMenuY = $state(false);

	const MIN_SIZE = 80;
	const SNAP_THRESHOLD = 10;

	// The widget's effective corner radius (type default < item override), so
	// the drag frame and container match what renders.
	const borderRadius = $derived(
		getWidgetAppearance(config, WIDGET_TYPE_APPEARANCE_DEFAULTS[widgetType] ?? {}).borderRadius
	);

	let cursor = $derived(
		isEditMode ? (hoverResizeDir ? RESIZE_CURSORS[hoverResizeDir] : 'move') : undefined
	);

	function openSettings() {
		showSettings = true;
		showContextMenu = false;
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
		if (isEditMode) {
			onSelect(id, false);
		}
		// Viewport coordinates: the menu is rendered into <body>, so it no
		// longer inherits the widget's position.
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

	function handleOpenSettingsFromViewMode() {
		closeContextMenu();
		onEnterEditMode();
		onSelect(id, false);
		showSettings = true;
	}

	function handleEnterEditMode() {
		closeContextMenu();
		onEnterEditMode();
	}

	function handleQuickToggle(option: string) {
		if (widgetType === 'clock') {
			const clockConfig = (config ?? {}) as import('./types').ClockWidgetConfig;
			let newConfig: import('./types').ClockWidgetConfig;

			switch (option) {
				case 'displayMode':
					newConfig = {
						...clockConfig,
						displayMode: (clockConfig.displayMode ?? 'digital') === 'digital' ? 'analog' : 'digital'
					};
					break;
				default:
					return;
			}
			onConfigChange(id, newConfig);
		} else if (widgetType === 'system' && config) {
			const systemConfig = config as import('./types').SystemWidgetConfig;
			let newConfig: import('./types').SystemWidgetConfig;

			switch (option) {
				case 'cpu':
					newConfig = { ...systemConfig, showCpu: !systemConfig.showCpu };
					break;
				case 'memory':
					newConfig = { ...systemConfig, showMemory: !systemConfig.showMemory };
					break;
				case 'disk':
					newConfig = { ...systemConfig, showDisk: !systemConfig.showDisk };
					break;
				case 'percentage':
					newConfig = { ...systemConfig, showPercentage: !systemConfig.showPercentage };
					break;
				case 'actualUsage':
					newConfig = { ...systemConfig, showActualUsage: !systemConfig.showActualUsage };
					break;
				default:
					return;
			}
			onConfigChange(id, newConfig);
		}
		closeContextMenu();
	}

	function handleCopyTextbox() {
		onDuplicate(id);
		closeContextMenu();
	}

	function handleBringToFront() {
		closeContextMenu();
		onBringToFront(id);
	}

	function handleSendToBack() {
		closeContextMenu();
		onSendToBack(id);
	}

	function handleRemove() {
		closeContextMenu();
		onRemove(id);
	}

	function handleConfigSave(newConfig: WidgetConfigType) {
		onConfigChange(id, newConfig);
	}

	function handlePointerDown(event: PointerEvent) {
		if (!isEditMode) return;
		if (event.button !== 0) return; // Only left-click (button 0) for dragging

		// Prevent the browser from starting a text selection while dragging/resizing.
		// Without this, dragging to the grid edge can select every widget/icon on the page.
		event.preventDefault();

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const resizeDirFromEdge = getResizeDirAtPoint(rect, event.clientX, event.clientY);

		if (resizeDirFromEdge) {
			// Resizing acts on a single item and does not require preselecting it.
			onSelect(id, false);
			isResizing = true;
			resizeDir = resizeDirFromEdge;
			resizeStartX = event.clientX;
			resizeStartY = event.clientY;
			resizeStartRect = { x, y, width, height };
			onDragStart();
			onDraggingChange(id, true);
		} else if (event.ctrlKey || event.metaKey) {
			// Ctrl/Cmd + click toggles selection; do not start a drag.
			onSelect(id, true);
		} else if (!selected) {
			// Clicking an unselected widget clears the selection and starts a single drag.
			onSelect(id, false);
			isDragging = true;
			dragOffsetX = event.clientX - x;
			dragOffsetY = event.clientY - y;
			onDragStart();
			onDraggingChange(id, true);
		} else {
			// Dragging an already selected widget moves the whole selection.
			onStartGroupDrag(id, event.clientX, event.clientY);
			isDragging = true;
			onDraggingChange(id, true);
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
				const nearestGridX2 = Math.round((rawX + width) / gridSize) * gridSize - width;
				const nearestGridY2 = Math.round((rawY + height) / gridSize) * gridSize - height;
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

			onPositionChange(id, rawX, rawY);
		} else if (isResizing && resizeDir) {
			const deltaX = event.clientX - resizeStartX;
			const deltaY = event.clientY - resizeStartY;
			const rect = computeResizeRect(resizeStartRect, resizeDir, deltaX, deltaY, {
				square: false,
				minSize: MIN_SIZE,
				snap: snapToGrid,
				gridSize,
				snapThreshold: SNAP_THRESHOLD
			});

			if (rect.x !== x || rect.y !== y) {
				onPositionChange(id, rect.x, rect.y);
			}
			if (rect.width !== width || rect.height !== height) {
				onSizeChange(id, rect.width, rect.height);
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
		onDraggingChange(id, false);
	}
</script>

<div
	class="draggable-widget"
	class:edit-mode={isEditMode}
	class:dragging={isDragging}
	class:resizing={isResizing}
	class:selected
	style="width: 100%; height: 100%; border-radius: {borderRadius}px; cursor: {cursor};"
	onpointerdown={handlePointerDown}
	onpointermove={handlePointerMove}
	onpointerup={handlePointerUp}
	onpointerleave={() => (hoverResizeDir = null)}
	oncontextmenu={handleContextMenu}
>
	<WidgetContainer
		{widgetType}
		{id}
		{config}
		{isEditMode}
		{borderRadius}
		onConfigChange={(newConfig) => onConfigChange(id, newConfig)}
	/>

	<WidgetCss {id} appearance={config?.appearance} />

	{#if isEditMode}
		<div class="edit-indicator" title="Widget settings" aria-label="Widget settings">
			<Settings size={13} strokeWidth={2.2} />
		</div>
	{/if}
</div>

{#if showContextMenu}
	<Portal>
		<button
			type="button"
			class="context-menu-overlay"
			aria-label="Close context menu"
			onclick={closeContextMenu}
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
			{#if !isEditMode}
				<button class="context-menu-item" onclick={handleOpenSettingsFromViewMode}>
					<span class="item-label">Open Settings...</span>
				</button>
				<button class="context-menu-item" onclick={handleEnterEditMode}>
					<span class="item-label">Enter Edit Mode</span>
				</button>
			{:else if widgetType === 'textbox'}
				<button class="context-menu-item" onclick={handleCopyTextbox}>
					<span class="item-label">Copy</span>
				</button>
				<div class="context-menu-divider"></div>
			{/if}

			{#if isEditMode && (widgetType === 'clock' || widgetType === 'system')}
				<div class="context-menu-header">Quick Settings</div>

				{#if widgetType === 'clock'}
					{@const clockConfig = config as import('./types').ClockWidgetConfig}
					<button class="context-menu-item" onclick={() => handleQuickToggle('displayMode')}>
						<span class="item-label">Clock Style</span>
						<span class="item-value"
							>{(clockConfig?.displayMode ?? 'digital') === 'digital' ? 'Digital' : 'Analog'}</span
						>
					</button>
				{:else if widgetType === 'system'}
					{@const systemConfig = config as import('./types').SystemWidgetConfig}
					<button class="context-menu-item" onclick={() => handleQuickToggle('cpu')}>
						<span class="item-label">Show CPU</span>
						<span class="item-toggle">{systemConfig?.showCpu ? '✓' : '○'}</span>
					</button>
					<button class="context-menu-item" onclick={() => handleQuickToggle('memory')}>
						<span class="item-label">Show Memory</span>
						<span class="item-toggle">{systemConfig?.showMemory ? '✓' : '○'}</span>
					</button>
					<button class="context-menu-item" onclick={() => handleQuickToggle('disk')}>
						<span class="item-label">Show Disk</span>
						<span class="item-toggle">{systemConfig?.showDisk ? '✓' : '○'}</span>
					</button>
					<button class="context-menu-item" onclick={() => handleQuickToggle('percentage')}>
						<span class="item-label">Show Percentage</span>
						<span class="item-toggle">{systemConfig?.showPercentage !== false ? '✓' : '○'}</span>
					</button>
					<button class="context-menu-item" onclick={() => handleQuickToggle('actualUsage')}>
						<span class="item-label">Show Actual Usage</span>
						<span class="item-toggle">{systemConfig?.showActualUsage !== false ? '✓' : '○'}</span>
					</button>
				{/if}

				<div class="context-menu-divider"></div>
			{/if}

			{#if isEditMode}
				<button class="context-menu-item" onclick={openSettings}>
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
			{/if}
		</div>
	</Portal>
{/if}

<svelte:window onkeydown={handleWindowKeydown} />

<Portal>
	{#if widgetType === 'clock'}
		<ClockSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').ClockWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'system'}
		<SystemSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').SystemWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'weather'}
		<WeatherSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').WeatherWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'terminal'}
		<TerminalSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').TerminalWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'music'}
		<MusicSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').MusicWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'textbox'}
		<TextBoxSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').TextBoxWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'memo'}
		<MemoSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').MemoWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'drawing'}
		<DrawingSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').DrawingWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'slideshow'}
		<SlideshowSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').SlideshowWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'tasklist'}
		<TaskListSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').TaskListWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'sleep'}
		<PowerControlSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').SleepWidgetConfig}
			widgetId={id}
			{widgetType}
			{keybind}
			{keybindGlobal}
			widgetName="Sleep"
			onSave={handleConfigSave}
			onUpdateKeybind={(nextKeybind) => onKeybindChange(id, nextKeybind)}
			onUpdateKeybindGlobal={(global) => onKeybindGlobalChange(id, global)}
		/>
	{:else if widgetType === 'restart'}
		<PowerControlSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').RestartWidgetConfig}
			widgetId={id}
			{widgetType}
			{keybind}
			{keybindGlobal}
			widgetName="Restart"
			onSave={handleConfigSave}
			onUpdateKeybind={(nextKeybind) => onKeybindChange(id, nextKeybind)}
			onUpdateKeybindGlobal={(global) => onKeybindGlobalChange(id, global)}
		/>
	{:else if widgetType === 'shutdown'}
		<PowerControlSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').ShutdownWidgetConfig}
			widgetId={id}
			{widgetType}
			{keybind}
			{keybindGlobal}
			widgetName="Shutdown"
			onSave={handleConfigSave}
			onUpdateKeybind={(nextKeybind) => onKeybindChange(id, nextKeybind)}
			onUpdateKeybindGlobal={(global) => onKeybindGlobalChange(id, global)}
		/>
	{:else if widgetType === 'clipboard'}
		<ClipboardSettingsModal
			bind:isOpen={showSettings}
			config={config as import('./types').ClipboardWidgetConfig}
			onSave={handleConfigSave}
		/>
	{:else if widgetType === 'custom'}
		<CustomSettingsModal
			bind:isOpen={showSettings}
			widgetId={id}
			config={config as import('./types').CustomWidgetConfig}
			onSave={handleConfigSave}
		/>
	{/if}
</Portal>

<style>
	.draggable-widget {
		position: relative;
		width: 100%;
		height: 100%;
		transition: box-shadow 0.2s ease;
	}

	.draggable-widget:not(.edit-mode) {
		overflow: hidden;
	}

	.draggable-widget.edit-mode {
		overflow: visible;
		cursor: move;
		box-shadow: 0 0 0 1px var(--edit-outline);
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
	}

	.draggable-widget.edit-mode.selected {
		box-shadow: 0 0 0 2px var(--edit-outline-strong);
		z-index: 20;
	}

	.draggable-widget.dragging {
		opacity: 0.9;
		z-index: 1000;
		box-shadow: var(--canvas-drag-shadow);
	}

	.draggable-widget.resizing {
		z-index: 1000;
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
		z-index: 10;
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

	.context-menu-header {
		padding: 8px 12px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		margin-bottom: 4px;
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

	.item-value {
		color: rgba(200, 200, 255, 0.9);
		font-weight: 600;
		font-size: 12px;
		background: rgba(100, 100, 200, 0.3);
		padding: 2px 8px;
		border-radius: 4px;
	}

	.item-toggle {
		color: rgba(100, 255, 100, 0.9);
		font-weight: 600;
		font-size: 14px;
	}

	.context-menu-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 8px 0;
	}
</style>
