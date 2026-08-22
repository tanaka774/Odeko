<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { confirm } from '@tauri-apps/plugin-dialog';
	import AppIcon from './AppIcon.svelte';
	import AppPickerModal from './AppPickerModal.svelte';
	import SettingsModal from './SettingsModal.svelte';
	import IconSettingsModal from './IconSettingsModal.svelte';
	import DraggableWidget from '$lib/widgets/DraggableWidget.svelte';
	import WidgetPickerModal from './WidgetPickerModal.svelte';
	import Portal from './Portal.svelte';
	import FloatingEditToolbar from './FloatingEditToolbar.svelte';
	import { shouldIgnoreGlobalShortcut } from '$lib/keyboard';
	import { settingsStore, matchesKeybind, type KeybindConfig } from '$lib/stores/settings.svelte';
	import { createEditSession } from '$lib/edit-session.svelte';
	import type { WidgetConfigType } from '$lib/widgets/types';
	import type { LauncherIcon } from '$lib/icons';

	interface Props {
		isEditMode: boolean;
		onEnterEditMode: () => void;
		onExitEditMode: () => void;
	}

	let { isEditMode, onEnterEditMode, onExitEditMode }: Props = $props();

	let icons = $state<LauncherIcon[]>([]);
	let isLoading = $state(true);
	let showAppPicker = $state(false);
	let showWidgetPicker = $state(false);
	let showSettings = $state(false);
	let showIconSettings = $state(false);
	let selectedIconId = $state<string | null>(null);
	let selectedIds = $state<Set<string>>(new Set());
	let snapToGrid = $derived(settingsStore.settings.magnetic_snap);
	let gridSize = $derived(settingsStore.settings.grid_size);
	let gridEl: HTMLDivElement | null = null;

	// Multi-selection marquee state
	let isMarquee = $state(false);
	let marqueeStart = $state({ x: 0, y: 0 });
	let marqueeEnd = $state({ x: 0, y: 0 });
	let marqueeAdditive = $state(false);

	// Multi-selection group-drag state
	let multiDrag = $state<{
		startX: number;
		startY: number;
		startPositions: Map<string, { x: number; y: number }>;
	} | null>(null);
	let isMultiDragging = $derived(multiDrag !== null);

	let interactingIds = $state<Set<string>>(new Set());

	// Clear selection when leaving edit mode
	$effect(() => {
		if (!isEditMode) {
			selectedIds = new Set();
			multiDrag = null;
			interactingIds = new Set();
		}
	});

	$effect(() => {
		settingsStore.setCurrentIcons(icons);
	});

	let selectedIcon = $derived(
		selectedIconId ? icons.find((icon) => icon.id === selectedIconId) || null : null
	);

	const editSession = createEditSession<LauncherIcon>();
	const GROUP_SNAP_THRESHOLD = 10;

	let hasTerminalWidget = $derived(
		icons.some((icon) => icon.icon_type === 'widget' && icon.widget_type === 'terminal')
	);

	onMount(async () => {
		await loadLayout();
	});

	async function loadLayout() {
		try {
			isLoading = true;
			const layout = await invoke<{ icons: LauncherIcon[] }>('load_active_layout');
			icons = normalizeZ(layout.icons || []);
			await refreshIconShortcuts(icons);
		} catch (error) {
			console.error('Failed to load layout:', error);
			icons = getDefaultIcons();
			await refreshIconShortcuts(icons);
		} finally {
			isLoading = false;
		}
	}

	async function refreshIconShortcuts(nextIcons = icons) {
		try {
			await invoke('update_icon_shortcuts', { icons: nextIcons });
		} catch (error) {
			console.error('Failed to update global icon shortcuts:', error);
		}
	}

	async function saveLayout() {
		// Widgets can trigger this right after startup (e.g. live stats
		// updates). Saving before the real settings finish loading would
		// overwrite the preset with defaults, so wait for the load first.
		if (!settingsStore.isLoaded) {
			await settingsStore.loadSettings();
		}
		try {
			const name = await invoke<string>('save_active_layout', {
				icons,
				settings: settingsStore.settings
			});
			if (name) {
				settingsStore.setActivePreset(name);
			}
			await refreshIconShortcuts(icons);
			editSession.save();
		} catch (error) {
			console.error('Failed to save layout:', error);
		}
	}

	async function reloadAll() {
		try {
			const layout = await invoke<{
				icons: LauncherIcon[];
				settings: object;
				active_preset: string | null;
			}>('load_active_layout');
			icons = normalizeZ(layout.icons || []);
			settingsStore.applyLayout(layout as Parameters<typeof settingsStore.applyLayout>[0]);
		} catch (error) {
			console.error('Failed to reload layout:', error);
		}
		if (isEditMode) {
			// A preset apply is an explicit, immediately-persisted action, so the
			// edit session adopts the newly loaded icons as its baseline.
			editSession.enter(icons);
		}
	}

	function saveToHistory() {
		editSession.pushHistory(icons);
	}

	function canUndo(): boolean {
		return editSession.canUndo;
	}

	export function undo() {
		const previousState = editSession.undo();
		if (previousState) {
			icons = previousState;
		}
	}

	export function enterEditMode() {
		editSession.enter(icons);
		selectedIds = new Set();
	}

	export async function saveAndExit() {
		if (editSession.isDirty) {
			await saveLayout();
		}
		editSession.save();
		selectedIds = new Set();
	}

	export async function cancelEditMode() {
		const restored = editSession.cancel();
		if (restored) {
			icons = restored;
			// Re-register the original icon shortcuts: keybind changes made
			// during the session were applied live and must be rolled back too.
			await refreshIconShortcuts(restored);
		}
		selectedIds = new Set();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!isEditMode) return;
		if (shouldIgnoreGlobalShortcut(event)) return;

		if (matchesKeybind(event, settingsStore.settings.keybind_undo)) {
			event.preventDefault();
			undo();
			return;
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			clearSelection();
			return;
		}

		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			selectAll();
			return;
		}

		if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.size > 0) {
			event.preventDefault();
			void removeSelected();
		}
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	function selectAll() {
		selectedIds = new Set(icons.map((icon) => icon.id));
	}

	function handleSelect(id: string, additive: boolean) {
		if (additive) {
			const next = new Set(selectedIds);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			selectedIds = next;
		} else if (!selectedIds.has(id) || selectedIds.size !== 1) {
			selectedIds = new Set([id]);
		}
	}

	function openIconSettings(id: string) {
		selectedIds = new Set([id]);
		selectedIconId = id;
		showIconSettings = true;
	}

	function enterEditModeAndOpenIconSettings(id: string) {
		if (!isEditMode) {
			onEnterEditMode();
		}
		openIconSettings(id);
	}

	function removeIcon(id: string) {
		saveToHistory();
		icons = icons.filter((icon) => icon.id !== id);
		const next = new Set(selectedIds);
		next.delete(id);
		selectedIds = next;
		editSession.markDirty();
	}

	async function removeSelected() {
		const count = selectedIds.size;
		if (count === 0) return;
		const ok = await confirm(`Delete ${count} selected item${count > 1 ? 's' : ''}?`, {
			title: 'Confirm Delete'
		});
		if (!ok) return;
		saveToHistory();
		icons = icons.filter((icon) => !selectedIds.has(icon.id));
		selectedIds = new Set();
		editSession.markDirty();
	}

	function handleGridPointerDown(event: PointerEvent) {
		if (!isEditMode || event.button !== 0) return;
		if ((event.target as HTMLElement).closest('.icon-wrapper')) return;

		event.preventDefault();
		isMarquee = true;
		marqueeAdditive = event.ctrlKey || event.metaKey;

		const rect = gridEl!.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const y = event.clientY - rect.top;
		marqueeStart = { x, y };
		marqueeEnd = { x, y };

		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function handleGridPointerMove(event: PointerEvent) {
		if (!isMarquee || !gridEl) return;
		const rect = gridEl.getBoundingClientRect();
		marqueeEnd = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};
	}

	function handleGridPointerUp(event: PointerEvent) {
		if (!isMarquee) return;
		const target = event.currentTarget as HTMLElement;

		const rect = gridEl!.getBoundingClientRect();
		const end = {
			x: event.clientX - rect.left,
			y: event.clientY - rect.top
		};

		applyMarqueeSelection(end);
		isMarquee = false;
		marqueeEnd = { x: 0, y: 0 };
		marqueeStart = { x: 0, y: 0 };
		try {
			target.releasePointerCapture(event.pointerId);
		} catch {
			// may already be released
		}
	}

	function applyMarqueeSelection(end: { x: number; y: number }) {
		const left = Math.min(marqueeStart.x, end.x);
		const right = Math.max(marqueeStart.x, end.x);
		const top = Math.min(marqueeStart.y, end.y);
		const bottom = Math.max(marqueeStart.y, end.y);
		const minDrag = 4;

		if (right - left < minDrag && bottom - top < minDrag) {
			// Treat as a plain click on empty space
			if (!marqueeAdditive) {
				clearSelection();
			}
			return;
		}

		const idsInRect = icons
			.filter(
				(icon) =>
					icon.x < right &&
					icon.x + icon.width > left &&
					icon.y < bottom &&
					icon.y + icon.height > top
			)
			.map((icon) => icon.id);

		if (marqueeAdditive) {
			const next = new Set(selectedIds);
			for (const id of idsInRect) {
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
			}
			selectedIds = next;
		} else {
			selectedIds = new Set(idsInRect);
		}
	}

	function startGroupDrag(id: string, clientX: number, clientY: number) {
		if (!selectedIds.has(id)) {
			selectedIds = new Set([id]);
		}
		handleDragStart();
		interactingIds = new Set(selectedIds);
		multiDrag = {
			startX: clientX,
			startY: clientY,
			startPositions: new Map(
				[...selectedIds].map((sid) => {
					const icon = icons.find((i) => i.id === sid)!;
					return [sid, { x: icon.x, y: icon.y }];
				})
			)
		};
	}

	function handleMultiDragMove(event: PointerEvent) {
		if (!multiDrag) return;

		let dx = event.clientX - multiDrag.startX;
		let dy = event.clientY - multiDrag.startY;

		if (snapToGrid) {
			const selectedIcons = icons.filter((i) => selectedIds.has(i.id));
			if (selectedIcons.length > 0) {
				let minX = Infinity,
					minY = Infinity,
					maxX = -Infinity,
					maxY = -Infinity;

				for (const icon of selectedIcons) {
					const start = multiDrag.startPositions.get(icon.id);
					if (!start) continue;
					const rawX = start.x + dx;
					const rawY = start.y + dy;
					minX = Math.min(minX, rawX);
					minY = Math.min(minY, rawY);
					maxX = Math.max(maxX, rawX + icon.width);
					maxY = Math.max(maxY, rawY + icon.height);
				}

				let snapX = 0,
					snapY = 0;

				const nearestLeft = Math.round(minX / gridSize) * gridSize;
				const distLeft = Math.abs(minX - nearestLeft);
				const nearestRight = Math.round(maxX / gridSize) * gridSize;
				const distRight = Math.abs(maxX - nearestRight);

				if (distLeft <= GROUP_SNAP_THRESHOLD && distLeft <= distRight) {
					snapX = nearestLeft - minX;
				} else if (distRight <= GROUP_SNAP_THRESHOLD) {
					snapX = nearestRight - maxX;
				}

				const nearestTop = Math.round(minY / gridSize) * gridSize;
				const distTop = Math.abs(minY - nearestTop);
				const nearestBottom = Math.round(maxY / gridSize) * gridSize;
				const distBottom = Math.abs(maxY - nearestBottom);

				if (distTop <= GROUP_SNAP_THRESHOLD && distTop <= distBottom) {
					snapY = nearestTop - minY;
				} else if (distBottom <= GROUP_SNAP_THRESHOLD) {
					snapY = nearestBottom - maxY;
				}

				dx += snapX;
				dy += snapY;
			}
		}

		icons = icons.map((icon) => {
			const start = multiDrag!.startPositions.get(icon.id);
			if (!start) return icon;
			return { ...icon, x: start.x + dx, y: start.y + dy };
		});
		editSession.markDirty();
	}

	function handleMultiDragUp() {
		multiDrag = null;
		interactingIds = new Set();
	}

	function handleDragStart() {
		// Save current state before drag begins (for undo)
		saveToHistory();
	}

	function handlePositionChange(id: string, newX: number, newY: number) {
		icons = icons.map((icon) => (icon.id === id ? { ...icon, x: newX, y: newY } : icon));
		editSession.markDirty();
	}

	function handleSizeChange(id: string, newWidth: number, newHeight: number) {
		icons = icons.map((icon) =>
			icon.id === id ? { ...icon, width: newWidth, height: newHeight } : icon
		);
		editSession.markDirty();
	}

	function handleIconChange(id: string, iconPath: string) {
		saveToHistory();
		icons = icons.map((icon) => (icon.id === id ? { ...icon, icon_path: iconPath } : icon));
		editSession.markDirty();
	}

	function handleTypeChange(id: string, type: 'app' | 'image' | 'link', url?: string) {
		saveToHistory();
		icons = icons.map((icon) => {
			if (icon.id === id) {
				return { ...icon, icon_type: type, url: url };
			}
			return icon;
		});
		editSession.markDirty();
	}

	function handleShowNameChange(id: string, showName: boolean) {
		saveToHistory();
		icons = icons.map((icon) => (icon.id === id ? { ...icon, show_name: showName } : icon));
		editSession.markDirty();
	}

	function handleCustomNameChange(id: string, customName: string | null) {
		saveToHistory();
		icons = icons.map((icon) => (icon.id === id ? { ...icon, custom_name: customName } : icon));
		editSession.markDirty();
	}

	function handleFontFamilyChange(id: string, fontFamily: string | null) {
		saveToHistory();
		icons = icons.map((icon) => (icon.id === id ? { ...icon, font_family: fontFamily } : icon));
		editSession.markDirty();
	}

	function handleFontSizeChange(id: string, fontSize: number | null) {
		saveToHistory();
		icons = icons.map((icon) => (icon.id === id ? { ...icon, font_size: fontSize } : icon));
		editSession.markDirty();
	}

	function handleArgsChange(id: string, args: string | null) {
		saveToHistory();
		icons = icons.map((icon) => (icon.id === id ? { ...icon, args: args ?? undefined } : icon));
		editSession.markDirty();
	}

	function handleKeybindChange(id: string, keybind: KeybindConfig | null) {
		saveToHistory();
		const nextIcons = icons.map((icon) =>
			icon.id === id ? { ...icon, keybind: keybind ?? undefined } : icon
		);
		icons = nextIcons;
		void refreshIconShortcuts(nextIcons);
		editSession.markDirty();
	}

	function handleBackgroundChange(id: string, color: string | null, opacity: number | null) {
		saveToHistory();
		icons = icons.map((icon) =>
			icon.id === id
				? {
						...icon,
						background_color: color ?? undefined,
						background_opacity: opacity ?? undefined
					}
				: icon
		);
		editSession.markDirty();
	}

	function handleKeybindGlobalChange(id: string, global: boolean) {
		saveToHistory();
		const nextIcons = icons.map((icon) =>
			icon.id === id ? { ...icon, keybind_global: global } : icon
		);
		icons = nextIcons;
		void refreshIconShortcuts(nextIcons);
		editSession.markDirty();
	}

	function handleWidgetConfigChange(id: string, newConfig: WidgetConfigType) {
		saveToHistory();
		icons = icons.map((icon) => {
			if (icon.id === id) {
				return { ...icon, widget_config: newConfig };
			}
			return icon;
		});
		if (isEditMode) {
			// Inside an edit session, stage the change like any other icon
			// change: it follows edit-mode Save & Exit / Cancel.
			editSession.markDirty();
		} else {
			// View mode has no session, so content edits (e.g. typing in a
			// memo widget) must persist immediately.
			void saveLayout();
		}
	}

	export function addNewIcon() {
		saveToHistory();
		const newId = `icon-${Date.now()}`;
		const newIcon: LauncherIcon = {
			id: newId,
			name: 'New Icon',
			path: '',
			icon_type: 'image',
			x: 150,
			y: 150,
			width: 100,
			height: 100,
			z: nextZ()
		};
		icons = [...icons, newIcon];
		editSession.markDirty();
	}

	function addAppIcon(app: LauncherIcon) {
		saveToHistory();
		icons = [...icons, { ...app, z: nextZ() }];
		editSession.markDirty();
	}

	function addWidget(widget: LauncherIcon) {
		saveToHistory();
		const launcherW = window.innerWidth * (settingsStore.settings.width_percent / 100) * 0.85;
		const launcherH = window.innerHeight * (settingsStore.settings.height_percent / 100) * 0.85;
		const clampedWidget = {
			...widget,
			width: Math.min(widget.width, launcherW),
			height: Math.min(widget.height, launcherH),
			z: nextZ()
		};
		icons = [...icons, clampedWidget];
		editSession.markDirty();
	}

	function handleDuplicateWidget(id: string) {
		const source = icons.find((icon) => icon.id === id);
		if (!source || source.icon_type !== 'widget') return;
		saveToHistory();
		const newIcon: LauncherIcon = {
			...source,
			id: `widget-${Date.now()}`,
			x: source.x + 30,
			y: source.y + 30,
			widget_config: source.widget_config ? { ...source.widget_config } : undefined,
			z: nextZ()
		};
		icons = [...icons, newIcon];
		editSession.markDirty();
	}

	// New items land on top of everything else.
	function nextZ(): number {
		return Math.max(0, ...icons.map((icon) => icon.z ?? 0)) + 1;
	}

	// Give every icon a z following the array order. Old layouts (saved before
	// z existed) get 1..n, so they stack exactly like the DOM order already did.
	function normalizeZ(nextIcons: LauncherIcon[]): LauncherIcon[] {
		return nextIcons.map((icon, index) => ({ ...icon, z: icon.z ?? index + 1 }));
	}

	// Reassign z = 1..n in array order. Keeps the numbers small and unique so
	// there are never ties; the relative stacking is unchanged.
	function renumberZ(nextIcons: LauncherIcon[]): LauncherIcon[] {
		return nextIcons.map((icon, index) => ({ ...icon, z: index + 1 }));
	}

	function bringToFront(id: string) {
		saveToHistory();
		const icon = icons.find((entry) => entry.id === id);
		if (!icon) return;
		icons = renumberZ([...icons.filter((entry) => entry.id !== id), icon]);
		editSession.markDirty();
	}

	function sendToBack(id: string) {
		saveToHistory();
		const icon = icons.find((entry) => entry.id === id);
		if (!icon) return;
		icons = renumberZ([icon, ...icons.filter((entry) => entry.id !== id)]);
		editSession.markDirty();
	}

	function handleDraggingChange(id: string, interacting: boolean) {
		const next = new Set(interactingIds);
		if (interacting) {
			next.add(id);
		} else {
			next.delete(id);
		}
		interactingIds = next;
	}

	export function openAppPicker() {
		showAppPicker = true;
	}

	export function openWidgetPicker() {
		showWidgetPicker = true;
	}

	export function openSettings() {
		showSettings = true;
	}

	function closeIconSettings() {
		showIconSettings = false;
		selectedIconId = null;
	}

	function getDefaultIcons(): LauncherIcon[] {
		return [
			{
				id: 'terminal',
				name: 'Terminal',
				path: 'alacritty',
				icon_type: 'app',
				x: 100,
				y: 100,
				width: 80,
				height: 80,
				z: 1
			},
			{
				id: 'browser',
				name: 'Firefox',
				path: 'firefox',
				icon_type: 'app',
				x: 200,
				y: 100,
				width: 80,
				height: 80,
				z: 2
			}
		];
	}
