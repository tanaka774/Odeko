import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import type { CanvasIcon } from '$lib/icons';
import { settingsStore, type CanvasSettings } from '$lib/stores/settings.svelte';
import {
	applyConfigPatch,
	buildView,
	overview,
	PatchRejected,
	readView,
	sensitiveChanges,
	type LayoutState
} from './config';
import { revertChange, revertSettings } from './layout-bridge';

function makeState(): LayoutState {
	const settings = settingsStore.normalizeSettings({
		...settingsStore.settings,
		network_grants: ['api.example.com'],
		allow_local_network: true
	} as CanvasSettings);
	const icons: CanvasIcon[] = [
		{
			id: 'widget-clock',
			name: 'Clock',
			path: '',
			icon_type: 'widget',
			widget_type: 'clock',
			widget_config: { format: '24h', appearance: { borderRadius: 12 } },
			x: 10,
			y: 20,
			width: 200,
			height: 120,
			z: 1
		},
		{
			id: 'widget-clip',
			name: 'Clipboard',
			path: '',
			icon_type: 'widget',
			widget_type: 'clipboard',
			widget_config: {
				history: [{ id: 'a', type: 'text', text: 'secret', createdAt: 1, pinned: false }]
			},
			x: 300,
			y: 20,
			width: 300,
			height: 360,
			z: 2
		},
		{
			id: 'widget-chat',
			name: 'AI Chat',
			path: '',
			icon_type: 'widget',
			widget_type: 'aichat',
			widget_config: {},
			x: 600,
			y: 20,
			width: 360,
			height: 480,
			z: 3
		}
	];
	return { settings, icons };
}

const normalize = settingsStore.normalizeSettings;

describe('buildView', () => {
	it('hides network permissions and runtime data', () => {
		const { view, hidden } = buildView(makeState());
		expect(view.settings).not.toHaveProperty('network_grants');
		expect(view.settings).not.toHaveProperty('allow_local_network');
		const clip = view.icons['widget-clip'].widget_config as Record<string, unknown>;
		expect(clip.history).toMatch(/^<<hidden:/);
		expect(hidden.get('/icons/widget-clip/widget_config/history')).toHaveLength(1);
		expect(JSON.stringify(view)).not.toContain('secret');
	});

	it('keys icons by id', () => {
		expect(Object.keys(buildView(makeState()).view.icons)).toEqual([
			'widget-clock',
			'widget-clip',
			'widget-chat'
		]);
		expect(readView(makeState(), '/icons/widget-clock/x')).toBe(10);
	});

	it('summarizes the layout for the prompt', () => {
		const text = overview(makeState());
		expect(text).toContain('widget-clock widget:clock');
		expect(text).not.toContain('secret');
	});
});

describe('applyConfigPatch', () => {
	it('applies settings and icon changes', () => {
		const state = makeState();
		const { next, changes } = applyConfigPatch(
			state,
			[
				{ op: 'replace', path: '/settings/border_radius', value: 8 },
				{
					op: 'add',
					path: '/icons/widget-clock/widget_config/appearance/customCss',
					value: '.time-display { color: red; }'
				},
				{
					op: 'add',
					path: '/icons/widget-clock/widget_config/appearance/customCssEnabled',
					value: true
				}
			],
			normalize
		);
		expect(next.settings.border_radius).toBe(8);
		const clock = next.icons.find((icon) => icon.id === 'widget-clock')!;
		expect(clock.widget_config?.appearance?.customCss).toContain('red');
		expect(changes).toHaveLength(3);
	});

	it('restores hidden values and keeps network permissions', () => {
		const state = makeState();
		const { next } = applyConfigPatch(
			state,
			[{ op: 'replace', path: '/icons/widget-clip/x', value: 50 }],
			normalize
		);
		const clip = next.icons.find((icon) => icon.id === 'widget-clip')!;
		expect((clip.widget_config as { history: unknown[] }).history).toHaveLength(1);
		expect(next.settings.network_grants).toEqual(['api.example.com']);
		expect(next.settings.allow_local_network).toBe(true);
	});

	it('rejects network permission changes', () => {
		expect(() =>
			applyConfigPatch(
				makeState(),
				[{ op: 'add', path: '/settings/network_grants', value: ['evil.com'] }],
				normalize
			)
		).toThrow(PatchRejected);
		expect(() =>
			applyConfigPatch(
				makeState(),
				[{ op: 'replace', path: '/settings/allow_local_network', value: true }],
				normalize
			)
		).toThrow(/network permissions/);
	});

	it('reports invalid paths and shapes back to the model', () => {
		expect(() =>
			applyConfigPatch(makeState(), [{ op: 'replace', path: '/icons/nope/x', value: 1 }], normalize)
		).toThrow(PatchRejected);
		expect(() =>
			applyConfigPatch(
				makeState(),
				[{ op: 'replace', path: '/icons/widget-clock/x', value: 'left' }],
				normalize
			)
		).toThrow(/x must be a number/);
		expect(() =>
			applyConfigPatch(
				makeState(),
				[
					{
						op: 'add',
						path: '/icons/widget-x',
						value: { icon_type: 'widget', widget_type: 'nope', x: 0, y: 0 }
					}
				],
				normalize
			)
		).toThrow(/widget_type must be one of/);
	});

	it('adds a widget with defaults', () => {
		const { next } = applyConfigPatch(
			makeState(),
			[
				{
					op: 'add',
					path: '/icons/widget-ai-memo',
					value: { icon_type: 'widget', widget_type: 'memo', x: 5, y: 5 }
				}
			],
			normalize
		);
		const memo = next.icons.find((icon) => icon.id === 'widget-ai-memo')!;
		expect(memo.width).toBeGreaterThan(0);
		expect(memo.widget_config).toMatchObject({ wordWrap: true });
		expect(memo.z).toBe(4);
	});

	it('does not let the AI remove a chat widget', () => {
		expect(() =>
			applyConfigPatch(makeState(), [{ op: 'remove', path: '/icons/widget-chat' }], normalize)
		).toThrow(/AI chat widgets cannot be removed/);
	});

	it('reports values the app normalized', () => {
		const { adjusted } = applyConfigPatch(
			makeState(),
			[
				{
					op: 'add',
					path: '/settings/background_layers/-',
					value: { id: 'layer-ai', type: 'color', color: '1, 2, 3', opacity: 5 }
				}
			],
			normalize
		);
		expect(adjusted.join('\n')).toContain('/settings/background_layers/1/opacity');
	});
});

