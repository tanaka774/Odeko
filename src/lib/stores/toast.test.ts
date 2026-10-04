import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { toastStore, errorMessage } from './toast.svelte';

describe('toastStore', () => {
	beforeEach(() => {
		toastStore.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
		toastStore.clear();
	});

	it('starts empty', () => {
		expect(toastStore.toasts).toHaveLength(0);
	});

	it('shows a message', () => {
		toastStore.show('Could not launch Firefox', '/usr/bin/firefox');

		expect(toastStore.toasts).toHaveLength(1);
		expect(toastStore.toasts[0].message).toBe('Could not launch Firefox');
		expect(toastStore.toasts[0].detail).toBe('/usr/bin/firefox');
	});

	it('ignores empty messages', () => {
		toastStore.show('   ');

		expect(toastStore.toasts).toHaveLength(0);
	});

	it('dismisses by id', () => {
		const id = toastStore.show('boom');
		expect(id).not.toBeNull();

		toastStore.dismiss(id as number);

		expect(toastStore.toasts).toHaveLength(0);
	});

	it('auto-dismisses after the timeout', () => {
		vi.useFakeTimers();
		toastStore.show('boom', undefined, 1000);

		expect(toastStore.toasts).toHaveLength(1);
		vi.advanceTimersByTime(1000);
		expect(toastStore.toasts).toHaveLength(0);
	});

	it('keeps the queue short so it cannot cover the canvas', () => {
		for (let i = 0; i < 6; i++) toastStore.show(`message ${i}`);

		expect(toastStore.toasts.length).toBeLessThanOrEqual(3);
		expect(toastStore.toasts.at(-1)?.message).toBe('message 5');
	});
});

describe('errorMessage', () => {
	it('reads strings', () => {
		expect(errorMessage('Path does not exist')).toBe('Path does not exist');
	});

	it('reads Error instances', () => {
		expect(errorMessage(new Error('boom'))).toBe('boom');
	});

	it('reads objects with a message', () => {
		expect(errorMessage({ message: 'from object' })).toBe('from object');
	});

	it('stringifies anything else', () => {
		expect(errorMessage(42)).toBe('42');
	});
});
