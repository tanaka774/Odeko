import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/svelte';

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(async (command: string) =>
		command === 'get_system_stats'
			? {
					cpu_usage: 85,
					memory_used: 1,
					memory_total: 2,
					memory_usage_percent: 50,
					disk_used: 1,
					disk_total: 10,
					disk_usage_percent: 10
				}
			: null
	),
	convertFileSrc: (path: string) => path
}));

vi.mock('$lib/weather/open-meteo', () => ({
	fetchWeather: vi.fn(async () => ({
		temperature: 12,
		unit: 'C',
		condition: 'rain',
		label: 'Rain',
		locationName: 'Tokyo',
		updatedAt: new Date(),
		forecast: [],
		effect: 'rain'
	}))
}));

import SystemWidget from './SystemWidget.svelte';
import WeatherWidget from './WeatherWidget.svelte';

afterEach(cleanup);

describe('widget state attributes', () => {
	it('exposes system usage levels and ratios', async () => {
		const { container } = render(SystemWidget, { config: {} });
		const root = container.querySelector('.system-widget') as HTMLElement;
		await waitFor(() => expect(root.dataset.cpuLevel).toBe('high'));
		expect(root.dataset.memoryLevel).toBe('mid');
		expect(root.dataset.diskLevel).toBe('low');
		expect(root.style.getPropertyValue('--cpu')).toBe('0.85');
	});

	it('exposes the weather condition once loaded', async () => {
		const { container } = render(WeatherWidget, { config: {} });
		const root = container.querySelector('.weather-widget') as HTMLElement;
		await waitFor(() => expect(root.dataset.status).toBe('ready'));
		expect(root.dataset.condition).toBe('rain');
		expect(root.style.getPropertyValue('--temperature')).toBe('12');
	});
});
