import { describe, it, expect } from 'vitest';
import {
	getWidgetAppearance,
	colorWithOpacity,
	getAppearanceBackground,
	getAppearanceBorder,
	colorToHexInputValue
} from './appearance';

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

	it('returns unrecognized colors unchanged', () => {
		expect(colorWithOpacity('linear-gradient(red, blue)', 0.5)).toBe('linear-gradient(red, blue)');
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
