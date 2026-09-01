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

// Normalize a user-typed color into the "R, G, B" format the canvas
// settings store. Accepts hex, plain triples and rgb()/rgba(); returns null
// while the input is incomplete so callers keep the stored value untouched.
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

// Returns `value` only when it is a plain "R, G, B" triple of 0-255 integers.
// Color fields arrive via imported presets (untrusted) and are interpolated
// into rgba(...) style strings, so anything else — CSS fragments, url()
// payloads, quotes — is rejected in favor of the fallback.
export function safeRgbColor(value: string | undefined, fallback: string): string {
	if (!value) return fallback;
	const channels = value.split(',').map((part) => part.trim());
	if (channels.length !== 3) return fallback;
	if (!channels.every((channel) => /^\d{1,3}$/.test(channel))) return fallback;
	const nums = channels.map(Number);
	if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return fallback;
	return `${nums[0]}, ${nums[1]}, ${nums[2]}`;
}

// Strips characters that could break out of a CSS url("...") string before a
// preset-controlled background value is interpolated into style strings.
export function safeCssUrl(value: string | null | undefined): string | null {
	if (!value) return null;
	const cleaned = value.replace(/["'()\\;\n\r\t\0]/g, '').trim();
	return cleaned ? cleaned : null;
}
