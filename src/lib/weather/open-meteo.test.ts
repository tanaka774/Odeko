import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWeather } from './open-meteo';

const fetchMock = vi.fn();

function jsonResponse(data: unknown, ok = true) {
	return { ok, json: async () => data };
}

beforeEach(() => {
	vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	fetchMock.mockReset();
});

describe('fetchWeather', () => {
	it('builds a view model from the geocoding and forecast responses', async () => {
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse({ results: [{ name: 'Tokyo', latitude: 35.7, longitude: 139.7 }] })
			)
			.mockResolvedValueOnce(
				jsonResponse({
					current: { time: '2026-08-02T10:00', temperature_2m: 27.6, weather_code: 1 },
					hourly: {
						time: ['2026-08-02T11:00', '2026-08-02T12:00', '2026-08-02T13:00'],
						temperature_2m: [28.2, 29.7, 30.1],
						weather_code: [2, 3, 61]
					}
				})
			);

		const vm = await fetchWeather({ location: 'Tokyo', unit: 'celsius', forecastHours: 2 });

		expect(vm.temperature).toBe(28);
		expect(vm.unit).toBe('C');
		expect(vm.condition).toBe('partlyCloudy');
		expect(vm.locationName).toBe('Tokyo');
		expect(vm.forecast).toHaveLength(2);
		expect(vm.forecast[0].temperature).toBe(28);
		expect(vm.forecast[1].label).toBe('Cloudy');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('requests the fahrenheit temperature unit', async () => {
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse({ results: [{ name: 'NYC', latitude: 40.7, longitude: -74.0 }] })
			)
			.mockResolvedValueOnce(
				jsonResponse({
					current: { time: '2026-08-02T10:00', temperature_2m: 80.4, weather_code: 0 },
					hourly: { time: [], temperature_2m: [], weather_code: [] }
				})
			);

		const vm = await fetchWeather({ location: 'NYC', unit: 'fahrenheit', forecastHours: 3 });

		expect(vm.unit).toBe('F');
		const forecastUrl = fetchMock.mock.calls[1][0] as string;
		expect(forecastUrl).toContain('temperature_unit=fahrenheit');
	});

	it('defaults an empty location to Tokyo', async () => {
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse({ results: [{ name: 'Tokyo', latitude: 35.7, longitude: 139.7 }] })
			)
			.mockResolvedValueOnce(
				jsonResponse({
					current: { time: '2026-08-02T10:00', temperature_2m: 20, weather_code: 0 },
					hourly: { time: [], temperature_2m: [], weather_code: [] }
				})
			);

		await fetchWeather({ location: '   ', unit: 'celsius', forecastHours: 1 });

		const geocodeUrl = fetchMock.mock.calls[0][0] as string;
		expect(geocodeUrl).toContain('name=Tokyo');
	});

	it('throws when the location is not found', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

		await expect(
			fetchWeather({ location: 'Nowhere', unit: 'celsius', forecastHours: 1 })
		).rejects.toThrow('Could not find weather location');
	});

	it('throws when the geocoding request fails', async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({}, false));

		await expect(
			fetchWeather({ location: 'Tokyo', unit: 'celsius', forecastHours: 1 })
		).rejects.toThrow('Location request failed');
	});

	it('throws when the forecast request fails', async () => {
		fetchMock
			.mockResolvedValueOnce(
				jsonResponse({ results: [{ name: 'Tokyo', latitude: 35.7, longitude: 139.7 }] })
			)
			.mockResolvedValueOnce(jsonResponse({}, false));

		await expect(
			fetchWeather({ location: 'Tokyo', unit: 'celsius', forecastHours: 1 })
		).rejects.toThrow('Weather forecast request failed');
	});
});
