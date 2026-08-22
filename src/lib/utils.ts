import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};

/**
 * Normalize a user-typed color into the "R, G, B" string format the
 * launcher/icon background settings store. Accepts hex codes
 * ("#ff8800" or "#f80"), plain "R, G, B" triples, and rgb()/rgba()
 * values. Returns null when the input is not a complete, valid color
 * so callers can leave the stored value untouched while typing.
 */
export function normalizeColorInput(value: string): string | null {
	const trimmed = value.trim();

	if (trimmed.startsWith('#')) {
		let hex = trimmed.slice(1);
		if (hex.length === 3) {
			hex = [...hex].map((c) => c + c).join('');
		}
		if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
		const red = parseInt(hex.slice(0, 2), 16);
		const green = parseInt(hex.slice(2, 4), 16);
		const blue = parseInt(hex.slice(4, 6), 16);
		return `${red}, ${green}, ${blue}`;
	}

	const parts = trimmed
		.replace(/^rgba?\(/, '')
		.replace(/\)$/, '')
		.split(',')
		.map((part) => part.trim());
	if (parts.length !== 3) return null;

	const channels = parts.map(Number);
	if (channels.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;

	return `${channels[0]}, ${channels[1]}, ${channels[2]}`;
}
