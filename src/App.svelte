<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { invoke } from '@tauri-apps/api/core';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import { confirm } from '@tauri-apps/plugin-dialog';
	import IconGrid from '$lib/components/IconGrid.svelte';
	import BackgroundVideo from '$lib/components/BackgroundVideo.svelte';
	import ToastStack from '$lib/components/ToastStack.svelte';
	import { isVideoBackground } from '$lib/background';
	import { shouldIgnoreGlobalShortcut } from '$lib/keyboard';
	import { settingsStore, matchesKeybind } from '$lib/stores/settings.svelte';
	import { platformStore } from '$lib/stores/platform.svelte';
	import { toastStore, errorMessage } from '$lib/stores/toast.svelte';
	import { launchIcon, isLaunchable } from '$lib/launch';
	import type { CanvasIcon } from '$lib/icons';
	import { executePowerAction, isPowerActionType } from '$lib/power-control';
	import type { PowerControlWidgetConfig } from '$lib/widgets/types';
	import { safeRgbColor, safeCssUrl } from '$lib/utils';
	import { listPresets, flushPresetCommit } from '$lib/presets';
	import { presetPrefs } from '$lib/preset-prefs.svelte';
	import { presetTransition } from '$lib/preset-transition.svelte';

	let iconGrid: IconGrid;

	let isEditMode = $state(false);

	let showContextMenu = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);

	async function hideCanvas() {
		const window = getCurrentWindow();
		await window.hide();
	}

	function enterEditMode() {
		iconGrid?.enterEditMode();
		isEditMode = true;
	}

	async function saveAndExit() {
		await iconGrid?.saveAndExit();
		isEditMode = false;
	}

	function cancelEditMode() {
		iconGrid?.cancelEditMode();
		isEditMode = false;
	}

	async function handleKeydown(event: KeyboardEvent) {
		if (shouldIgnoreGlobalShortcut(event)) return;

		// Escape closes an open desktop context menu before falling through
		// to the hide-canvas keybind.
		if (showContextMenu && event.key === 'Escape') {
			closeContextMenu();
			return;
		}

		const s = settingsStore.settings;
		if (matchesKeybind(event, s.keybind_hide_canvas)) {
			hideCanvas();
			return;
		}
		if (matchesKeybind(event, s.keybind_toggle_edit)) {
			if (isEditMode) {
				await saveAndExit();
			} else {
				enterEditMode();
			}
			return;
		}
		if (matchesKeybind(event, s.keybind_next_preset)) {
			event.preventDefault();
			await cyclePreset(1);
			return;
		}
		if (matchesKeybind(event, s.keybind_prev_preset)) {
			event.preventDefault();
			await cyclePreset(-1);
			return;
		}
		if (matchesKeybind(event, s.keybind_last_preset)) {
			event.preventDefault();
			await switchToLastPreset();
			return;
		}

		// Slots that are not registered with the OS are handled here, while
		// the canvas has focus.
		const slotIndex = presetPrefs.slots.findIndex(
			(slot) =>
				!slot.global && slot.name && slot.keybind?.key && matchesKeybind(event, slot.keybind)
		);
		if (slotIndex !== -1) {
			event.preventDefault();
			await activateSlot(slotIndex);
			return;
		}

		if (!isEditMode) {
			const icons = settingsStore.getCurrentIcons();
			for (const icon of icons) {
				if (icon.keybind_global) continue;
				if (icon.keybind?.key && isLaunchable(icon) && matchesKeybind(event, icon.keybind)) {
					event.preventDefault();
					await launchIcon(icon);
					return;
				}
			}

			for (const icon of icons) {
				if (icon.keybind_global) continue;
				if (icon.keybind?.key && isPowerWidget(icon) && matchesKeybind(event, icon.keybind)) {
					event.preventDefault();
					await executePowerWidget(icon);
					return;
				}
			}
		}
	}

	function isPowerWidget(icon: CanvasIcon): boolean {
		return icon.icon_type === 'widget' && isPowerActionType(icon.widget_type);
	}

	async function switchToPreset(name: string) {
		await iconGrid?.applyPresetByName(name);
	}

	/** Step through the presets in list order, wrapping at both ends. */
	async function cyclePreset(step: number) {
		const presets = await listPresets();
		if (presets.length === 0) return;
		const current = settingsStore.activePreset;
		const index = presets.findIndex((preset) => preset.name === current);
		const next =
			index === -1
				? step > 0
					? 0
					: presets.length - 1
				: (index + step + presets.length) % presets.length;
		await switchToPreset(presets[next].name);
	}

	async function switchToLastPreset() {
		const target = presetPrefs.lastPreset;
		if (!target || target === settingsStore.activePreset) return;
		await switchToPreset(target);
	}

	async function activateSlot(index: number) {
		const name = presetPrefs.slots[index]?.name;
		if (!name) return;
		await switchToPreset(name);
	}

	async function executePowerWidget(icon: CanvasIcon) {
		if (!isPowerActionType(icon.widget_type)) return;
		const config = icon.widget_config as PowerControlWidgetConfig | undefined;
		await executePowerAction(icon.widget_type, config?.requireConfirmation ?? true);
	}

	async function executePowerWidgetById(id: string) {
		const icon = settingsStore.getCurrentIcons().find((entry) => entry.id === id);
		if (icon && isPowerWidget(icon)) {
			await executePowerWidget(icon);
		}
	}

	function handleOverlayContextMenu(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		const overlay = event.currentTarget as HTMLElement;
		const rect = overlay.getBoundingClientRect();
		contextMenuX = event.clientX - rect.left;
		contextMenuY = event.clientY - rect.top;
		showContextMenu = true;
	}

	function closeContextMenu() {
		showContextMenu = false;
	}

	/** Offers to install a newer release when one is published. */
	async function checkForUpdatesOnStartup() {
		try {
			const { checkForUpdate, installUpdate } = await import('$lib/updater');
			const update = await checkForUpdate();
			if (!update) return;

			const accepted = await confirm(
				`Odeko ${update.version} is available (you have ${update.currentVersion}).\n\nInstall it now? Odeko will restart.`,
				{ title: 'Update available', kind: 'info' }
			);
			if (!accepted) return;

			toastStore.show('Installing update…', `Odeko ${update.version}`);
			await installUpdate(update);
		} catch (error) {
			// Offline or nothing published yet: not worth a toast.
			console.warn('Update check failed:', errorMessage(error));
		}
	}

	onMount(() => {
		const onResize = () => layoutVersion++;
		window.addEventListener('resize', onResize);

		// Both preset writes are debounced; quitting right after a switch must
		// not lose it.
		const flushPendingPresetWrites = () => {
			void flushPresetCommit();
			void presetPrefs.flush();
		};
		window.addEventListener('beforeunload', flushPendingPresetWrites);

		let unlistenPowerShortcut: UnlistenFn | null = null;
		let unlistenLaunchError: UnlistenFn | null = null;
		let unlistenSlotShortcut: UnlistenFn | null = null;
		let disposed = false;

		async function setup() {
			const window = getCurrentWindow();
			await platformStore.load();
			window.show();
			window.setFocus();
			await settingsStore.loadSettings();
			await presetPrefs.load();
			invoke('update_global_shortcut', {
				keybind: settingsStore.settings.keybind_toggle_canvas
			});
			const icons = settingsStore.getCurrentIcons();
			invoke('update_icon_shortcuts', { icons });

			void checkForUpdatesOnStartup();

			const unlisten = await listen<string>('power-widget-shortcut', async (event) => {
				await executePowerWidgetById(event.payload);
			});

			const unlistenSlot = await listen<number>('preset-slot-shortcut', async (event) => {
				await activateSlot(event.payload);
			});

			// Global-shortcut launches have no Result to await, so the backend
			// reports failures as an event. Show it instead of leaving the
			// canvas looking like the hotkey did nothing (#3).
			const unlistenError = await listen<{
				name?: string;
				path?: string;
				message?: string;
			}>('launch-error', (event) => {
				const { name, path, message } = event.payload ?? {};
				const label = name?.trim() || path || 'This icon';
				toastStore.show(`Could not launch ${label}`, message || path);
			});

			if (disposed) {
				unlisten();
				unlistenError();
				unlistenSlot();
			} else {
				unlistenPowerShortcut = unlisten;
				unlistenLaunchError = unlistenError;
				unlistenSlotShortcut = unlistenSlot;
			}
		}

		void setup();

		return () => {
			window.removeEventListener('resize', onResize);
			window.removeEventListener('beforeunload', flushPendingPresetWrites);
			disposed = true;
			unlistenPowerShortcut?.();
			unlistenLaunchError?.();
			unlistenSlotShortcut?.();
		};
	});

	// Slot keybinds marked "global" are registered with the OS, so they fire
	// even when the canvas does not have focus.
	$effect(() => {
		const globalSlots = presetPrefs.slots.flatMap((slot, index) =>
			slot.global && slot.name && slot.keybind?.key ? [{ index, keybind: slot.keybind }] : []
		);
		invoke('update_preset_slot_shortcuts', { slots: globalSlots }).catch((error) =>
			console.error('Failed to register preset slot shortcuts:', error)
		);
	});

	function getBackgroundSize(size: 'cover' | 'contain' | 'stretch'): string {
		switch (size) {
			case 'stretch':
				return '100% 100%';
			case 'contain':
				return 'contain';
			case 'cover':
			default:
				return 'cover';
		}
	}

	// The canvas panel element, so the "light" blur can follow its bounds.
	let canvasPanelEl = $state<HTMLElement | null>(null);
	// Bumped on window resizes so the blur region follows the panel.
	let layoutVersion = $state(0);

	// Keeps the native backdrop blur in sync with the settings: on/off,
	// strength, and the canvas panel's rectangle. The rectangle is used for
	// the "light" strength (blur only the panel) and to keep the panel out of
	// the blur when it plays a video (opaque, and re-blurring below a video
	// every frame is expensive).
	$effect(() => {
		const settings = settingsStore.settings;
		// Tracked dependencies: re-run on window resizes (layoutVersion) and
		// when the canvas panel moves or resizes (the geometry settings),
		// so the anchored modals keep following the panel.
		void layoutVersion;
		void settings.width_percent;
		void settings.height_percent;
		void settings.position_x;
		void settings.position_y;
		if (!canvasPanelEl) return;

		const rect = canvasPanelEl.getBoundingClientRect();
		// Center of the canvas panel as an offset from the screen center,
		// consumed by the modals' anchor transform (see SettingsModalShell).
		const rootStyle = document.documentElement.style;
		rootStyle.setProperty('--canvas-dx', `${rect.x + rect.width / 2 - window.innerWidth / 2}px`);
		rootStyle.setProperty('--canvas-dy', `${rect.y + rect.height / 2 - window.innerHeight / 2}px`);
		const enabled = settings.backdrop_blur;
		const strength = settings.blur_strength;
		const region = enabled ? [rect.x, rect.y, rect.width, rect.height] : null;

		// Tauri commands take camelCase argument names on the JS side
		// (exclude_panel -> excludePanel).
		invoke('set_backdrop_blur', {
			enabled,
			strength,
			region,
			excludePanel: backgroundIsVideo
		}).catch((error) => console.error('Failed to apply backdrop blur:', error));
	});

	// Style strings below interpolate settings values that can arrive via
	// imported presets, so colors and the background URL are scrubbed first
	// (safeRgbColor/safeCssUrl) to prevent CSS injection.
	//
	// During a preset switch the panel keeps painting the outgoing background
	// while an overlay fades the incoming one in; the geometry (size, position,
	// radius, darkness) tweens towards the target from the start. Both flip to
	// the store when the switch settles, which shows the same pixels the
	// overlay was already showing.
	let displaySettings = $derived(
		presetTransition.active && presetTransition.from
			? presetTransition.from.settings
			: settingsStore.settings
	);
	let geometrySettings = $derived(
		presetTransition.active && presetTransition.to
			? presetTransition.to.settings
			: settingsStore.settings
	);
	let incomingSettings = $derived(
		presetTransition.active && presetTransition.to ? presetTransition.to.settings : null
	);

	let backgroundIsVideo = $derived(isVideoBackground(displaySettings.background_image));
	let backgroundRgb = $derived(safeRgbColor(displaySettings.background_color, '20, 20, 30'));
	let backgroundImageUrl = $derived(safeCssUrl(displaySettings.background_image));

	function backgroundLayers(target: typeof displaySettings, rgb: string, url: string | null) {
		const isVideo = isVideoBackground(target.background_image);
		return {
			backgroundColor: target.background_image
				? 'transparent'
				: `rgba(${rgb}, ${target.background_opacity})`,
			backgroundImage:
				url && !isVideo
					? `linear-gradient(rgba(${rgb}, ${target.background_opacity}), rgba(${rgb}, ${target.background_opacity})), url("${url}")`
					: 'none',
			backgroundSize: target.background_image
				? `cover, ${getBackgroundSize(target.background_size)}`
				: 'cover',
			backgroundRepeat: target.background_image
				? `no-repeat, ${target.background_repeat ? 'repeat' : 'no-repeat'}`
				: 'no-repeat',
			backgroundPosition: target.background_image
				? `center, ${target.background_position}`
				: 'center'
		};
	}

	// Videos are painted by <BackgroundVideo> with their own twin-element
	// pipeline, so a switch involving one falls back to a plain swap behind the
	// icon fade instead of a background crossfade.
	let incomingBackground = $derived(
		incomingSettings && !isVideoBackground(incomingSettings.background_image) && !backgroundIsVideo
			? backgroundLayers(
					incomingSettings,
					safeRgbColor(incomingSettings.background_color, '20, 20, 30'),
					safeCssUrl(incomingSettings.background_image)
				)
			: null
	);

	// Mount the overlay transparent, then flip it on the next frame so the CSS
	// transition runs over the whole switch.
	let overlayShown = $state(false);
	$effect(() => {
		if (!incomingBackground) {
			overlayShown = false;
			return;
		}
		overlayShown = false;
		const frame = requestAnimationFrame(() => {
			overlayShown = true;
		});
		return () => cancelAnimationFrame(frame);
	});

	let canvasStyles = $derived({
		...backgroundLayers(displaySettings, backgroundRgb, backgroundImageUrl),
		width: `${geometrySettings.width_percent}%`,
		height: `${geometrySettings.height_percent}%`,
		borderRadius: `${geometrySettings.border_radius}px`
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<main
	class="canvas-container"
	class:macos-compositor-safe={platformStore.isMacos}
	onclick={hideCanvas}
>
	<!-- Backdrop layer: dark overlay behind the canvas. -->
	<div
		class="backdrop"
		style:background="rgba(0, 0, 0, {geometrySettings.backdrop_darkness})"
	></div>

	<!-- Canvas panel -->
	<div
		bind:this={canvasPanelEl}
		class="canvas-panel"
		onclick={(e) => e.stopPropagation()}
		oncontextmenu={handleOverlayContextMenu}
		style:width={canvasStyles.width}
		style:height={canvasStyles.height}
		style:background-color={canvasStyles.backgroundColor}
		style:background-image={canvasStyles.backgroundImage}
		style:background-size={canvasStyles.backgroundSize}
		style:background-repeat={canvasStyles.backgroundRepeat}
		style:background-position={canvasStyles.backgroundPosition}
		style:border-radius={canvasStyles.borderRadius}
		style:left="{geometrySettings.position_x}%"
		style:top="{geometrySettings.position_y}%"
		style:transform="translate(-{geometrySettings.position_x}%, -{geometrySettings.position_y}%)"
		style:--preset-duration="{presetTransition.outMs + presetTransition.inMs}ms"
	>
		{#if incomingBackground}
			<div
				class="background-incoming"
				class:shown={overlayShown}
				class:slide={presetTransition.style === 'slide'}
				class:zoom={presetTransition.style === 'zoom'}
				style:background-color={incomingBackground.backgroundColor}
				style:background-image={incomingBackground.backgroundImage}
				style:background-size={incomingBackground.backgroundSize}
				style:background-repeat={incomingBackground.backgroundRepeat}
				style:background-position={incomingBackground.backgroundPosition}
			></div>
		{/if}

		{#if backgroundIsVideo && displaySettings.background_image}
			<BackgroundVideo
				src={displaySettings.background_image}
				fit={displaySettings.background_size}
				position={displaySettings.background_position}
				tintColor={backgroundRgb}
				tintOpacity={displaySettings.background_opacity}
			/>
		{/if}

		<div class="canvas-content">
			<IconGrid
				bind:this={iconGrid}
				{isEditMode}
				onEnterEditMode={enterEditMode}
				onExitEditMode={() => {
					isEditMode = false;
				}}
			/>
		</div>

		<ToastStack />

		{#if showContextMenu}
			<div
				class="context-menu-backdrop"
				onclick={closeContextMenu}
				oncontextmenu={(e) => {
					e.preventDefault();
					closeContextMenu();
				}}
			></div>
			<div class="context-menu" style="left: {contextMenuX}px; top: {contextMenuY}px;">
				{#if isEditMode}
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							saveAndExit();
						}}
					>
						Save & Exit
					</button>
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							cancelEditMode();
						}}
					>
						Cancel
					</button>
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							iconGrid?.undo();
						}}
					>
						Undo
					</button>
					<div class="context-menu-divider"></div>
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							iconGrid?.addNewIcon();
						}}
					>
						Add Image/Link
					</button>
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							iconGrid?.openAppPicker();
						}}
					>
						Add App
					</button>
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							iconGrid?.openWidgetPicker();
						}}
					>
						Add Widget
					</button>
					<div class="context-menu-divider"></div>
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							iconGrid?.openSettings();
						}}
					>
						Settings
					</button>
				{:else}
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							enterEditMode();
							iconGrid?.openSettings();
						}}
					>
						Open Settings
					</button>
					<button
						class="context-menu-item"
						onclick={() => {
							closeContextMenu();
							enterEditMode();
						}}
					>
						Enter Edit Mode
					</button>
				{/if}
			</div>
		{/if}
	</div>
