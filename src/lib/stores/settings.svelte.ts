import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { backgroundFilePath, isVideoBackground } from '$lib/background';
import type { LauncherIcon } from '$lib/icons';
import type { WidgetAppearanceConfig } from '$lib/widgets/types';

export interface KeybindConfig {
	key: string;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	meta: boolean;
}

export const DEFAULT_KEYBINDS = {
	toggle_launcher: { key: 'KeyZ', ctrl: false, alt: true, shift: false, meta: true },
	toggle_edit: { key: 'F2', ctrl: false, alt: false, shift: false, meta: false },
	hide_launcher: { key: 'Escape', ctrl: false, alt: false, shift: false, meta: false },
	undo: { key: 'KeyZ', ctrl: true, alt: false, shift: false, meta: false }
} as const;

export function keybindToString(kb: KeybindConfig): string {
	const parts: string[] = [];
	if (kb.ctrl) parts.push('Ctrl');
	if (kb.alt) parts.push('Alt');
	if (kb.shift) parts.push('Shift');
	if (kb.meta) parts.push('Win');
	const displayKey = kb.key.startsWith('Key') ? kb.key.slice(3) : kb.key;
	parts.push(displayKey);
	return parts.join(' + ');
}

export function eventToKeybind(event: KeyboardEvent): KeybindConfig {
	return {
		key: event.code,
		ctrl: event.ctrlKey,
		alt: event.altKey,
		shift: event.shiftKey,
		meta: event.metaKey
	};
}

export function matchesKeybind(event: KeyboardEvent, kb: KeybindConfig): boolean {
	return (
		event.code === kb.key &&
		event.ctrlKey === kb.ctrl &&
		event.altKey === kb.alt &&
		event.shiftKey === kb.shift &&
		event.metaKey === kb.meta
	);
}

export function keybindEquals(a: KeybindConfig, b: KeybindConfig): boolean {
	return (
		a.key === b.key &&
		a.ctrl === b.ctrl &&
		a.alt === b.alt &&
		a.shift === b.shift &&
		a.meta === b.meta
	);
}

export interface KeybindConflictCheckOptions {
	/** Icon id to exclude from the "other icons" check (the icon being edited). */
	excludeIconId?: string;
	/** App-level keybinds to check against (from LauncherSettings). */
	appKeybinds: {
		toggle_launcher: KeybindConfig;
		toggle_edit: KeybindConfig;
		hide_launcher: KeybindConfig;
		undo: KeybindConfig;
	};
	/** Other icons' currently-assigned keybinds. */
	icons: { id: string; name: string; custom_name?: string | null; keybind?: KeybindConfig }[];
}

export const APP_KEYBIND_LABELS = {
	toggle_launcher: 'Toggle Launcher',
	toggle_edit: 'Toggle Edit',
	hide_launcher: 'Hide Launcher',
	undo: 'Undo'
} as const;

export function findKeybindConflict(
	kb: KeybindConfig,
	opts: KeybindConflictCheckOptions
): string | null {
	if (!kb.key) return null;
	const { appKeybinds, excludeIconId, icons } = opts;
	for (const name of Object.keys(appKeybinds) as (keyof typeof appKeybinds)[]) {
		const entry = appKeybinds[name];
		if (entry.key && keybindEquals(entry, kb)) {
			return `Conflicts with app keybind: ${APP_KEYBIND_LABELS[name]}`;
		}
	}
	for (const icon of icons) {
		if (!icon || icon.id === excludeIconId) continue;
		if (icon.keybind && icon.keybind.key && keybindEquals(icon.keybind, kb)) {
			return `Conflicts with keybind on "${icon.custom_name ?? icon.name}"`;
		}
	}
	return null;
}

