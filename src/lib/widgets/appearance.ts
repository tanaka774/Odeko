import { settingsStore } from '$lib/stores/settings.svelte';
import { DEFAULT_WIDGET_APPEARANCE, type WidgetAppearanceConfig, type WidgetConfig } from './types';

/**
 * The user's global "default icon appearance" from the app settings. This is
 * a TEMPLATE, not a live style layer: it is stamped onto icons when they are
 * created (see IconGrid's creation paths), so changing it only affects icons
 * added afterwards. "Apply to all" pushes it onto existing icons explicitly.
 */
export function getGlobalDefaultAppearance(): Partial<WidgetAppearanceConfig> {
	const stored = settingsStore.settings.default_appearance;
	return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

/**
 * Resolves the effective appearance with this priority:
 *
 *   1. DEFAULT_WIDGET_APPEARANCE (hard-coded base)
 *   2. `fallback` (call-site defaults: per-widget-type look)
 *   3. `config.appearance` (the item's own appearance)
 *
 * The global default appearance is a creation-time template (see
 * getGlobalDefaultAppearance), not a render layer.
 */
export function getWidgetAppearance(
	config?: WidgetConfig,
	fallback: Partial<WidgetAppearanceConfig> = {}
): Required<WidgetAppearanceConfig> {
	return {
		...DEFAULT_WIDGET_APPEARANCE,
		...fallback,
		...config?.appearance
	};
}

// Widget colors can arrive via imported presets, so an unrecognized value is
// never echoed back into a style string — that would let a crafted value
// inject extra CSS declarations. Unknown input falls back to the default.
// Accepted forms: rgb()/rgba() with integer 0-255 channels, 3/6-digit hex,
// and plain "R, G, B" triples.
export function colorWithOpacity(color: string, opacity: number): string {
	const normalizedOpacity = Math.min(1, Math.max(0, opacity));

	const fallback = DEFAULT_WIDGET_APPEARANCE.backgroundColor;

	const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/);
	if (rgbMatch) {
		const parts = rgbMatch[1].split(',').map((part) => part.trim());
		const channels = parts.slice(0, 3).map(Number);
		if (parts.length >= 3 && channels.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
			return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${normalizedOpacity})`;
		}
	}

	if (color.startsWith('#')) {
		let hex = color.slice(1);
		if (hex.length === 3) {
			hex = hex
				.split('')
				.map((character) => character + character)
				.join('');
		}

		if (/^[0-9a-fA-F]{6}$/.test(hex)) {
			const red = parseInt(hex.slice(0, 2), 16);
			const green = parseInt(hex.slice(2, 4), 16);
			const blue = parseInt(hex.slice(4, 6), 16);
			return `rgba(${red}, ${green}, ${blue}, ${normalizedOpacity})`;
		}
	}

	const channels = color.split(',').map((part) => part.trim());
	if (channels.length === 3 && channels.every((c) => /^\d{1,3}$/.test(c))) {
		const nums = channels.map(Number);
		if (nums.every((n) => n >= 0 && n <= 255)) {
			return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${normalizedOpacity})`;
		}
	}

	return fallback;
}

export function getAppearanceBackground(appearance: WidgetAppearanceConfig): string {
	if (!appearance.backgroundColor) return DEFAULT_WIDGET_APPEARANCE.backgroundColor;

	return colorWithOpacity(
		appearance.backgroundColor,
		appearance.backgroundOpacity ?? DEFAULT_WIDGET_APPEARANCE.backgroundOpacity
	);
}

export function getAppearanceBorder(appearance: WidgetAppearanceConfig): string {
	const borderStyle = appearance.borderStyle ?? DEFAULT_WIDGET_APPEARANCE.borderStyle;
	const borderWidth = appearance.borderWidth ?? DEFAULT_WIDGET_APPEARANCE.borderWidth;

	if (borderStyle === 'none' || borderWidth === 0) {
		return 'none';
	}

	return `${borderWidth}px ${borderStyle} ${
		appearance.borderColor ?? DEFAULT_WIDGET_APPEARANCE.borderColor
	}`;
}

export function colorToHexInputValue(color: string | undefined, fallback: string): string {
	if (!color) return fallback;
	if (color.startsWith('#')) return color;

	const match = color.match(/^rgba?\(([^)]+)\)$/);
	if (!match) return fallback;

	const [red, green, blue] = match[1]
		.split(',')
		.slice(0, 3)
		.map((part) => Number(part.trim()));

	if ([red, green, blue].some((part) => Number.isNaN(part))) return fallback;

	return `#${[red, green, blue]
		.map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, '0'))
		.join('')}`;
}
