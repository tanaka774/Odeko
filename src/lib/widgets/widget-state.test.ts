import { describe, it, expect } from 'vitest';
import { dayPeriod, flag, ratio, usageLevel } from './widget-state';

describe('widget state helpers', () => {
	it('maps usage to levels', () => {
		expect(usageLevel(10)).toBe('low');
		expect(usageLevel(50)).toBe('mid');
		expect(usageLevel(79.9)).toBe('mid');
		expect(usageLevel(80)).toBe('high');
	});

	it('maps hours to day periods', () => {
		expect(dayPeriod(4)).toBe('night');
		expect(dayPeriod(5)).toBe('morning');
		expect(dayPeriod(12)).toBe('afternoon');
		expect(dayPeriod(17)).toBe('evening');
		expect(dayPeriod(21)).toBe('night');
	});

	it('clamps ratios and survives a zero total', () => {
		expect(ratio(30, 120)).toBe(0.25);
		expect(ratio(5, 0)).toBe(0);
		expect(ratio(2, 1)).toBe(1);
		expect(ratio(Number.NaN)).toBe(0);
	});

	it('turns booleans into empty attributes', () => {
		expect(flag(true)).toBe('');
		expect(flag(false)).toBeUndefined();
	});
});
