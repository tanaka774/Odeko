import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
}));

type PlatformModule = typeof import('./platform.svelte');

async function loadFreshModule(): Promise<PlatformModule> {
	vi.resetModules();
	return import('./platform.svelte');
}

beforeEach(() => {
	invokeMock.mockReset();
});

describe('platformStore', () => {
	it('loads a supported platform', async () => {
		invokeMock.mockResolvedValueOnce('macos');
		const mod = await loadFreshModule();

		await mod.platformStore.load();
		expect(mod.platformStore.platform).toBe('macos');
		expect(mod.platformStore.isMacos).toBe(true);
	});

	it('normalizes unknown platform values to "unknown"', async () => {
		invokeMock.mockResolvedValueOnce('beos');
		const mod = await loadFreshModule();

		await mod.platformStore.load();
		expect(mod.platformStore.platform).toBe('unknown');
		expect(mod.platformStore.isMacos).toBe(false);
	});

	it('falls back to unknown when invoke fails', async () => {
		invokeMock.mockRejectedValueOnce(new Error('nope'));
		const mod = await loadFreshModule();

		await mod.platformStore.load();
		expect(mod.platformStore.platform).toBe('unknown');
	});

	it('only invokes the backend once even with repeated load calls', async () => {
		invokeMock.mockResolvedValue('linux');
		const mod = await loadFreshModule();

		await mod.platformStore.load();
		await mod.platformStore.load();

		expect(invokeMock).toHaveBeenCalledTimes(1);
	});
});
