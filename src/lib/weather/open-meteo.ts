import type { WeatherViewModel, WeatherForecastItem } from './types';
import { getWeatherCodeInfo } from './weather-code';

interface GeocodingResult {
	name: string;
	admin1?: string;
	country?: string;
	latitude: number;
	longitude: number;
	timezone?: string;
}

interface GeocodingResponse {
	results?: GeocodingResult[];
}

interface OpenMeteoForecastResponse {
	current: {
		time: string;
		temperature_2m: number;
		weather_code: number;
	};
	hourly: {
		time: string[];
		temperature_2m: number[];
		weather_code: number[];
	};
}

export interface FetchWeatherOptions {
	location: string;
	unit: 'celsius' | 'fahrenheit';
	forecastHours: number;
}

export async function fetchWeather(options: FetchWeatherOptions): Promise<WeatherViewModel> {
	const location = await fetchLocation(options.location);
	const params = new URLSearchParams({
		latitude: String(location.latitude),
		longitude: String(location.longitude),
		current: 'temperature_2m,weather_code',
		hourly: 'temperature_2m,weather_code',
		forecast_hours: String(Math.max(options.forecastHours + 1, 4)),
		timezone: 'auto',
		temperature_unit: options.unit
	});

	const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
	if (!response.ok) {
		throw new Error(`Weather forecast request failed: ${response.status}`);
	}

	const data = (await response.json()) as OpenMeteoForecastResponse;
	const currentInfo = getWeatherCodeInfo(data.current.weather_code);

	return {
		temperature: Math.round(data.current.temperature_2m),
		unit: options.unit === 'celsius' ? 'C' : 'F',
		condition: currentInfo.condition,
		label: currentInfo.label,
		locationName: formatLocationName(location),
		updatedAt: new Date(data.current.time),
		forecast: buildHourlyForecast(data, options.forecastHours),
		effect: currentInfo.effect
	};
}

async function fetchLocation(location: string): Promise<GeocodingResult> {
	const query = location.trim() || 'Tokyo';
	const params = new URLSearchParams({
		name: query,
		count: '1',
		language: 'en',
		format: 'json'
	});

	const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
	if (!response.ok) {
		throw new Error(`Location request failed: ${response.status}`);
	}

	const data = (await response.json()) as GeocodingResponse;
	const firstResult = data.results?.[0];

	if (!firstResult) {
		throw new Error(`Could not find weather location: ${query}`);
	}

	return firstResult;
}

function buildHourlyForecast(
	data: OpenMeteoForecastResponse,
	forecastHours: number
): WeatherForecastItem[] {
	const currentTime = new Date(data.current.time).getTime();

	return data.hourly.time
		.map((time, index) => ({
			time: new Date(time),
			temperature: Math.round(data.hourly.temperature_2m[index]),
			weatherCode: data.hourly.weather_code[index]
		}))
		.filter((item) => item.time.getTime() > currentTime)
		.slice(0, forecastHours)
		.map((item) => {
			const info = getWeatherCodeInfo(item.weatherCode);

			return {
				time: item.time,
				temperature: item.temperature,
				condition: info.condition,
				label: info.label
			};
		});
}

function formatLocationName(location: GeocodingResult): string {
	return location.name;
}
