import { describe, it, expect } from 'vitest';
import {
	WIDGET_REGISTRY,
	getWidgetMeta,
	createDefaultWidgetConfig,
	createDefaultWidgetAppearance,
	DEFAULT_WIDGET_APPEARANCE,
	type ClockWidgetConfig,
	type WeatherWidgetConfig,
	type SlideshowWidgetConfig,
	type PowerControlWidgetConfig,
	type ClipboardWidgetConfig,
	type CustomWidgetConfig
} from './types';

describe('WIDGET_REGISTRY', () => {
	it('registers all 15 widget types', () => {
		expect(WIDGET_REGISTRY).toHaveLength(15);
	});
});

describe('getWidgetMeta', () => {
	it('returns metadata for every registered widget', () => {
		for (const meta of WIDGET_REGISTRY) {
			expect(getWidgetMeta(meta.type)).toBeDefined();
		}
	});

	it('returns undefined for an unknown widget type', () => {
		expect(getWidgetMeta('bogus' as never)).toBeUndefined();
	});
});

describe('createDefaultWidgetConfig', () => {
	it('creates clock defaults', () => {
		const cfg = createDefaultWidgetConfig('clock') as ClockWidgetConfig;
		expect(cfg.format).toBe('24h');
		expect(cfg.showSeconds).toBe(true);
		expect(cfg.refreshInterval).toBe(1000);
	});

	it('creates weather defaults with custom appearance', () => {
		const cfg = createDefaultWidgetConfig('weather') as WeatherWidgetConfig;
		expect(cfg.location).toBe('Tokyo');
		expect(cfg.unit).toBe('celsius');
		expect(cfg.appearance?.backgroundColor).toBe('rgba(30, 41, 59, 0.82)');
		expect(cfg.appearance?.backgroundOpacity).toBe(0.82);
	});

	it('creates slideshow defaults', () => {
		const cfg = createDefaultWidgetConfig('slideshow') as SlideshowWidgetConfig;
		expect(cfg.intervalMs).toBe(5000);
		expect(cfg.loop).toBe(true);
		expect(cfg.shuffle).toBe(false);
	});

	it('creates power widgets with confirmation enabled', () => {
		for (const type of ['sleep', 'restart', 'shutdown'] as const) {
			const cfg = createDefaultWidgetConfig(type) as PowerControlWidgetConfig;
			expect(cfg.requireConfirmation).toBe(true);
			expect(cfg.showLabel).toBe(true);
			expect(cfg.buttonText).toBeDefined();
		}
	});

	it('creates clipboard defaults', () => {
		const cfg = createDefaultWidgetConfig('clipboard') as ClipboardWidgetConfig;
		expect(cfg.history).toEqual([]);
		expect(cfg.maxEntries).toBe(20);
		expect(cfg.showTimestamps).toBe(true);
		expect(cfg.captureImages).toBe(true);
	});

	it('creates custom defaults with placeholder HTML', () => {
		const cfg = createDefaultWidgetConfig('custom') as CustomWidgetConfig;
		expect(cfg.content).toContain('<h1>My widget</h1>');
		expect(cfg.appearance).toEqual({});
	});

	it('returns an empty object for an unknown type', () => {
		expect(createDefaultWidgetConfig('bogus' as never)).toEqual({});
	});
});

describe('createDefaultWidgetAppearance', () => {
	it('returns defaults without overrides', () => {
		expect(createDefaultWidgetAppearance()).toEqual(DEFAULT_WIDGET_APPEARANCE);
	});

	it('merges overrides on top of defaults', () => {
		const appearance = createDefaultWidgetAppearance({ opacity: 0.5, borderWidth: 2 });
		expect(appearance.opacity).toBe(0.5);
		expect(appearance.borderWidth).toBe(2);
		expect(appearance.padding).toBe(12);
		expect(appearance.backgroundColor).toBe('rgba(0, 0, 0, 0.3)');
	});
});
