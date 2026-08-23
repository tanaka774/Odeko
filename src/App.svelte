<script lang="ts">
	import { onMount } from 'svelte';
	import { getCurrentWindow } from '@tauri-apps/api/window';
	import { invoke } from '@tauri-apps/api/core';
	import { listen, type UnlistenFn } from '@tauri-apps/api/event';
	import IconGrid from '$lib/components/IconGrid.svelte';
	import BackgroundVideo from '$lib/components/BackgroundVideo.svelte';
	import { isVideoBackground } from '$lib/background';
	import { shouldIgnoreGlobalShortcut } from '$lib/keyboard';
	import { settingsStore, matchesKeybind } from '$lib/stores/settings.svelte';
	import { platformStore } from '$lib/stores/platform.svelte';
	import { launchIcon, isLaunchable } from '$lib/launch';
	import type { LauncherIcon } from '$lib/icons';
	import { executePowerAction, isPowerActionType } from '$lib/power-control';
	import type { PowerControlWidgetConfig } from '$lib/widgets/types';
	import { safeRgbColor, safeCssUrl } from '$lib/utils';

	let iconGrid: IconGrid;

	let isEditMode = $state(false);

	let showContextMenu = $state(false);
	let contextMenuX = $state(0);
	let contextMenuY = $state(0);

	async function hideLauncher() {
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

		const s = settingsStore.settings;
		if (matchesKeybind(event, s.keybind_hide_launcher)) {
			hideLauncher();
			return;
		}
		if (matchesKeybind(event, s.keybind_toggle_edit)) {
			if (isEditMode) {
				cancelEditMode();
			} else {
				enterEditMode();
			}
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

	function isPowerWidget(icon: LauncherIcon): boolean {
		return icon.icon_type === 'widget' && isPowerActionType(icon.widget_type);
	}

	async function executePowerWidget(icon: LauncherIcon) {
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

	onMount(() => {
		const onResize = () => layoutVersion++;
		window.addEventListener('resize', onResize);

		let unlistenPowerShortcut: UnlistenFn | null = null;
		let disposed = false;

		async function setup() {
			const window = getCurrentWindow();
			await platformStore.load();
			window.show();
			window.setFocus();
			await settingsStore.loadSettings();
			invoke('update_global_shortcut', {
				keybind: settingsStore.settings.keybind_toggle_launcher
			});
			const icons = settingsStore.getCurrentIcons();
			invoke('update_icon_shortcuts', { icons });

			const unlisten = await listen<string>('power-widget-shortcut', async (event) => {
				await executePowerWidgetById(event.payload);
			});

			if (disposed) {
				unlisten();
			} else {
				unlistenPowerShortcut = unlisten;
			}
		}

		void setup();

		return () => {
			window.removeEventListener('resize', onResize);
			disposed = true;
			unlistenPowerShortcut?.();
		};
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

	// The launcher panel element, so the "light" blur can follow its bounds.
	let launcherOverlayEl = $state<HTMLElement | null>(null);
	// Bumped on window resizes so the blur region follows the panel.
	let layoutVersion = $state(0);

	// Keeps the native backdrop blur in sync with the settings: on/off,
	// strength, and the launcher panel's rectangle. The rectangle is used for
	// the "light" strength (blur only the panel) and to keep the panel out of
	// the blur when it plays a video (opaque, and re-blurring below a video
	// every frame is expensive).
	$effect(() => {
		const settings = settingsStore.settings;
		// Tracked dependencies: re-run on window resizes (layoutVersion) and
		// when the launcher panel moves or resizes (the geometry settings),
		// so the anchored modals keep following the panel.
		void layoutVersion;
		void settings.width_percent;
		void settings.height_percent;
		void settings.position_x;
		void settings.position_y;
		if (!launcherOverlayEl) return;

		const rect = launcherOverlayEl.getBoundingClientRect();
		// Center of the launcher panel as an offset from the screen center,
		// consumed by the modals' anchor transform (see SettingsModalShell).
		const rootStyle = document.documentElement.style;
		rootStyle.setProperty('--launcher-dx', `${rect.x + rect.width / 2 - window.innerWidth / 2}px`);
		rootStyle.setProperty(
			'--launcher-dy',
			`${rect.y + rect.height / 2 - window.innerHeight / 2}px`
		);
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
	let backgroundIsVideo = $derived(isVideoBackground(settingsStore.settings.background_image));
	let backgroundRgb = $derived(safeRgbColor(settingsStore.settings.background_color, '20, 20, 30'));
	let backgroundImageUrl = $derived(safeCssUrl(settingsStore.settings.background_image));

	let launcherStyles = $derived({
		width: `${settingsStore.settings.width_percent}%`,
		height: `${settingsStore.settings.height_percent}%`,
		// Video backgrounds are painted by <BackgroundVideo>, so the overlay
		// itself stays transparent and skips the CSS image layers.
		backgroundColor: settingsStore.settings.background_image
			? 'transparent'
			: `rgba(${backgroundRgb}, ${settingsStore.settings.background_opacity})`,
		backgroundImage:
			backgroundImageUrl && !backgroundIsVideo
				? `linear-gradient(rgba(${backgroundRgb}, ${settingsStore.settings.background_opacity}), rgba(${backgroundRgb}, ${settingsStore.settings.background_opacity})), url("${backgroundImageUrl}")`
				: 'none',
		backgroundSize: settingsStore.settings.background_image
			? `cover, ${getBackgroundSize(settingsStore.settings.background_size)}`
			: 'cover',
		backgroundRepeat: settingsStore.settings.background_image
			? `no-repeat, ${settingsStore.settings.background_repeat ? 'repeat' : 'no-repeat'}`
			: 'no-repeat',
		backgroundPosition: settingsStore.settings.background_image
			? `center, ${settingsStore.settings.background_position}`
			: 'center',
		borderRadius: `${settingsStore.settings.border_radius}px`
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<main
	class="launcher-container"
	class:macos-compositor-safe={platformStore.isMacos}
	onclick={hideLauncher}
>
	<!-- Backdrop layer: dark overlay behind the launcher. -->
	<div
		class="backdrop"
		style:background="rgba(0, 0, 0, {settingsStore.settings.backdrop_darkness})"
	></div>

	<!-- Launcher overlay -->
	<div
		bind:this={launcherOverlayEl}
		class="launcher-overlay"
		onclick={(e) => e.stopPropagation()}
		oncontextmenu={handleOverlayContextMenu}
		style:width={launcherStyles.width}
		style:height={launcherStyles.height}
		style:background-color={launcherStyles.backgroundColor}
		style:background-image={launcherStyles.backgroundImage}
		style:background-size={launcherStyles.backgroundSize}
		style:background-repeat={launcherStyles.backgroundRepeat}
		style:background-position={launcherStyles.backgroundPosition}
		style:border-radius={launcherStyles.borderRadius}
		style:left="{settingsStore.settings.position_x}%"
		style:top="{settingsStore.settings.position_y}%"
		style:transform="translate(-{settingsStore.settings.position_x}%, -{settingsStore.settings
			.position_y}%)"
	>
		{#if backgroundIsVideo && settingsStore.settings.background_image}
			<BackgroundVideo
				src={settingsStore.settings.background_image}
				fit={settingsStore.settings.background_size}
				position={settingsStore.settings.background_position}
				tintColor={backgroundRgb}
				tintOpacity={settingsStore.settings.background_opacity}
			/>
		{/if}

		{#if isEditMode}
			<button onclick={cancelEditMode} class="close-btn" aria-label="Exit edit mode">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		{/if}

		<div class="launcher-content">
			<IconGrid
				bind:this={iconGrid}
				{isEditMode}
				onEnterEditMode={enterEditMode}
				onExitEditMode={() => {
					isEditMode = false;
				}}
			/>
		</div>

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
	.launcher-container {
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
	}

	.launcher-overlay {
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: absolute;
		z-index: 1;
	}

	.close-btn {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 100;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 8px;
		padding: 6px;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: rgba(255, 100, 100, 0.3);
		color: white;
	}

	.launcher-content {
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