export interface LauncherSettings {
	width_percent: number;
	height_percent: number;
	background_color: string;
	background_opacity: number;
	background_image: string | null;
	background_size: 'cover' | 'contain' | 'stretch';
	background_repeat: boolean;
	background_position:
		| 'center'
		| 'top'
		| 'bottom'
		| 'left'
		| 'right'
		| 'top left'
		| 'top right'
		| 'bottom left'
		| 'bottom right';
	// The real blur behind the window is applied natively by the Rust side
	// (src-tauri/src/window_effects.rs); these values only style the panel.
	border_radius: number;
	backdrop_darkness: number;
	/** Native backdrop blur behind the window (applied by the Rust side). */
	backdrop_blur: boolean;
	/**
	 * How strong the backdrop blur is: `light` blurs only the launcher panel
	 * area (desktop stays visible), `full` blurs the whole screen.
	 */
	blur_strength: 'light' | 'full';
	position_x: number;
	position_y: number;
	magnetic_snap: boolean;
	grid_size: number;
	/** Grid line color in "R, G, B" format (edit mode only). */
	grid_line_color: string;
	keybind_toggle_launcher: KeybindConfig;
	keybind_toggle_edit: KeybindConfig;
	keybind_hide_launcher: KeybindConfig;
	keybind_undo: KeybindConfig;
	/** App-wide allowed hostnames for Custom HTML widgets (see network-bridge). */
	network_grants: string[];
	/** Allow Custom HTML widgets to fetch from private/LAN addresses. */
	allow_local_network: boolean;
	/**
	 * Default appearance template stamped onto new icons and widgets at
	 * creation; changing it never restyles existing items. Stored as a partial
	 * config: only fields the user touched are present. Custom CSS keys are
	 * stripped on load (per-item by design; imported presets are untrusted).
	 */
	default_appearance?: WidgetAppearanceConfig;
}

export interface LauncherLayout {
	icons: unknown[];
	settings: LauncherSettings;
	active_preset: string | null;
}

const DEFAULT_SETTINGS: LauncherSettings = {
	width_percent: 90,
	height_percent: 85,
	background_color: '20, 20, 30',
	background_opacity: 0.75,
	background_image: null,
	background_size: 'cover',
	background_repeat: false,
	background_position: 'center',
	border_radius: 24,
	backdrop_darkness: 0.3,
	backdrop_blur: true,
	blur_strength: 'full',
	position_x: 50,
	position_y: 50,
	magnetic_snap: true,
	grid_size: 40,
	grid_line_color: '255, 255, 255',
	keybind_toggle_launcher: { ...DEFAULT_KEYBINDS.toggle_launcher },
	keybind_toggle_edit: { ...DEFAULT_KEYBINDS.toggle_edit },
	keybind_hide_launcher: { ...DEFAULT_KEYBINDS.hide_launcher },
	keybind_undo: { ...DEFAULT_KEYBINDS.undo },
	network_grants: [],
	allow_local_network: false,
	// Matches the legacy launcher border_radius so item corners look the same
	// before settings load; border_radius now styles only the panel/chrome.
	default_appearance: { borderRadius: 24 }
};

