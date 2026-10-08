import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkMock = vi.fn();
const downloadAndInstallMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({
	check: (...args: unknown[]) => checkMock(...args)
}));
vi.mock('@tauri-apps/plugin-process', () => ({
	relaunch: (...args: unknown[]) => relaunchMock(...args)
}));

import { checkForUpdate, installUpdate } from './updater';
import type { Update } from '@tauri-apps/plugin-updater';

function fakeUpdate(overrides: Record<string, unknown> = {}): Update {
	return { downloadAndInstall: downloadAndInstallMock, ...overrides } as unknown as Update;
}

describe('checkForUpdate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns null when the running build is already current', async () => {
		checkMock.mockResolvedValue(null);

		await expect(checkForUpdate()).resolves.toBeNull();
	});

	it('normalizes a nullish result to null', async () => {
		checkMock.mockResolvedValue(undefined);

		await expect(checkForUpdate()).resolves.toBeNull();
	});

	it('returns the update when a newer release exists', async () => {
		const update = fakeUpdate({ version: '0.2.0', currentVersion: '0.1.0' });
		checkMock.mockResolvedValue(update);

		await expect(checkForUpdate()).resolves.toBe(update);
	});
});

describe('installUpdate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('installs the download and restarts into it', async () => {
		downloadAndInstallMock.mockResolvedValue(undefined);
		relaunchMock.mockResolvedValue(undefined);

		await installUpdate(fakeUpdate());

		expect(downloadAndInstallMock).toHaveBeenCalledTimes(1);
		expect(relaunchMock).toHaveBeenCalledTimes(1);
	});

	it('does not restart when the install fails', async () => {
		downloadAndInstallMock.mockRejectedValue(new Error('signature mismatch'));

		await expect(installUpdate(fakeUpdate())).rejects.toThrow('signature mismatch');
		expect(relaunchMock).not.toHaveBeenCalled();
	});
});
