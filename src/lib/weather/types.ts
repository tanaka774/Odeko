export type WeatherCondition =
	| 'clear'
	| 'partlyCloudy'
	| 'cloudy'
	| 'drizzle'
	| 'rain'
	| 'snow'
	| 'storm'
	| 'fog'
	| 'unknown';

export type WeatherEffect =
	| 'sunny'
	| 'clouds'
	| 'rain-light'
	| 'rain'
	| 'snow'
	| 'lightning'
	| 'fog'
	| 'none';

export interface WeatherForecastItem {
	time: Date;
	temperature: number;
	condition: WeatherCondition;
	label: string;
}

export interface WeatherViewModel {
	temperature: number;
	unit: 'C' | 'F';
	condition: WeatherCondition;
	label: string;
	locationName: string;
	updatedAt: Date;
	forecast: WeatherForecastItem[];
	effect: WeatherEffect;
}
