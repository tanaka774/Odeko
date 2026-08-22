import { describe, it, expect } from 'vitest';
import { getWeatherCodeInfo } from './weather-code';

describe('getWeatherCodeInfo', () => {
	it('maps code 0 to clear', () => {
		expect(getWeatherCodeInfo(0)).toEqual({
			condition: 'clear',
			label: 'Clear',
			effect: 'sunny'
		});
	});

	it('maps codes 1-2 to partly cloudy', () => {
		for (const code of [1, 2]) {
			expect(getWeatherCodeInfo(code).condition).toBe('partlyCloudy');
			expect(getWeatherCodeInfo(code).label).toBe('Partly cloudy');
		}
	});

	it('maps code 3 to cloudy', () => {
		expect(getWeatherCodeInfo(3).condition).toBe('cloudy');
	});

	it('maps fog codes 45 and 48', () => {
		for (const code of [45, 48]) {
			expect(getWeatherCodeInfo(code).condition).toBe('fog');
			expect(getWeatherCodeInfo(code).effect).toBe('fog');
		}
	});

	it('maps drizzle codes 51-57 and 80', () => {
		for (const code of [51, 53, 55, 56, 57, 80]) {
			expect(getWeatherCodeInfo(code).condition).toBe('drizzle');
			expect(getWeatherCodeInfo(code).effect).toBe('rain-light');
		}
	});

	it('maps rain codes 61-67 and 81-82', () => {
		for (const code of [61, 63, 65, 66, 67, 81, 82]) {
			expect(getWeatherCodeInfo(code).condition).toBe('rain');
			expect(getWeatherCodeInfo(code).effect).toBe('rain');
		}
	});

	it('maps snow codes 71-77 and 85-86', () => {
		for (const code of [71, 73, 75, 77, 85, 86]) {
			expect(getWeatherCodeInfo(code).condition).toBe('snow');
			expect(getWeatherCodeInfo(code).effect).toBe('snow');
		}
	});

	it('maps storm codes 95-99', () => {
		for (const code of [95, 96, 99]) {
			expect(getWeatherCodeInfo(code).condition).toBe('storm');
			expect(getWeatherCodeInfo(code).effect).toBe('lightning');
		}
	});

	it('returns unknown for unmapped codes', () => {
		for (const code of [-1, 50, 60, 90, 100]) {
			expect(getWeatherCodeInfo(code)).toEqual({
				condition: 'unknown',
				label: 'Weather',
				effect: 'none'
			});
		}
	});
});
