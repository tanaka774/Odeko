import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
const convertFileSrcMock = vi.fn((path: string) => `asset://localhost${path}`);

vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args),
	convertFileSrc: (path: string) => convertFileSrcMock(path)
}));

import {
	keybindToString,
	keybindEquals,
	matchesKeybind,
	eventToKeybind,
	findKeybindConflict,
	type KeybindConfig,
	type CanvasSettings
} from './settings.svelte';

type SettingsModule = typeof import('./settings.svelte');

async function loadFreshModule(): Promise<SettingsModule> {
	vi.resetModules();
	return import('./settings.svelte');
}

const KB: KeybindConfig = { key: 'KeyA', ctrl: true, alt: false, shift: false, meta: true };

describe('keybind helpers', () => {
	it('keybindToString formats modifiers and key', () => {
		expect(keybindToString({ key: 'KeyZ', ctrl: true, alt: false, shift: false, meta: true })).toBe(
			'Ctrl + Win + Z'
		);
		expect(keybindToString({ key: 'F2', ctrl: false, alt: true, shift: true, meta: false })).toBe(
			'Alt + Shift + F2'
		);
		expect(
			keybindToString({ key: 'Escape', ctrl: false, alt: false, shift: false, meta: false })
		).toBe('Escape');
	});

	it('keybindEquals compares all fields', () => {
		expect(keybindEquals(KB, { ...KB })).toBe(true);
		expect(keybindEquals(KB, { ...KB, ctrl: false })).toBe(false);
		expect(keybindEquals(KB, { ...KB, key: 'KeyB' })).toBe(false);
		expect(keybindEquals(KB, { ...KB, meta: false })).toBe(false);
	});

	it('eventToKeybind reads code and modifiers from a KeyboardEvent', () => {
		const event = new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true, metaKey: true });
		expect(eventToKeybind(event)).toEqual({
			key: 'KeyA',
			ctrl: true,
			alt: false,
			shift: false,
			meta: true
		});
	});

	it('matchesKeybind returns true only for an identical key combination', () => {
		const match = new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true, metaKey: true });
		const wrongKey = new KeyboardEvent('keydown', { code: 'KeyB', ctrlKey: true, metaKey: true });
		const wrongModifier = new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true });

		expect(matchesKeybind(match, KB)).toBe(true);
		expect(matchesKeybind(wrongKey, KB)).toBe(false);
		expect(matchesKeybind(wrongModifier, KB)).toBe(false);
	});

	it('findKeybindConflict detects app keybind conflicts', () => {
		const conflict = findKeybindConflict(
			{ key: 'KeyZ', ctrl: false, alt: true, shift: false, meta: true },
			{
				appKeybinds: {
					toggle_canvas: { key: 'KeyZ', ctrl: false, alt: true, shift: false, meta: true },
					toggle_edit: { key: 'F2', ctrl: false, alt: false, shift: false, meta: false },
					hide_canvas: { key: 'Escape', ctrl: false, alt: false, shift: false, meta: false },
					undo: { key: 'KeyZ', ctrl: true, alt: false, shift: false, meta: false }
				},
				icons: []
			}
		);
		expect(conflict).toContain('Toggle Canvas');
	});

	it('findKeybindConflict detects conflicts with other icons', () => {
		const conflict = findKeybindConflict(KB, {
			appKeybinds: {
				toggle_canvas: { key: 'KeyZ', ctrl: false, alt: true, shift: false, meta: true },
				toggle_edit: { key: 'F2', ctrl: false, alt: false, shift: false, meta: false },
				hide_canvas: { key: 'Escape', ctrl: false, alt: false, shift: false, meta: false },
				undo: { key: 'KeyZ', ctrl: true, alt: false, shift: false, meta: false }
			},
			icons: [{ id: 'other', name: 'Other App', keybind: KB }]
		});
		expect(conflict).toContain('Other App');
	});

	it('findKeybindConflict ignores the excluded icon itself', () => {
		const result = findKeybindConflict(KB, {
			appKeybinds: {
				toggle_canvas: { key: 'KeyZ', ctrl: false, alt: true, shift: false, meta: true },
				toggle_edit: { key: 'F2', ctrl: false, alt: false, shift: false, meta: false },
				hide_canvas: { key: 'Escape', ctrl: false, alt: false, shift: false, meta: false },
				undo: { key: 'KeyZ', ctrl: true, alt: false, shift: false, meta: false }
			},
			icons: [{ id: 'me', name: 'Me', keybind: KB }],
			excludeIconId: 'me'
		});
		expect(result).toBeNull();
	});

	it('findKeybindConflict returns null for an empty key or no conflict', () => {
		const opts = {
			appKeybinds: {
				toggle_canvas: { key: 'KeyZ', ctrl: false, alt: true, shift: false, meta: true },
				toggle_edit: { key: 'F2', ctrl: false, alt: false, shift: false, meta: false },
				hide_canvas: { key: 'Escape', ctrl: false, alt: false, shift: false, meta: false },
				undo: { key: 'KeyZ', ctrl: true, alt: false, shift: false, meta: false }
			},
			icons: []
		};
		expect(findKeybindConflict({ ...KB, key: '' }, opts)).toBeNull();
		expect(findKeybindConflict(KB, opts)).toBeNull();
	});
});

