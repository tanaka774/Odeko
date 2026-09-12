import { describe, it, expect } from 'vitest';
import {
	DEFAULT_MODAL_APPEARANCE,
	MODAL_BASE_DEFAULTS,
	diffModalAppearance,
	modalAppearanceStyle,
	modalCssScope,
	overlayModalAppearance,
	resolveModalAppearance,
	sanitizeCssColor,
	sanitizeModalAppearanceStore
} from './modal-appearance';

describe('resolveModalAppearance', () => {
	it('layers base, global and per-modal overrides', () => {
		const resolved = resolveModalAppearance('clock', {
			global: { accentColor: '#111111', radius: 4 },
			modals: { clock: { accentColor: '#ff0000' } }
		});

		expect(resolved.accentColor).toBe('#ff0000');
		expect(resolved.radius).toBe(4);
		expect(resolved.surfaceColor).toBe(DEFAULT_MODAL_APPEARANCE.surfaceColor);
	});

	it('uses the call-site base above the hard-coded defaults', () => {
		expect(resolveModalAppearance('app-settings').width).toBe(
			MODAL_BASE_DEFAULTS['app-settings']?.width
		);
		expect(resolveModalAppearance('clock').width).toBe(DEFAULT_MODAL_APPEARANCE.width);
	});

	it('clamps numeric values into their range', () => {
		const resolved = resolveModalAppearance('clock', {
			modals: { clock: { radius: 999, surfaceOpacity: 4, borderWidth: -3 } }
		});

		expect(resolved.radius).toBe(48);
		expect(resolved.surfaceOpacity).toBe(1);
		expect(resolved.borderWidth).toBe(0);
	});

	it('ignores overrides for a different modal key', () => {
		const resolved = resolveModalAppearance('clock', {
			modals: { weather: { accentColor: '#00ff00' } }
		});
		expect(resolved.accentColor).toBe(DEFAULT_MODAL_APPEARANCE.accentColor);
	});
});

describe('sanitizeCssColor', () => {
	it('accepts hex, rgb(), named colors and channel triples', () => {
		expect(sanitizeCssColor('#abc', '#000000')).toBe('#abc');
		expect(sanitizeCssColor('#aabbcc', '#000000')).toBe('#aabbcc');
		expect(sanitizeCssColor('rgba(1, 2, 3, 0.5)', '#000000')).toBe('rgba(1, 2, 3, 0.5)');
		expect(sanitizeCssColor('transparent', '#000000')).toBe('transparent');
		expect(sanitizeCssColor('10, 20, 30', '#000000')).toBe('rgb(10, 20, 30)');
	});

	it('rejects values that could escape the declaration', () => {
		const fallback = '#000000';
		expect(sanitizeCssColor('red; background: url(http://x)', fallback)).toBe(fallback);
		expect(sanitizeCssColor('url(http://x)', fallback)).toBe(fallback);
		expect(sanitizeCssColor('1, 2', fallback)).toBe(fallback);
		expect(sanitizeCssColor('999, 0, 0', fallback)).toBe(fallback);
		expect(sanitizeCssColor(42, fallback)).toBe(fallback);
	});

	it('strips font families that could break out of the style string', () => {
		const resolved = resolveModalAppearance('clock', {
			modals: { clock: { fontFamily: 'Georgia, serif; } .x { color: red' } }
		});
		expect(resolved.fontFamily).not.toContain(';');
		expect(resolved.fontFamily).not.toContain('}');
	});
});

describe('modalAppearanceStyle', () => {
	it('emits every custom property the chrome consumes', () => {
		const style = modalAppearanceStyle(resolveModalAppearance('clock'));

		for (const variable of [
			'--modal-overlay-bg',
			'--modal-surface-bg',
			'--modal-radius',
			'--modal-width',
			'--modal-height',
			'--modal-accent',
			'--modal-text',
			'--modal-input-bg',
			'--modal-control-radius'
		]) {
			expect(style).toContain(`${variable}:`);
		}
		expect(style).toContain('--modal-overlay-bg:rgba(0, 0, 0, 0.7)');
		expect(style).toContain('--modal-width:min(480px, 92%)');
	});

	it('emits the base text size and scales the title with it', () => {
		const style = modalAppearanceStyle(resolveModalAppearance('clock'));
		expect(style).toContain('--modal-font-size:14px');
		expect(style).toContain('--modal-title-size:calc(1.4286 * var(--modal-font-size))');

		const large = modalAppearanceStyle(
			resolveModalAppearance('clock', { modals: { clock: { fontSize: 20 } } })
		);
		expect(large).toContain('--modal-font-size:20px');
		expect(large).toContain('--modal-title-size:calc(1.4286 * var(--modal-font-size))');

		const bigTitle = modalAppearanceStyle(
			resolveModalAppearance('clock', { modals: { clock: { titleSize: 28 } } })
		);
		expect(bigTitle).toContain('--modal-title-size:calc(2.0000 * var(--modal-font-size))');
	});

	it('clamps the text size into its range', () => {
		expect(resolveModalAppearance('clock', { modals: { clock: { fontSize: 99 } } }).fontSize).toBe(
			22
		);
		expect(resolveModalAppearance('clock', { modals: { clock: { fontSize: 2 } } }).fontSize).toBe(
			12
		);
	});

	it('drops the shadow when its strength is zero', () => {
		const style = modalAppearanceStyle(
			resolveModalAppearance('clock', { modals: { clock: { shadowStrength: 0 } } })
		);
		expect(style).toContain('--modal-shadow:none');
	});

	it('removes the border when its width is zero', () => {
		const style = modalAppearanceStyle(
			resolveModalAppearance('clock', { modals: { clock: { borderWidth: 0 } } })
		);
		expect(style).toContain('--modal-border-width:0px');
	});
});

describe('diffModalAppearance', () => {
	it('keeps only fields that differ from the layer below', () => {
		const lower = overlayModalAppearance({}, { accentColor: '#111111' });
		const layer = diffModalAppearance({ ...lower, radius: 2, accentColor: '#222222' }, lower);

		expect(layer).toEqual({ radius: 2, accentColor: '#222222' });
	});
});

describe('sanitizeModalAppearanceStore', () => {
	it('drops unknown keys and empty layers', () => {
		const store = sanitizeModalAppearanceStore({
			global: { radius: 4 },
			modals: { clock: { accentColor: '#ff0000' }, nope: { radius: 1 } }
		});

		expect(store.global).toEqual({ radius: 4 });
		expect(store.modals?.clock).toEqual({ accentColor: '#ff0000' });
		expect((store.modals as Record<string, unknown>).nope).toBeUndefined();
	});

	it('survives non-object input', () => {
		expect(sanitizeModalAppearanceStore(null)).toEqual({});
		expect(sanitizeModalAppearanceStore('nope')).toEqual({});
		expect(sanitizeModalAppearanceStore({ global: [] })).toEqual({});
	});
});

describe('modalCssScope', () => {
	it('scopes custom CSS to one modal key', () => {
		expect(modalCssScope('clock')).toBe('[data-modal="clock"]');
	});
});
