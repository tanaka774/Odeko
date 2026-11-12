export type UsageLevel = 'low' | 'mid' | 'high';
export type DayPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

/** 0-100 usage to a coarse level: high from 80%, mid from 50%. */
export function usageLevel(percent: number): UsageLevel {
	if (percent >= 80) return 'high';
	if (percent >= 50) return 'mid';
	return 'low';
}

/** Morning 5-11, afternoon 12-16, evening 17-20, night otherwise. */
export function dayPeriod(hour: number): DayPeriod {
	if (hour >= 5 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 17) return 'afternoon';
	if (hour >= 17 && hour < 21) return 'evening';
	return 'night';
}

/** A 0-1 ratio rounded for a CSS variable. */
export function ratio(value: number, total = 1): number {
	if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
	return Math.round(Math.min(1, Math.max(0, value / total)) * 1000) / 1000;
}

/** `true` as an empty attribute, `false` as no attribute. */
export function flag(on: boolean): '' | undefined {
	return on ? '' : undefined;
}
