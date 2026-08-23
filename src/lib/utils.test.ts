import { describe, it, expect } from 'vitest';
import { cn, normalizeColorInput, safeRgbColor, safeCssUrl } from './utils';

describe('cn', () => {
	it('joins truthy class names with spaces', () => {
		expect(cn('a', 'b', 'c')).toBe('a b c');
	});

	it('filters out falsy values', () => {
		const falsy = false;
		const zero = 0;
		expect(cn('a', falsy && 'b', null, undefined, zero && 'c', '')).toBe('a');
	});

	it('merges conflicting tailwind classes keeping the last one', () => {
		expect(cn('p-2', 'p-4')).toBe('p-4');
		expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
	});

	it('keeps non-conflicting tailwind classes together', () => {
		expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
	});

	it('returns an empty string when given nothing', () => {
		expect(cn()).toBe('');
	});
});

describe('normalizeColorInput', () => {
	it('converts a 6-digit hex code', () => {
		expect(normalizeColorInput('#ff8800')).toBe('255, 136, 0');
	});

	it('expands a 3-digit hex shorthand', () => {
		expect(normalizeColorInput('#f80')).toBe('255, 136, 0');
		expect(normalizeColorInput('#ff8')).toBe('255, 255, 136');
	});

	it('accepts uppercase hex', () => {
		expect(normalizeColorInput('#FF8800')).toBe('255, 136, 0');
	});

	it('passes through an "R, G, B" triple', () => {
		expect(normalizeColorInput('20, 20, 30')).toBe('20, 20, 30');
		expect(normalizeColorInput('255,136,0')).toBe('255, 136, 0');
	});

	it('accepts an rgb() wrapper', () => {
		expect(normalizeColorInput('rgb(255, 136, 0)')).toBe('255, 136, 0');
	});

	it('rejects incomplete or invalid inputs', () => {
		expect(normalizeColorInput('')).toBeNull();
		expect(normalizeColorInput('not a color')).toBeNull();
		expect(normalizeColorInput('#ff88')).toBeNull();
		expect(normalizeColorInput('#gggggg')).toBeNull();
		expect(normalizeColorInput('#ff88000')).toBeNull();
		expect(normalizeColorInput('300, 0, 0')).toBeNull();
		expect(normalizeColorInput('1, 2')).toBeNull();
		expect(normalizeColorInput('rgba(255, 136, 0, 0.5)')).toBeNull();
	});
});

describe('safeRgbColor', () => {
	it('passes through a valid "R, G, B" triple', () => {
		expect(safeRgbColor('20, 20, 30', '0, 0, 0')).toBe('20, 20, 30');
		expect(safeRgbColor('255,136,0', '0, 0, 0')).toBe('255, 136, 0');
	});

	it('falls back for missing or empty values', () => {
		expect(safeRgbColor(undefined, '1, 2, 3')).toBe('1, 2, 3');
		expect(safeRgbColor('', '1, 2, 3')).toBe('1, 2, 3');
	});

	it('rejects CSS fragments that would break out of rgba(...)', () => {
		const fallback = '0, 0, 0';
		expect(
			safeRgbColor('0, 0, 0); background-image: url(https://evil.example/x) /*', fallback)
		).toBe(fallback);
		expect(safeRgbColor('0, 0, 0, 0.5', fallback)).toBe(fallback);
		expect(safeRgbColor('red, green, blue', fallback)).toBe(fallback);
		expect(safeRgbColor('300, 0, 0', fallback)).toBe(fallback);
		expect(safeRgbColor('-1, 0, 0', fallback)).toBe(fallback);
		expect(safeRgbColor('1e3, 0, 0', fallback)).toBe(fallback);
		expect(safeRgbColor('0.5, 0, 0', fallback)).toBe(fallback);
	});
});

describe('safeCssUrl', () => {
	it('passes through plain values', () => {
		expect(safeCssUrl('/home/user/bg.png')).toBe('/home/user/bg.png');
		expect(safeCssUrl('asset://localhost/home/user/bg.png')).toBe(
			'asset://localhost/home/user/bg.png'
		);
	});

	it('strips characters that could break out of url("...")', () => {
		expect(safeCssUrl('x") ; background: url(https://evil.example) /*')).toBe(
			'x  background: urlhttps://evil.example /*'
		);
	});

	it('returns null for empty or scrubbed-to-nothing values', () => {
		expect(safeCssUrl(null)).toBeNull();
		expect(safeCssUrl(undefined)).toBeNull();
		expect(safeCssUrl('')).toBeNull();
		expect(safeCssUrl('   ')).toBeNull();
	});
});
