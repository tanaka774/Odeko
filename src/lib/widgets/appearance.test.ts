import { describe, it, expect, vi, afterEach } from 'vitest';

// settingsStore (imported by ./appearance) talks to Tauri at module load.
vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(),
	convertFileSrc: (path: string) => path
}));

import {
	getWidgetAppearance,
	getGlobalDefaultAppearance,
	colorWithOpacity,
	getAppearanceBackground,
	getAppearanceBorder,
	colorToHexInputValue
} from './appearance';
import { settingsStore } from '$lib/stores/settings.svelte';

afterEach(() => {
	settingsStore.resetToDefaults();
});

describe('colorWithOpacity', () => {
	it('rewrites rgb() colors with the given opacity', () => {
		expect(colorWithOpacity('rgb(255, 0, 0)', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
	});

	it('replaces the alpha channel of rgba() colors', () => {
		expect(colorWithOpacity('rgba(10, 20, 30, 0.9)', 0.25)).toBe('rgba(10, 20, 30, 0.25)');
	});

	it('clamps opacity to the [0, 1] range', () => {
		expect(colorWithOpacity('#ff0000', 2)).toBe('rgba(255, 0, 0, 1)');
		expect(colorWithOpacity('#ff0000', -1)).toBe('rgba(255, 0, 0, 0)');
	});

	it('expands 3-digit hex colors', () => {
		expect(colorWithOpacity('#f00', 1)).toBe('rgba(255, 0, 0, 1)');
	});

	it('converts 6-digit hex colors', () => {
		expect(colorWithOpacity('#00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
	});

	it('accepts plain "R, G, B" triples', () => {
		expect(colorWithOpacity('10, 20, 30', 0.5)).toBe('rgba(10, 20, 30, 0.5)');
		expect(colorWithOpacity('10,20,30', 0.5)).toBe('rgba(10, 20, 30, 0.5)');
	});

	it('never echoes unrecognized colors back into style strings', () => {
		// These look like color fields but are CSS fragments; echoing them
		// verbatim would let an imported preset inject CSS declarations.
		const fallback = 'rgba(0, 0, 0, 0.3)';
		expect(colorWithOpacity('linear-gradient(red, blue)', 0.5)).toBe(fallback);
		expect(
			colorWithOpacity('0, 0, 0); background-image: url(https://evil.example/x) /*', 0.5)
		).toBe(fallback);
		expect(colorWithOpacity('#ff0000; color: red', 0.5)).toBe(fallback);
		expect(colorWithOpacity('rgba(0; background: url(x), 1, 2, 0.5)', 0.5)).toBe(fallback);
	});
});

describe('getWidgetAppearance', () => {
	it('returns defaults when nothing is provided', () => {
		expect(getWidgetAppearance()).toEqual({
			backgroundColor: 'rgba(0, 0, 0, 0.3)',
			backgroundOpacity: 0.3,
			textColor: '#ffffff',
			borderColor: 'rgba(255, 255, 255, 0.12)',
			borderWidth: 0,
			borderStyle: 'solid',
			borderRadius: 12,
			padding: 12,
			opacity: 1,
			customCssEnabled: false,
			customCss: ''
		});
	});

	it('merges fallback and config appearance in priority order', () => {
		const result = getWidgetAppearance(
			{ appearance: { opacity: 0.9 } },
			{ opacity: 0.5, padding: 4 }
		);
		expect(result.opacity).toBe(0.9);
		expect(result.padding).toBe(4);
	});

	it('never applies the global default as a render layer', () => {
		// The default appearance is a creation-time template; existing items
		// resolve only DEFAULT < fallback < item.
		settingsStore.updateSettings({
			default_appearance: { backgroundColor: '#123456', borderRadius: 30 }
		});

		const result = getWidgetAppearance({}, { padding: 4 });

		expect(result.backgroundColor).toBe('rgba(0, 0, 0, 0.3)');
		expect(result.borderRadius).toBe(12);
		expect(result.padding).toBe(4);
	});

	it('exposes the default appearance template from the store', () => {
		expect(getGlobalDefaultAppearance()).toEqual({ borderRadius: 24 });
	});

	it('ignores a non-object default appearance from older/imported files', () => {
		settingsStore.updateSettings({ default_appearance: null as never });
		expect(getGlobalDefaultAppearance()).toEqual({});
		expect(getWidgetAppearance().backgroundColor).toBe('rgba(0, 0, 0, 0.3)');
	});
});

describe('getAppearanceBackground', () => {
	it('falls back to the default background color', () => {
		expect(getAppearanceBackground({})).toBe('rgba(0, 0, 0, 0.3)');
	});

	it('applies opacity to the configured background color', () => {
		expect(getAppearanceBackground({ backgroundColor: '#ffffff', backgroundOpacity: 0.5 })).toBe(
			'rgba(255, 255, 255, 0.5)'
		);
	});
});

describe('getAppearanceBorder', () => {
	it('returns none for a none border style', () => {
		expect(getAppearanceBorder({ borderStyle: 'none', borderWidth: 3 })).toBe('none');
	});

	it('returns none when the border width is zero', () => {
		expect(getAppearanceBorder({ borderStyle: 'dashed', borderWidth: 0 })).toBe('none');
	});

	it('builds a css border shorthand otherwise', () => {
		expect(getAppearanceBorder({ borderStyle: 'dashed', borderWidth: 2, borderColor: 'red' })).toBe(
			'2px dashed red'
		);
	});
});

describe('colorToHexInputValue', () => {
	it('passes through hex colors', () => {
		expect(colorToHexInputValue('#ff0000', '#000000')).toBe('#ff0000');
	});

	it('converts rgb colors to hex', () => {
		expect(colorToHexInputValue('rgb(255, 0, 0)', '#000000')).toBe('#ff0000');
		expect(colorToHexInputValue('rgba(0, 128, 255, 0.5)', '#000000')).toBe('#0080ff');
	});

	it('uses the fallback for invalid colors', () => {
		expect(colorToHexInputValue('not a color', '#000000')).toBe('#000000');
		expect(colorToHexInputValue(undefined, '#123456')).toBe('#123456');
	});
});
