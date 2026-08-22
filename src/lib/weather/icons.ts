import Cloud from '@lucide/svelte/icons/cloud';
import CloudDrizzle from '@lucide/svelte/icons/cloud-drizzle';
import CloudFog from '@lucide/svelte/icons/cloud-fog';
import CloudLightning from '@lucide/svelte/icons/cloud-lightning';
import CloudRain from '@lucide/svelte/icons/cloud-rain';
import CloudSnow from '@lucide/svelte/icons/cloud-snow';
import CloudSun from '@lucide/svelte/icons/cloud-sun';
import Sun from '@lucide/svelte/icons/sun';
import Umbrella from '@lucide/svelte/icons/umbrella';
import type { Component } from 'svelte';
import type { WeatherCondition } from './types';

export const weatherIconMap = {
	clear: Sun,
	partlyCloudy: CloudSun,
	cloudy: Cloud,
	drizzle: CloudDrizzle,
	rain: CloudRain,
	snow: CloudSnow,
	storm: CloudLightning,
	fog: CloudFog,
	unknown: Umbrella
} satisfies Record<WeatherCondition, Component>;

export function getWeatherIcon(condition: WeatherCondition): Component {
	return weatherIconMap[condition] ?? weatherIconMap.unknown;
}
