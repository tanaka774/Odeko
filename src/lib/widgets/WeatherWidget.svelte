<script lang="ts">
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { fetchWeather } from '$lib/weather/open-meteo';
	import { getWeatherIcon } from '$lib/weather/icons';
	import type { WeatherViewModel } from '$lib/weather/types';
	import {
		colorWithOpacity,
		getAppearanceBackground,
		getAppearanceBorder,
		getWidgetAppearance
	} from './appearance';
	import type { WeatherWidgetConfig, WidgetComponentProps } from './types';
	import { WIDGET_TYPE_APPEARANCE_DEFAULTS } from './types';

	type Props = WidgetComponentProps<WeatherWidgetConfig>;

	let { config = {}, borderRadius = 12 }: Props = $props();

	const location = $derived(config.location?.trim() || 'Tokyo');
	const unit = $derived(config.unit ?? 'celsius');
	const refreshInterval = $derived(config.refreshInterval ?? 30 * 60 * 1000);
	const forecastHours = $derived(config.forecastHours ?? 3);
	const appearance = $derived(
		getWidgetAppearance(config, { ...WIDGET_TYPE_APPEARANCE_DEFAULTS.weather, borderRadius })
	);
	const widgetBackground = $derived(getAppearanceBackground(appearance));
	const widgetBorder = $derived(getAppearanceBorder(appearance));
	const textColor96 = $derived(colorWithOpacity(appearance.textColor, 0.96));
	const textColor92 = $derived(colorWithOpacity(appearance.textColor, 0.92));
	const textColor76 = $derived(colorWithOpacity(appearance.textColor, 0.76));
	const textColor74 = $derived(colorWithOpacity(appearance.textColor, 0.74));
	const textColor72 = $derived(colorWithOpacity(appearance.textColor, 0.72));
	const textColor66 = $derived(colorWithOpacity(appearance.textColor, 0.66));
	const textColor48 = $derived(colorWithOpacity(appearance.textColor, 0.48));

	let weather = $state<WeatherViewModel | null>(null);
	let isLoading = $state(true);
	let errorMessage = $state('');

	async function loadWeather() {
		try {
			isLoading = true;
			errorMessage = '';
			weather = await fetchWeather({
				location,
				unit,
				forecastHours
			});
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load weather';
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		loadWeather();

		const interval = setInterval(loadWeather, refreshInterval);

		return () => {
			clearInterval(interval);
		};
	});

	function formatHour(date: Date): string {
		return new Intl.DateTimeFormat(undefined, {
			hour: 'numeric'
		}).format(date);
	}

	function getForecastColumns(count: number): number {
		return Math.min(Math.max(count, 1), 4);
	}
</script>

{#snippet forecastList(weatherData: WeatherViewModel)}
	{#if weatherData.forecast.length > 0}
		<div
			class="forecast-list"
			style:--forecast-columns={getForecastColumns(weatherData.forecast.length)}
			aria-label="Hourly forecast"
		>
			{#each weatherData.forecast as item}
				{@const ForecastIcon = getWeatherIcon(item.condition)}
				<div class="forecast-item" title={item.label}>
					<span class="forecast-time">{formatHour(item.time)}</span>
					<ForecastIcon size={17} stroke-width={1.8} />
					<span class="forecast-temp">{item.temperature}°</span>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<div
	class="weather-widget"
	style:--appearance-background={widgetBackground}
	style:--appearance-border={widgetBorder}
	style:--appearance-border-radius="{appearance.borderRadius}px"
	style:--appearance-text-color={appearance.textColor}
	style:--appearance-font-family={appearance.fontFamily}
	style:--appearance-font-size="{appearance.fontSize}px"
	style:--widget-text-color-96={textColor96}
	style:--widget-text-color-92={textColor92}
	style:--widget-text-color-76={textColor76}
	style:--widget-text-color-74={textColor74}
	style:--widget-text-color-72={textColor72}
	style:--widget-text-color-66={textColor66}
	style:--widget-text-color-48={textColor48}
	style:--appearance-padding="{appearance.padding}px"
	style:--appearance-opacity={appearance.opacity}
>
	{#if weather}
		{@const CurrentIcon = getWeatherIcon(weather.condition)}

		<div class="current-summary">
			<div class="weather-primary">
				<div class="temperature">{weather.temperature}°{weather.unit}</div>
				<span class="location" title={weather.locationName}>{weather.locationName}</span>
			</div>

			<div class="weather-condition">
				<div class="condition-icon" aria-hidden="true">
					<CurrentIcon size={34} stroke-width={1.7} />
				</div>
				<div class="condition">{weather.label}</div>
			</div>
		</div>

		{@render forecastList(weather)}
	{:else if isLoading}
		<div class="state-view">
			<span class="spin" aria-hidden="true">
				<RefreshCw size={24} stroke-width={1.8} />
			</span>
			<span>Loading weather</span>
		</div>
	{:else}
		<div class="state-view error">
			<span>Weather unavailable</span>
			<small>{errorMessage}</small>
		</div>
	{/if}
</div>

<style>
	.weather-widget {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 12px;
		box-sizing: border-box;
		font-size: var(--appearance-font-size);
		font-family: var(--appearance-font-family);
		background: var(--appearance-background);
		border: var(--appearance-border);
		border-radius: var(--appearance-border-radius);
		color: var(--appearance-text-color);
		padding: var(--appearance-padding);
		opacity: var(--appearance-opacity);
	}

	.current-summary {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.weather-primary {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.weather-condition {
		width: 86px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
	}

	.condition-icon {
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 0 0 auto;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.1);
		color: var(--widget-text-color-96);
	}

	.temperature {
		font-size: clamp(2em, 3.3vw, 2.8em);
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	.condition {
		margin-top: 4px;
		color: var(--widget-text-color-74);
		font-size: 0.76em;
		line-height: 1.2;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}

	.location {
		min-width: 0;
		padding-left: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--widget-text-color-66);
		font-size: 0.82em;
	}

	.forecast-list {
		display: grid;
		grid-template-columns: repeat(var(--forecast-columns), minmax(0, 1fr));
		gap: 6px;
	}

	.forecast-item {
		min-width: 0;
		display: grid;
		grid-template-rows: auto 18px auto;
		justify-items: center;
		gap: 4px;
		padding: 8px 6px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.08);
		color: var(--widget-text-color-76);
		font-size: 0.72em;
	}

	.forecast-time,
	.forecast-temp {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.forecast-temp {
		color: var(--widget-text-color-92);
		font-weight: 650;
	}

	.state-view {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		text-align: center;
		color: var(--widget-text-color-72);
		font-size: 0.85em;
	}

	.state-view small {
		max-width: 100%;
		color: var(--widget-text-color-48);
		font-size: 0.7em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.error {
		color: rgba(254, 202, 202, 0.92);
	}

	.spin {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