function createSettingsStore() {
	let settings = $state<LauncherSettings>({ ...DEFAULT_SETTINGS });
	let activePreset = $state<string | null>(null);
	let isLoaded = $state(false);
	let _currentIcons = $state<LauncherIcon[]>([]);

	function applyDefaults(loadedSettings: LauncherSettings): LauncherSettings {
		const merged = { ...DEFAULT_SETTINGS, ...loadedSettings };
		if (!merged.grid_line_color?.trim()) merged.grid_line_color = DEFAULT_SETTINGS.grid_line_color;
		if (!merged.keybind_toggle_launcher.key)
			merged.keybind_toggle_launcher = { ...DEFAULT_KEYBINDS.toggle_launcher };
		if (!merged.keybind_toggle_edit.key)
			merged.keybind_toggle_edit = { ...DEFAULT_KEYBINDS.toggle_edit };
		if (!merged.keybind_hide_launcher.key)
			merged.keybind_hide_launcher = { ...DEFAULT_KEYBINDS.hide_launcher };
		if (!merged.keybind_undo.key) merged.keybind_undo = { ...DEFAULT_KEYBINDS.undo };

		// The default appearance must stay a plain object (Rust round-trips it
		// as JSON, so it may arrive as null from older files). Custom CSS keys
		// are never honored here — they are per-item by design and imported
		// presets are untrusted input.
		const appearance = merged.default_appearance;
		const sanitized: WidgetAppearanceConfig =
			appearance && typeof appearance === 'object' && !Array.isArray(appearance)
				? { ...appearance }
				: {};
		delete sanitized.customCss;
		delete sanitized.customCssEnabled;
		if (typeof sanitized.fontSize === 'number' && Number.isFinite(sanitized.fontSize)) {
			sanitized.fontSize = Math.min(96, Math.max(6, sanitized.fontSize));
		} else {
			delete sanitized.fontSize;
		}
		if (typeof sanitized.fontFamily === 'string' && sanitized.fontFamily.trim()) {
			sanitized.fontFamily = sanitized.fontFamily.trim();
		} else {
			delete sanitized.fontFamily;
		}
		// Legacy files have no item corner radius (it used to follow the
		// launcher-wide border_radius), so seed it from there once.
		if (sanitized.borderRadius == null) {
			sanitized.borderRadius = merged.border_radius;
		}
		merged.default_appearance = sanitized;
		return merged;
	}

	function convertBackgroundImage(loadedSettings: LauncherSettings) {
		const background = loadedSettings.background_image;
		if (!background) return loadedSettings;

		if (isVideoBackground(background)) {
			// Videos are read through the fs plugin (the asset protocol cannot
			// stream media on Linux/WebKitGTK), so they must keep a plain
			// filesystem path. Legacy asset:// video URLs are normalized back
			// to plain paths here.
			const filePath = backgroundFilePath(background);
			if (filePath) {
				loadedSettings.background_image = filePath;
			}
			return loadedSettings;
		}

		if (
			!background.startsWith('http') &&
			!background.startsWith('data:') &&
			!background.startsWith('asset:')
		) {
			loadedSettings.background_image = convertFileSrc(background);
		}
		return loadedSettings;
	}

	async function loadSettings() {
		try {
			const layout = await invoke<LauncherLayout>('load_active_layout');
			if (layout.settings) {
				settings = convertBackgroundImage(applyDefaults(layout.settings));
			}
			activePreset = layout.active_preset ?? null;
			isLoaded = true;
		} catch (error) {
			console.error('Failed to load settings:', error);
			isLoaded = true;
		}
	}

	// Persists only the global settings to the active preset, leaving the
	// icons on disk untouched. Icon changes are saved separately by the
	// edit-mode session (see IconGrid.saveLayout).
	async function saveSettings() {
		try {
			const name = await invoke<string>('save_active_settings', {
				settings: { ...settings }
			});
			if (name) {
				activePreset = name;
			}
		} catch (error) {
			console.error('Failed to save settings:', error);
		}
		// The native backdrop blur is synced by App.svelte (it knows the
		// launcher panel's position for the "light" strength).
	}

	function applyLayout(layout: LauncherLayout) {
		if (layout.settings) {
			settings = convertBackgroundImage(applyDefaults(layout.settings));
		}
		activePreset = layout.active_preset ?? null;
		isLoaded = true;
	}

	function updateSettings(newSettings: Partial<LauncherSettings>) {
		settings = { ...settings, ...newSettings };
	}

	function resetToDefaults() {
		settings = { ...DEFAULT_SETTINGS };
		activePreset = null;
	}

	function setActivePreset(name: string | null) {
		activePreset = name;
	}

	function setCurrentIcons(icons: LauncherIcon[]) {
		_currentIcons = icons;
	}

	function getCurrentIcons(): LauncherIcon[] {
		return _currentIcons;
	}

	return {
		get settings() {
			return settings;
		},
		get activePreset() {
			return activePreset;
		},
		get isLoaded() {
			return isLoaded;
		},
		loadSettings,
		saveSettings,
		applyLayout,
		updateSettings,
		resetToDefaults,
		setActivePreset,
		setCurrentIcons,
		getCurrentIcons
	};
}

export const settingsStore = createSettingsStore();
