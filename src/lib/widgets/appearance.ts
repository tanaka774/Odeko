import { DEFAULT_WIDGET_APPEARANCE, type WidgetAppearanceConfig, type WidgetConfig } from './types';

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

export function colorWithOpacity(color: string, opacity: number): string {
	const normalizedOpacity = Math.min(1, Math.max(0, opacity));

	const rgbMatch = color.match(/^rgba?\(([^)]+)\)$/);
	if (rgbMatch) {
		const parts = rgbMatch[1].split(',').map((part) => part.trim());
		if (parts.length >= 3) {
			return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${normalizedOpacity})`;
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

		if (hex.length === 6) {
			const red = parseInt(hex.slice(0, 2), 16);
			const green = parseInt(hex.slice(2, 4), 16);
			const blue = parseInt(hex.slice(4, 6), 16);
			return `rgba(${red}, ${green}, ${blue}, ${normalizedOpacity})`;
		}
	}

	return color;
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
