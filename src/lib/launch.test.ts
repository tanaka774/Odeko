import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
}));

import { isLaunchable, launchIcon, iconDisplayName } from './launch';
import { toastStore } from '$lib/stores/toast.svelte';
import type { CanvasIcon } from '$lib/icons';

function makeIcon(overrides: Partial<CanvasIcon> = {}): CanvasIcon {
	return {
		id: '1',
		name: 'Test',
		path: '/usr/bin/test',
		icon_type: 'app',
		x: 0,
		y: 0,
		width: 80,
		height: 80,
		...overrides
	};
}

describe('isLaunchable', () => {
	it('returns true for app icons', () => {
		expect(isLaunchable(makeIcon({ icon_type: 'app' }))).toBe(true);
	});

	it('returns true for images with a url', () => {
		expect(isLaunchable(makeIcon({ icon_type: 'image', url: '/some/pic.png' }))).toBe(true);
	});

	it('returns false for images without a url', () => {
		expect(isLaunchable(makeIcon({ icon_type: 'image' }))).toBe(false);
	});

	it('returns false for widgets', () => {
		expect(isLaunchable(makeIcon({ icon_type: 'widget' }))).toBe(false);
	});
});

describe('launchIcon', () => {
	beforeEach(() => {
		invokeMock.mockReset();
		invokeMock.mockResolvedValue(undefined);
	});

	it('launches an app with its path and args', async () => {
		await launchIcon(makeIcon({ path: '/usr/bin/htop', args: '-x --flag' }));

		expect(invokeMock).toHaveBeenCalledWith('launch_app', {
			path: '/usr/bin/htop',
			args: '-x --flag'
		});
		expect(invokeMock).toHaveBeenCalledWith('hide_canvas');
	});

	it('opens an image url', async () => {
		await launchIcon(makeIcon({ icon_type: 'image', url: 'https://example.com' }));

		expect(invokeMock).toHaveBeenCalledWith('open_url', { url: 'https://example.com' });
		expect(invokeMock).toHaveBeenCalledWith('hide_canvas');
	});

	it('opens an image url', async () => {
		await launchIcon(makeIcon({ icon_type: 'image', url: 'asset://pic.png' }));

		expect(invokeMock).toHaveBeenCalledWith('open_url', { url: 'asset://pic.png' });
	});

	it('does nothing for non-launchable icons (image without url)', async () => {
		await launchIcon(makeIcon({ icon_type: 'image' }));

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it('does nothing for widgets', async () => {
		await launchIcon(makeIcon({ icon_type: 'widget' }));

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it('does not throw when invoke fails', async () => {
		invokeMock.mockRejectedValueOnce(new Error('boom'));

		await expect(launchIcon(makeIcon({ icon_type: 'app' }))).resolves.toBeUndefined();
	});

	it('surfaces a failed launch as a toast instead of hiding the canvas', async () => {
		toastStore.clear();
		invokeMock.mockRejectedValueOnce('Path does not exist: /usr/bin/gone');

		await launchIcon(makeIcon({ name: 'Ghost', path: '/usr/bin/gone' }));

		// The canvas must stay visible so the message can be read.
		expect(invokeMock).not.toHaveBeenCalledWith('hide_canvas');
		expect(toastStore.toasts).toHaveLength(1);
		expect(toastStore.toasts[0].message).toContain('Ghost');
		expect(toastStore.toasts[0].detail).toContain('/usr/bin/gone');
		toastStore.clear();
	});

	it('still hides the canvas on a successful launch', async () => {
		toastStore.clear();
		await launchIcon(makeIcon({ icon_type: 'app' }));

		expect(invokeMock).toHaveBeenCalledWith('hide_canvas');
		expect(toastStore.toasts).toHaveLength(0);
	});
});

describe('iconDisplayName', () => {
	it('prefers a custom name', () => {
		expect(iconDisplayName(makeIcon({ name: 'Raw', custom_name: 'Pretty' }))).toBe('Pretty');
	});

	it('falls back to the plain name', () => {
		expect(iconDisplayName(makeIcon({ name: 'Plain', custom_name: null }))).toBe('Plain');
	});

	it('falls back to the path when there is no name', () => {
		expect(iconDisplayName(makeIcon({ name: '', path: '/usr/bin/x' }))).toBe('/usr/bin/x');
	});
});
