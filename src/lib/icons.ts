// Single source of truth for everything that lives on the canvas grid:
// apps, images, and widgets. Any component or store that deals with a
// grid item imports `CanvasIcon` from here — there must be no local copies.
//
// The shape is intentionally flat (one interface, discriminated by
// `icon_type`). It matches the Rust `AppIcon` struct on the Tauri side, so the
// JSON saved to presets does not change. `path` stays required for that reason:
// Rust expects it on every icon ('' for non-app items).

import type { KeybindConfig } from '$lib/stores/settings.svelte';
import type { WidgetType, WidgetConfigType, WidgetAppearanceConfig } from '$lib/widgets/types';

export type IconType = 'app' | 'image' | 'widget';

export interface CanvasIcon {
	id: string;
	name: string;
	/** App launch path; '' for non-app icons (kept for wire compatibility). */
	path: string;
	icon_path?: string;
	icon_type: IconType;
	widget_type?: WidgetType;
	widget_config?: WidgetConfigType;
	url?: string;
	args?: string;
	keybind?: KeybindConfig;
	keybind_global?: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	show_name?: boolean;
	custom_name?: string | null;
	// Stacking order: higher z renders on top of overlapping items.
	z?: number;
	/**
	 * Icon appearance, sharing the widget appearance system. Unset fields fall
	 * back to the icon defaults resolved in AppIcon.svelte (the canvas-wide
	 * border_radius acts as the default corner radius).
	 */
	appearance?: WidgetAppearanceConfig;
}
