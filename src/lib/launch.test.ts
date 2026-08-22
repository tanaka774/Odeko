import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
}));

import { isLaunchable, launchIcon } from './launch';
import type { LauncherIcon } from '$lib/icons';

function makeIcon(overrides: Partial<LauncherIcon> = {}): LauncherIcon {
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

	it('returns true for links with a url', () => {
		expect(isLaunchable(makeIcon({ icon_type: 'link', url: 'https://example.com' }))).toBe(true);
	});

	it('returns false for links without a url', () => {
		expect(isLaunchable(makeIcon({ icon_type: 'link' }))).toBe(false);
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
		expect(invokeMock).toHaveBeenCalledWith('hide_launcher');
	});

	it('opens a link url', async () => {
		await launchIcon(makeIcon({ icon_type: 'link', url: 'https://example.com' }));

		expect(invokeMock).toHaveBeenCalledWith('open_url', { url: 'https://example.com' });
		expect(invokeMock).toHaveBeenCalledWith('hide_launcher');
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
});