describe('settings store', () => {
	beforeEach(() => {
		invokeMock.mockReset();
		convertFileSrcMock.mockClear();
	});

	it('loadSettings merges missing keybinds with defaults', async () => {
		invokeMock.mockResolvedValueOnce({
			icons: [],
			active_preset: 'MyPreset',
			settings: {
				grid_size: 64,
				keybind_toggle_canvas: { key: '', ctrl: false, alt: false, shift: false, meta: false }
			}
		});

		const mod = await loadFreshModule();
		await mod.settingsStore.loadSettings();

		expect(mod.settingsStore.settings.grid_size).toBe(64);
		expect(mod.settingsStore.settings.width_percent).toBe(90);
		expect(mod.settingsStore.settings.grid_line_color).toBe('255, 255, 255');
		expect(mod.settingsStore.settings.keybind_toggle_canvas.key).toBe('KeyZ');
		expect(mod.settingsStore.settings.keybind_toggle_canvas.meta).toBe(true);
		expect(mod.settingsStore.activePreset).toBe('MyPreset');
		expect(mod.settingsStore.isLoaded).toBe(true);
	});

	it('loadSettings converts a local background image path', async () => {
		invokeMock.mockResolvedValueOnce({
			icons: [],
			active_preset: null,
			settings: { background_image: '/home/user/bg.jpg' }
		});

		const mod = await loadFreshModule();
		await mod.settingsStore.loadSettings();

		expect(mod.settingsStore.settings.background_image).toBe('asset://localhost/home/user/bg.jpg');
		expect(convertFileSrcMock).toHaveBeenCalledWith('/home/user/bg.jpg');
	});

	it('loadSettings leaves http, data and asset background urls untouched', async () => {
		for (const url of [
			'https://example.com/bg.png',
			'data:image/png;base64,AAA',
			'asset://bg.png'
		]) {
			invokeMock.mockResolvedValueOnce({
				icons: [],
				active_preset: null,
				settings: { background_image: url }
			});
			const mod = await loadFreshModule();
			await mod.settingsStore.loadSettings();
			expect(mod.settingsStore.settings.background_image).toBe(url);
		}
		expect(convertFileSrcMock).not.toHaveBeenCalled();
	});

	it('loadSettings keeps a plain path for background videos', async () => {
		invokeMock.mockResolvedValueOnce({
			icons: [],
			active_preset: null,
			settings: { background_image: '/home/user/bg.mp4' }
		});

		const mod = await loadFreshModule();
		await mod.settingsStore.loadSettings();

		expect(mod.settingsStore.settings.background_image).toBe('/home/user/bg.mp4');
		expect(convertFileSrcMock).not.toHaveBeenCalled();
	});

	it('loadSettings normalizes a legacy asset:// video url back to a path', async () => {
		invokeMock.mockResolvedValueOnce({
			icons: [],
			active_preset: null,
			settings: { background_image: 'asset://localhost/%2Fhome%2Fuser%2Fmy%20video.mp4' }
		});

		const mod = await loadFreshModule();
		await mod.settingsStore.loadSettings();

		expect(mod.settingsStore.settings.background_image).toBe('/home/user/my video.mp4');
		expect(convertFileSrcMock).not.toHaveBeenCalled();
	});

	it('loadSettings keeps the default appearance and strips custom CSS keys', async () => {
		invokeMock.mockResolvedValueOnce({
			icons: [],
			active_preset: null,
			settings: {
				default_appearance: {
					backgroundColor: '#112233',
					opacity: 0.8,
					customCssEnabled: true,
					customCss: 'body { background: red; }'
				}
			}
		});

		const mod = await loadFreshModule();
		await mod.settingsStore.loadSettings();

		// borderRadius is seeded from the legacy canvas border_radius once,
		// so existing layouts keep their corners.
		expect(mod.settingsStore.settings.default_appearance).toEqual({
			backgroundColor: '#112233',
			opacity: 0.8,
			borderRadius: 24
		});
	});

	it('loadSettings seeds the corner radius for a non-object default appearance', async () => {
		invokeMock.mockResolvedValueOnce({
			icons: [],
			active_preset: null,
			settings: { default_appearance: null, border_radius: 40 }
		});

		const mod = await loadFreshModule();
		await mod.settingsStore.loadSettings();

		expect(mod.settingsStore.settings.default_appearance).toEqual({ borderRadius: 40 });
	});

	it('loadSettings clamps font size and drops malformed font fields', async () => {
		invokeMock.mockResolvedValueOnce({
			icons: [],
			active_preset: null,
			settings: {
				default_appearance: {
					borderRadius: 24,
					fontSize: 200,
					fontFamily: '  Georgia, serif  '
				}
			}
		});

		const mod = await loadFreshModule();
		await mod.settingsStore.loadSettings();

		expect(mod.settingsStore.settings.default_appearance).toEqual({
			borderRadius: 24,
			fontSize: 96,
			fontFamily: 'Georgia, serif'
		});
	});

	it('keeps defaults when loadSettings fails', async () => {
		invokeMock.mockRejectedValueOnce(new Error('nope'));
		const mod = await loadFreshModule();

		await mod.settingsStore.loadSettings();

		expect(mod.settingsStore.settings.grid_size).toBe(40);
		expect(mod.settingsStore.isLoaded).toBe(true);
	});

	it('saveSettings persists the current settings via invoke', async () => {
		invokeMock.mockResolvedValueOnce('Default');
		const mod = await loadFreshModule();

		await mod.settingsStore.saveSettings();

		expect(invokeMock).toHaveBeenCalledWith('save_active_settings', {
			settings: mod.settingsStore.settings
		});
		expect(mod.settingsStore.activePreset).toBe('Default');
	});

	it('updateSettings applies every settings field individually', async () => {
		const mod = await loadFreshModule();
		const updates: Array<[keyof CanvasSettings, unknown]> = [
			['width_percent', 50],
			['height_percent', 60],
			['background_color', '1, 2, 3'],
			['background_opacity', 0.42],
			['background_size', 'contain'],
			['background_repeat', true],
			['background_position', 'bottom right'],
			['border_radius', 12],
			['backdrop_darkness', 0.55],
			['position_x', 30],
			['position_y', 40],
			['magnetic_snap', false],
			['grid_size', 64],
			['grid_line_color', '200, 100, 50']
		];

		for (const [key, value] of updates) {
			mod.settingsStore.updateSettings({ [key]: value });
			expect(mod.settingsStore.settings[key]).toEqual(value);
		}
	});

	it('resetToDefaults restores defaults and clears the active preset', async () => {
		const mod = await loadFreshModule();
		mod.settingsStore.updateSettings({ grid_size: 64 });
		mod.settingsStore.setActivePreset('My');

		mod.settingsStore.resetToDefaults();

		expect(mod.settingsStore.settings.grid_size).toBe(40);
		expect(mod.settingsStore.activePreset).toBeNull();
	});

	it('applyLayout sets settings, active preset, and loaded flag', async () => {
		const mod = await loadFreshModule();
		mod.settingsStore.applyLayout({
			icons: [],
			active_preset: 'Applied',
			settings: { ...mod.settingsStore.settings, grid_size: 88 }
		});

		expect(mod.settingsStore.settings.grid_size).toBe(88);
		expect(mod.settingsStore.activePreset).toBe('Applied');
		expect(mod.settingsStore.isLoaded).toBe(true);
	});
});
