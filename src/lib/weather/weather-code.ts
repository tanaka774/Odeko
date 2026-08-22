import type { WeatherCondition, WeatherEffect } from './types';

interface WeatherCodeInfo {
	condition: WeatherCondition;
	label: string;
	effect: WeatherEffect;
}

export function getWeatherCodeInfo(code: number): WeatherCodeInfo {
	if (code === 0) {
		return { condition: 'clear', label: 'Clear', effect: 'sunny' };
	}

	if (code === 1 || code === 2) {
		return { condition: 'partlyCloudy', label: 'Partly cloudy', effect: 'clouds' };
	}

	if (code === 3) {
		return { condition: 'cloudy', label: 'Cloudy', effect: 'clouds' };
	}

	if (code === 45 || code === 48) {
		return { condition: 'fog', label: 'Fog', effect: 'fog' };
	}

	if ((code >= 51 && code <= 57) || code === 80) {
		return { condition: 'drizzle', label: 'Drizzle', effect: 'rain-light' };
	}

	if ((code >= 61 && code <= 67) || code === 81 || code === 82) {
		return { condition: 'rain', label: 'Rain', effect: 'rain' };
	}

	if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
		return { condition: 'snow', label: 'Snow', effect: 'snow' };
	}

	if (code >= 95 && code <= 99) {
		return { condition: 'storm', label: 'Storm', effect: 'lightning' };
	}

	return { condition: 'unknown', label: 'Weather', effect: 'none' };
}