</script>

<svelte:window
	on:keydown={handleKeydown}
	on:pointermove={handleMultiDragMove}
	on:pointerup={handleMultiDragUp}
/>

<div class="icon-grid-container">
	{#if isEditMode}
		<FloatingEditToolbar
			onSaveAndExit={async () => {
				await saveAndExit();
				onExitEditMode();
			}}
			onCancel={() => {
				cancelEditMode();
				onExitEditMode();
			}}
			onUndo={undo}
			onAddImageLink={addNewIcon}
			onAddApp={openAppPicker}
			onAddWidget={openWidgetPicker}
			onOpenSettings={openSettings}
			selectionCount={selectedIds.size}
			onDeleteSelected={removeSelected}
		/>
	{/if}

	<div
		class="icon-grid"
		class:edit-mode={isEditMode}
		bind:this={gridEl}
		role="application"
		aria-label="Icon grid"
		onpointerdown={handleGridPointerDown}
		onpointermove={handleGridPointerMove}
		onpointerup={handleGridPointerUp}
		style="--grid-size: {gridSize}px;"
	>
		{#if isLoading}
			<div class="loading">Loading apps...</div>
		{:else if icons.length === 0}
			<div class="empty-state">
				<p>No items configured</p>
				<p class="hint">Enter edit mode to add apps, images, or links</p>
			</div>
		{:else}
			{#each icons as icon (icon.id)}
				<div
					class="icon-wrapper"
					style="left: {icon.x}px; top: {icon.y}px; width: {icon.width}px; height: {icon.height}px; z-index: {interactingIds.has(
						icon.id
					)
						? 999
						: (icon.z ?? 0)};"
				>
					{#if icon.icon_type === 'widget'}
						<DraggableWidget
							id={icon.id}
							widgetType={icon.widget_type!}
							config={icon.widget_config}
							x={icon.x}
							y={icon.y}
							width={icon.width}
							height={icon.height}
							keybind={icon.keybind}
							keybindGlobal={icon.keybind_global ?? false}
							{isEditMode}
							{snapToGrid}
							{gridSize}
							selected={selectedIds.has(icon.id)}
							onSelect={handleSelect}
							onStartGroupDrag={startGroupDrag}
							multiDragActive={isMultiDragging}
							onDragStart={handleDragStart}
							onDraggingChange={handleDraggingChange}
							onPositionChange={handlePositionChange}
							onSizeChange={handleSizeChange}
							onConfigChange={handleWidgetConfigChange}
							onBringToFront={bringToFront}
							onSendToBack={sendToBack}
							onKeybindChange={handleKeybindChange}
							onKeybindGlobalChange={handleKeybindGlobalChange}
							onDuplicate={(id: string) => handleDuplicateWidget(id)}
							onRemove={removeIcon}
							{onEnterEditMode}
						/>
					{:else}
						<AppIcon
							{icon}
							{isEditMode}
							{snapToGrid}
							{gridSize}
							selected={selectedIds.has(icon.id)}
							onSelect={handleSelect}
							onStartGroupDrag={startGroupDrag}
							multiDragActive={isMultiDragging}
							onDragStart={handleDragStart}
							onDraggingChange={handleDraggingChange}
							onPositionChange={handlePositionChange}
							onSizeChange={handleSizeChange}
							onIconChange={handleIconChange}
							onBringToFront={bringToFront}
							onSendToBack={sendToBack}
							onRemove={removeIcon}
							onTypeChange={handleTypeChange}
							onOpenSettings={() => openIconSettings(icon.id)}
							onOpenSettingsFromViewMode={() => enterEditModeAndOpenIconSettings(icon.id)}
							{onEnterEditMode}
						/>
					{/if}
				</div>
			{/each}
		{/if}

		{#if isMarquee}
			{@const left = Math.min(marqueeStart.x, marqueeEnd.x)}
			{@const top = Math.min(marqueeStart.y, marqueeEnd.y)}
			{@const width = Math.abs(marqueeEnd.x - marqueeStart.x)}
			{@const height = Math.abs(marqueeEnd.y - marqueeStart.y)}
			<div
				class="marquee-box"
				style="left: {left}px; top: {top}px; width: {width}px; height: {height}px;"
			></div>
		{/if}
	</div>

	<Portal>
		<AppPickerModal bind:isOpen={showAppPicker} onSelect={addAppIcon} />
		<WidgetPickerModal
			bind:isOpen={showWidgetPicker}
			onSelect={addWidget}
			hasTerminal={hasTerminalWidget}
		/>
		<SettingsModal bind:isOpen={showSettings} onApplyPreset={reloadAll} />
		<IconSettingsModal
			bind:isOpen={showIconSettings}
			icon={selectedIcon}
			onSave={() => {}}
			onUpdateIcon={handleIconChange}
			onUpdateUrl={(id, url) => {
				const type = selectedIcon?.icon_type;
				if (type === 'app' || type === 'image' || type === 'link') {
					handleTypeChange(id, type, url);
				}
			}}
			onClearImage={(id) => handleIconChange(id, '')}
			onUpdateShowName={handleShowNameChange}
			onUpdateCustomName={handleCustomNameChange}
			onUpdateFontFamily={handleFontFamilyChange}
			onUpdateFontSize={handleFontSizeChange}
			onUpdateArgs={handleArgsChange}
			onUpdateKeybind={handleKeybindChange}
			onUpdateKeybindGlobal={handleKeybindGlobalChange}
			onUpdateBackground={handleBackgroundChange}
		/>
	</Portal>
</div>

<style>
	.icon-grid-container {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		position: relative;
	}
	.icon-grid {
		flex: 1;
		position: relative;
		overflow: hidden;
		background: transparent;
	}
	.icon-grid.edit-mode {
		background-image:
			linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
			linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
		background-size: var(--grid-size, 40px) var(--grid-size, 40px);
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
	}
	.icon-wrapper {
		position: absolute;
	}
	.loading,
	.empty-state {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		text-align: center;
		color: rgba(255, 255, 255, 0.6);
	}
	.hint {
		font-size: 14px;
		color: rgba(255, 255, 255, 0.4);
		margin-top: 8px;
	}
	.marquee-box {
		position: absolute;
		background: rgba(100, 180, 255, 0.15);
		border: 1px dashed rgba(100, 180, 255, 0.6);
		pointer-events: none;
		/* Above any per-icon z so the selection box is always visible. */
		z-index: 10000;
	}
</style>