</main>

<style>
	.canvas-container {
		width: 100vw;
		height: 100vh;
		background: transparent;
		position: relative;
	}

	.backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
		pointer-events: none;
		transition: background var(--preset-duration, 260ms) ease;
	}

	.canvas-panel {
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: absolute;
		z-index: 1;
		/* Panel geometry eases towards the incoming preset while its content
		   crossfades, so a preset that resizes does not snap at the end. */
		transition:
			width var(--preset-duration, 260ms) ease,
			height var(--preset-duration, 260ms) ease,
			left var(--preset-duration, 260ms) ease,
			top var(--preset-duration, 260ms) ease,
			transform var(--preset-duration, 260ms) ease,
			border-radius var(--preset-duration, 260ms) ease;
	}

	/* Incoming preset background, crossfaded over the outgoing one. */
	.background-incoming {
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0;
		transition:
			opacity var(--preset-duration, 260ms) ease,
			transform var(--preset-duration, 260ms) ease;
	}
	.background-incoming.shown {
		opacity: 1;
	}
	.background-incoming.slide {
		transform: translateX(2.5%);
	}
	.background-incoming.slide.shown {
		transform: none;
	}
	.background-incoming.zoom {
		transform: scale(1.03);
	}
	.background-incoming.zoom.shown {
		transform: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.backdrop,
		.canvas-panel,
		.background-incoming {
			transition: none;
		}
	}

	.canvas-content {
		flex: 1;
		padding: 0;
		overflow: hidden;
		position: relative;
	}

	.context-menu-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 998;
	}

	.context-menu {
		position: absolute;
		background: rgba(30, 30, 40, 0.95);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
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

	.context-menu-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 4px 0;
	}
</style>
