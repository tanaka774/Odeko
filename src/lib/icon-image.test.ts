import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
const readFileMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args)
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
	readFile: (...args: unknown[]) => readFileMock(...args)
}));

type IconImageModule = typeof import('./icon-image');

async function loadFreshModule(): Promise<IconImageModule> {
	vi.resetModules();
	return import('./icon-image');
}

function base64(bytes: number[]): string {
	return btoa(String.fromCharCode(...bytes));
}

beforeEach(() => {
	invokeMock.mockReset();
	readFileMock.mockReset();
});

describe('loadIconDataUrl', () => {
	it('returns undefined for an empty path', async () => {
		const mod = await loadFreshModule();
		expect(await mod.loadIconDataUrl(undefined)).toBeUndefined();
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it('returns browser urls as-is without calling invoke', async () => {
		const mod = await loadFreshModule();
		for (const url of [
			'https://a.com/i.png',
			'http://a.com/i.jpg',
			'asset://x.png',
			'data:image/png;base64,AAAA'
		]) {
			expect(await mod.loadIconDataUrl(url)).toBe(url);
		}
		expect(invokeMock).not.toHaveBeenCalled();
		expect(readFileMock).not.toHaveBeenCalled();
	});

	it('returns undefined for .exe paths', async () => {
		const mod = await loadFreshModule();
		expect(await mod.loadIconDataUrl('C:\\Windows\\System32\\calc.exe')).toBeUndefined();
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it('loads local png icons via the get_icon_base64 command', async () => {
		invokeMock.mockResolvedValueOnce('data:image/png;base64,AAA');
		const mod = await loadFreshModule();

		expect(await mod.loadIconDataUrl('/usr/share/icons/app.png')).toBe('data:image/png;base64,AAA');
		expect(invokeMock).toHaveBeenCalledWith('get_icon_base64', {
			iconPath: '/usr/share/icons/app.png'
		});
	});

	it('returns undefined when the base64 command fails', async () => {
		invokeMock.mockRejectedValueOnce(new Error('no icon'));
		const mod = await loadFreshModule();

		expect(await mod.loadIconDataUrl('/usr/share/icons/app.png')).toBeUndefined();
	});

	it('reads regular image files into a data url', async () => {
		readFileMock.mockResolvedValueOnce(new Uint8Array([255, 216, 255]));
		const mod = await loadFreshModule();

		expect(await mod.loadIconDataUrl('/home/user/Pictures/photo.jpg')).toBe(
			`data:image/jpeg;base64,${base64([255, 216, 255])}`
		);
		expect(readFileMock).toHaveBeenCalledWith('/home/user/Pictures/photo.jpg');
	});

	it('converts icns files to png before reading them', async () => {
		invokeMock.mockResolvedValueOnce('/tmp/converted.png');
		readFileMock.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
		const mod = await loadFreshModule();

		const result = await mod.loadIconDataUrl('/Applications/App.icns');
		expect(invokeMock).toHaveBeenCalledWith('convert_icns_to_png', {
			iconPath: '/Applications/App.icns'
		});
		expect(result).toBe(`data:image/png;base64,${base64([1, 2, 3])}`);
	});

	it('caches results and does not invoke twice for the same path', async () => {
		invokeMock.mockResolvedValue('data:image/png;base64,AAA');
		const mod = await loadFreshModule();

		const first = await mod.loadIconDataUrl('/x.png');
		const second = await mod.loadIconDataUrl('/x.png');

		expect(first).toBe(second);
		expect(invokeMock).toHaveBeenCalledTimes(1);
	});

	it('caches browser urls too', async () => {
		const mod = await loadFreshModule();

		await mod.loadIconDataUrl('https://a.com/i.png');
		await mod.loadIconDataUrl('https://a.com/i.png');

		expect(invokeMock).not.toHaveBeenCalled();
	});
});