describe('revertChange', () => {
	it('reverts one change and keeps later ones', () => {
		const start = makeState();
		const first = applyConfigPatch(
			start,
			[{ op: 'replace', path: '/settings/border_radius', value: 4 }],
			normalize
		).next;
		const second = applyConfigPatch(
			first,
			[{ op: 'replace', path: '/icons/widget-clock/x', value: 99 }],
			normalize
		).next;
		const reverted = revertChange(start, first, second);
		expect(reverted.settings.border_radius).toBe(start.settings.border_radius);
		expect(reverted.icons.find((icon) => icon.id === 'widget-clock')!.x).toBe(99);
	});

	it('removes an added widget on revert', () => {
		const start = makeState();
		const added = applyConfigPatch(
			start,
			[
				{
					op: 'add',
					path: '/icons/widget-ai-memo',
					value: { icon_type: 'widget', widget_type: 'memo', x: 5, y: 5 }
				}
			],
			normalize
		).next;
		const reverted = revertChange(start, added, added);
		expect(reverted.icons.map((icon) => icon.id)).toEqual(start.icons.map((icon) => icon.id));
	});
});

describe('legacy settings', () => {
	it('hides unknown keys and keeps them on save', () => {
		const state = makeState();
		(state.settings as unknown as Record<string, unknown>).background_image = 'asset://old.gif';
		expect(buildView(state).view.settings).not.toHaveProperty('background_image');
		const { next } = applyConfigPatch(
			state,
			[{ op: 'replace', path: '/settings/border_radius', value: 3 }],
			normalize
		);
		expect((next.settings as unknown as Record<string, unknown>).background_image).toBe(
			'asset://old.gif'
		);
	});
});

describe('sensitiveChanges', () => {
	const add = (value: Record<string, unknown>) =>
		applyConfigPatch(makeState(), [{ op: 'add', path: '/icons/app-new', value }], normalize)
			.sensitive;

	it('flags launching programs', () => {
		expect(
			add({ icon_type: 'app', name: 'X', path: '/bin/sh', x: 0, y: 0, width: 80, height: 80 })
		).toEqual(['"X" launches the program: /bin/sh']);
	});

	it('flags non-web links but not http links', () => {
		const base = { icon_type: 'image', name: 'L', path: '', x: 0, y: 0, width: 80, height: 80 };
		expect(add({ ...base, url: 'https://example.com' })).toEqual([]);
		expect(add({ ...base, url: 'file:///etc/passwd' })[0]).toContain('non-web link');
	});

	it('flags Custom HTML widgets that load a local file', () => {
		const base = { icon_type: 'widget', widget_type: 'custom', x: 0, y: 0 };
		expect(add({ ...base, widget_config: { content: '<p>x</p>' } })).toEqual([]);
		expect(add({ ...base, widget_config: { content: '', file: '/home/me/w.html' } })[0]).toContain(
			'loads the local file: /home/me/w.html'
		);
	});

	it('flags global shortcuts and disabled power confirmation', () => {
		const state = makeState();
		state.icons.push({
			id: 'widget-sleep',
			name: 'Sleep',
			path: '',
			icon_type: 'widget',
			widget_type: 'sleep',
			widget_config: { requireConfirmation: true },
			x: 0,
			y: 0,
			width: 100,
			height: 100
		});
		const { sensitive } = applyConfigPatch(
			state,
			[
				{
					op: 'replace',
					path: '/icons/widget-sleep/widget_config/requireConfirmation',
					value: false
				},
				{ op: 'add', path: '/icons/widget-clock/keybind_global', value: true }
			],
			normalize
		);
		expect(sensitive.join('\n')).toMatch(/sleep without asking/);
		expect(sensitive.join('\n')).toMatch(/system-wide shortcut/);
	});

	it('flags keybind changes and ignores style changes', () => {
		const state = makeState();
		const style = applyConfigPatch(
			state,
			[{ op: 'replace', path: '/settings/border_radius', value: 2 }],
			normalize
		);
		expect(style.sensitive).toEqual([]);
		const keys = applyConfigPatch(
			state,
			[{ op: 'replace', path: '/settings/keybind_undo/key', value: 'KeyY' }],
			normalize
		);
		expect(keys.sensitive).toEqual(['App shortcut undo changes']);
		expect(sensitiveChanges(state, state)).toEqual([]);
	});
});

describe('revertSettings', () => {
	it('undoes only the AI settings change', () => {
		const before = makeState().settings;
		const after = { ...before, border_radius: 40 };
		const current = { ...after, backdrop_darkness: 0.9 };
		const reverted = revertSettings(before, after, current);
		expect(reverted.border_radius).toBe(before.border_radius);
		expect(reverted.backdrop_darkness).toBe(0.9);
	});
});
