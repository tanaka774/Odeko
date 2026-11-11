import { describe, it, expect, vi, beforeEach } from 'vitest';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';

const stored = vi.hoisted(() => ({
	settings: {
		profiles: [{ id: 'p1', name: 'Test', kind: 'openai', baseUrl: '', model: 'm' }],
		defaultProfileId: 'p1',
		configAccess: 'ask',
		search: null
	} as Record<string, unknown>,
	keys: new Set<string>(['p1'])
}));

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(
		async (
			command: string,
			args?: { settings?: Record<string, unknown>; id?: string; key?: string }
		) => {
			if (command === 'load_ai_settings') return { ...stored.settings, keys: [...stored.keys] };
			if (command === 'ai_canvas_snapshot') return 'UE5H';
			if (command === 'save_ai_settings' && args?.settings) stored.settings = args.settings;
			if (command === 'set_ai_secret' && args?.id) {
				if (args.key) stored.keys.add(args.id);
				else stored.keys.delete(args.id);
			}
			return undefined;
		}
	)
}));

const presetFiles = vi.hoisted(() => new Map<string, unknown>());
vi.mock('$lib/presets', () => ({
	listPresets: async () =>
		[...presetFiles.keys()].map((name) => ({
			name,
			icon_count: 0,
			updated_at: 0,
			is_active: name === 'Default'
		})),
	loadPreset: async (name: string) => presetFiles.get(name),
	savePresetAs: async (name: string, icons: unknown[], settings: unknown) => {
		presetFiles.set(name, { icons, settings });
	},
	deletePreset: async (name: string) => {
		presetFiles.delete(name);
	},
	renamePreset: async (from: string, to: string) => {
		presetFiles.set(to, presetFiles.get(from));
		presetFiles.delete(from);
	}
}));

const httpFetch = vi.hoisted(() => vi.fn());
vi.mock('./http', () => ({ aiFetch: httpFetch, keyedFetch: () => httpFetch }));

const model = { current: null as MockLanguageModelV4 | null };
vi.mock('./provider', async (importOriginal) => ({
	...(await importOriginal<typeof import('./provider')>()),
	createModel: async () => model.current
}));

import { settingsStore } from '$lib/stores/settings.svelte';
import { createChatSession } from './chat.svelte';
import { setLayoutBridge } from './layout-bridge';
import { aiSettingsStore } from './settings.svelte';
import { setPresetSwitcher } from './presets';
import type { LayoutState } from './config';

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 }
};

function step(parts: LanguageModelV4StreamPart[], toolCalls = false) {
	return {
		stream: simulateReadableStream({
			chunks: [
				...parts,
				{
					type: 'finish',
					usage,
					finishReason: { unified: toolCalls ? 'tool-calls' : 'stop', raw: undefined }
				} as LanguageModelV4StreamPart
			],
			chunkDelayInMs: null,
			initialDelayInMs: null
		})
	};
}

function call(id: string, toolName: string, input: unknown) {
	return step(
		[{ type: 'tool-call', toolCallId: id, toolName, input: JSON.stringify(input) }],
		true
	);
}

function say(text: string) {
	return step([
		{ type: 'text-start', id: 't' },
		{ type: 'text-delta', id: 't', delta: text },
		{ type: 'text-end', id: 't' }
	]);
}

let layout: LayoutState;
let preset: string | null;

beforeEach(async () => {
	stored.settings = {
		...stored.settings,
		profiles: [{ id: 'p1', name: 'Test', kind: 'openai', baseUrl: '', model: 'm' }],
		configAccess: 'ask',
		search: null
	};
	stored.keys = new Set(['p1']);
	await aiSettingsStore.save(stored.settings as never);
	await aiSettingsStore.setKey('p1', 'k');
	httpFetch.mockReset();
	preset = 'Default';
	layout = {
		settings: JSON.parse(
			JSON.stringify(settingsStore.normalizeSettings({ ...settingsStore.settings }))
		),
		icons: []
	};
	setLayoutBridge({
		read: () => JSON.parse(JSON.stringify(layout)),
		preset: () => preset,
		write: async (next) => {
			layout = JSON.parse(JSON.stringify(next));
		}
	});
});

function session() {
	return createChatSession({ profileId: () => 'p1', instructions: () => '' });
}

async function waitForPermission(chat: ReturnType<typeof session>) {
	await vi.waitFor(() => expect(chat.permission).not.toBeNull());
	return chat.permission!;
}

const rounder = {
	summary: 'Rounder panel',
	operations: [{ op: 'replace', path: '/settings/border_radius', value: 40 }]
};

describe('chat session', () => {
	it('starts as a general assistant without config tools', async () => {
		model.current = new MockLanguageModelV4({ doStream: [say('Hello')] });
		const chat = session();
		await chat.send('hi');
		const first = model.current.doStreamCalls[0];
		const toolNames = (first.tools ?? []).map((t) => t.name).sort();
		expect(toolNames).toEqual(['fetch_page', 'load_skill']);
		expect(JSON.stringify(first.prompt)).toContain('Current date and time');
		expect(JSON.stringify(first.prompt)).not.toContain('Current config overview');
	});

	it('asks before loading the config skill, then edits and reverts', async () => {
		model.current = new MockLanguageModelV4({
			doStream: [
				call('c1', 'load_skill', { name: 'odeko-config' }),
				call('c2', 'patch_config', rounder),
				say('Done')
			]
		});
		const chat = session();
		const before = layout.settings.border_radius;
		const sending = chat.send('make the corners rounder');

		const request = await waitForPermission(chat);
		expect(request.kind).toBe('config');
		chat.answerPermission('allow');
		await sending;

		expect(layout.settings.border_radius).toBe(40);
		const second = model.current.doStreamCalls[1];
		expect((second.tools ?? []).map((t) => t.name)).toContain('patch_config');
		expect(JSON.stringify(second.prompt)).toContain('Current config overview');
		expect(chat.skills).toEqual(['odeko-config']);

		await chat.revert('c2');
		expect(layout.settings.border_radius).toBe(before);
	});

	it('answers without config when access is denied', async () => {
		model.current = new MockLanguageModelV4({
			doStream: [call('c1', 'load_skill', { name: 'odeko-config' }), say('Okay')]
		});
		const chat = session();
		const sending = chat.send('show my config');
		await waitForPermission(chat);
		chat.answerPermission('deny');
		await sending;
		expect(chat.skills).toEqual([]);
		expect(JSON.stringify(model.current.doStreamCalls[1].prompt)).toContain('denied config access');
		const tools = (model.current.doStreamCalls[1].tools ?? []).map((t) => t.name);
		expect(tools).not.toContain('get_config');
	});

	it('remembers "always allow"', async () => {
		model.current = new MockLanguageModelV4({
			doStream: [call('c1', 'load_skill', { name: 'odeko-config' }), say('ok')]
		});
		const chat = session();
		const sending = chat.send('change things');
		await waitForPermission(chat);
		chat.answerPermission('always');
		await sending;
		expect(aiSettingsStore.settings.configAccess).toBe('always');

		model.current = new MockLanguageModelV4({
			doStream: [call('c1', 'load_skill', { name: 'odeko-config' }), say('ok')]
		});
		const other = session();
		await other.send('again');
		expect(other.skills).toEqual(['odeko-config']);
	});

	it('requires approval for sensitive changes', async () => {
		stored.settings = { ...stored.settings, configAccess: 'always' };
		await aiSettingsStore.save(stored.settings as never);
		model.current = new MockLanguageModelV4({
			doStream: [
				call('c1', 'load_skill', { name: 'odeko-config' }),
				call('c2', 'patch_config', {
					summary: 'Add terminal launcher',
					operations: [
						{
							op: 'add',
							path: '/icons/app-x',
							value: {
								icon_type: 'app',
								name: 'x',
								path: '/usr/bin/rm',
								args: '-rf ~',
								x: 0,
								y: 0,
								width: 80,
								height: 80
							}
						}
					]
				}),
				say('Denied')
			]
		});
		const chat = session();
		const sending = chat.send('add a launcher');
		const request = await waitForPermission(chat);
		expect(request.kind).toBe('sensitive');
		expect(request.details.join('\n')).toContain('/usr/bin/rm');
		chat.answerPermission('deny');
		await sending;
		expect(layout.icons).toHaveLength(0);
	});

	it('refuses to revert on another preset', async () => {
		stored.settings = { ...stored.settings, configAccess: 'always' };
		await aiSettingsStore.save(stored.settings as never);
		model.current = new MockLanguageModelV4({
			doStream: [
				call('c1', 'load_skill', { name: 'odeko-config' }),
				call('c2', 'patch_config', rounder),
				say('Done')
			]
		});
		const chat = session();
		await chat.send('rounder');
		preset = 'Other';
		await chat.revert('c2');
		expect(layout.settings.border_radius).toBe(40);
		const part = chat.messages[1].parts.find((p) => p.type === 'tool' && p.id === 'c2');
		expect(part).toMatchObject({
			change: { reverted: false, note: expect.stringContaining('Default') }
		});
		preset = 'Default';
		await chat.revert('c2');
		expect(layout.settings.border_radius).not.toBe(40);
	});

	it('reports a rejected patch back to the model', async () => {
		stored.settings = { ...stored.settings, configAccess: 'always' };
		await aiSettingsStore.save(stored.settings as never);
		model.current = new MockLanguageModelV4({
			doStream: [
				call('c1', 'load_skill', { name: 'odeko-config' }),
				call('c2', 'patch_config', {
					summary: 'grant',
					operations: [{ op: 'add', path: '/settings/network_grants/-', value: 'x.com' }]
				}),
				say('Cannot')
			]
		});
		const chat = session();
		await chat.send('allow x.com');
		expect(layout.settings.network_grants).toEqual([]);
		expect(JSON.stringify(model.current.doStreamCalls[2].prompt)).toContain('network permissions');
	});

	it('searches the web with the chosen service and its own key', async () => {
		await aiSettingsStore.update({
			search: { service: 'tavily', deepseekProfileId: null, searxngUrl: '' }
		});
		await aiSettingsStore.setKey('search:tavily', 'tvly-test');
		httpFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					results: [{ title: 'Weather', url: 'https://w.example', content: '25C' }]
				}),
				{ status: 200 }
			)
		);
		model.current = new MockLanguageModelV4({
			doStream: [call('c1', 'web_search', { query: 'tokyo weather' }), say('Sunny')]
		});
		const chat = session();
		await chat.send('weather?');
		const [url, init, auth] = httpFetch.mock.calls[0];
		expect(url).toBe('https://api.tavily.com/search');
		expect(auth).toBe('search:tavily');
		expect(JSON.stringify(init)).not.toContain('tvly-test');
		expect(JSON.stringify(model.current.doStreamCalls[1].prompt)).toContain('https://w.example');
	});

	it('defaults to DeepSeek search with the DeepSeek profile key', async () => {
		await aiSettingsStore.update({
			profiles: [
				{ id: 'p1', name: 'Test', kind: 'openai', baseUrl: '', model: 'm' },
				{
					id: 'ds',
					name: 'DeepSeek',
					kind: 'openai-compatible',
					baseUrl: 'https://api.deepseek.com/v1',
					model: 'deepseek-chat'
				}
			],
			search: null
		});
		await aiSettingsStore.setKey('ds', 'sk-ds');
		expect(aiSettingsStore.search).toMatchObject({ service: 'deepseek', deepseekProfileId: 'ds' });
		httpFetch.mockResolvedValueOnce(
			new Response(
				JSON.stringify({
					results: [{ title: 'T', url: 'https://d.example', summary: 'S', snippet: '', date: null }]
				}),
				{ status: 200 }
			)
		);
		model.current = new MockLanguageModelV4({
			doStream: [call('c1', 'web_search', { query: 'news' }), say('ok')]
		});
		await session().send('news?');
		const [url, , auth] = httpFetch.mock.calls[0];
		expect(url).toBe('https://api.deepseek.com/v1/tools/search');
		expect(auth).toBe('ds');
	});

	it('hides web_search when search is off', async () => {
		model.current = new MockLanguageModelV4({ doStream: [say('ok')] });
		await session().send('search');
		const call0 = model.current.doStreamCalls[0];
		expect((call0.tools ?? []).map((t) => t.name)).not.toContain('web_search');
		expect(JSON.stringify(call0.prompt)).toContain('Web search is turned off');
	});

	it('redacts key-like text from errors and tool output', async () => {
		await aiSettingsStore.update({
			search: { service: 'tavily', deepseekProfileId: null, searxngUrl: '' }
		});
		await aiSettingsStore.setKey('search:tavily', 'x');
		httpFetch.mockResolvedValueOnce(
			new Response('{"error":"bad key tvly-abcdef123456789"}', { status: 401 })
		);
		model.current = new MockLanguageModelV4({
			doStream: [call('c1', 'web_search', { query: 'x' }), say('ok')]
		});
		const chat = session();
		await chat.send('search');
		const part = chat.messages[1].parts.find((p) => p.type === 'tool');
		expect(JSON.stringify(part)).not.toContain('tvly-abcdef123456789');
		expect(JSON.stringify(part)).toContain('[redacted]');
	});

	it('shows the provider error, not the generic stream message', async () => {
		model.current = new MockLanguageModelV4({
			doStream: async () => {
				throw Object.assign(new Error('invalid x-api-key'), { statusCode: 401 });
			}
		});
		const chat = session();
		await chat.send('hi');
		expect(chat.messages[1].error).toBe('HTTP 401: invalid x-api-key');
	});

	it('sends attached images as image parts and drops old ones from history', async () => {
		const image = {
			url: 'data:image/jpeg;base64,QUJD',
			mediaType: 'image/jpeg',
			width: 1,
			height: 1
		};
		model.current = new MockLanguageModelV4({ doStream: [say('nice')] });
		const chat = session();
		await chat.send('like this', [image]);
		const prompt = model.current.doStreamCalls[0].prompt;
		const user = prompt.find((m) => m.role === 'user')!;
		expect(JSON.stringify(user.content)).toContain('"mediaType":"image/jpeg"');
		expect(chat.messages[0].parts[0]).toEqual({ type: 'image', image });

		model.current = new MockLanguageModelV4({
			doStream: Array.from({ length: 3 }, () => say('ok'))
		});
		const many = Array.from({ length: 4 }, () => image);
		await chat.send('a', many);
		await chat.send('b', many);
		const last = JSON.stringify(model.current.doStreamCalls[1].prompt);
		expect(last).toContain('earlier images omitted');
	});

	it('shows a canvas screenshot to the model after the tool call', async () => {
		stored.settings = { ...stored.settings, configAccess: 'always' };
		await aiSettingsStore.save(stored.settings as never);
		const panel = document.createElement('div');
		panel.className = 'canvas-panel';
		panel.getBoundingClientRect = () => ({ x: 0, y: 0, width: 800, height: 600 }) as DOMRect;
		document.body.append(panel);
		model.current = new MockLanguageModelV4({
			doStream: [
				call('c1', 'load_skill', { name: 'odeko-config' }),
				call('c2', 'screenshot_canvas', {}),
				say('Looks good'),
				say('again')
			]
		});
		const chat = session();
		await chat.send('check it');
		panel.remove();
		const third = JSON.stringify(model.current.doStreamCalls[2].prompt);
		expect(third).toContain('Canvas screenshot');
		expect(third).toContain('UE5H');
		expect(chat.messages[1].parts.some((p) => p.type === 'image')).toBe(true);

		await chat.send('and now?');
		const followUp = JSON.stringify(model.current.doStreamCalls[3].prompt);
		expect(followUp).toContain('UE5H');
		expect(followUp.indexOf('screenshot_canvas')).toBeLessThan(followUp.indexOf('UE5H'));
	});

	describe('presets', () => {
		beforeEach(async () => {
			stored.settings = { ...stored.settings, configAccess: 'always' };
			await aiSettingsStore.save(stored.settings as never);
			settingsStore.setActivePreset('Default');
			presetFiles.clear();
			presetFiles.set('Default', { icons: [], settings: {} });
			presetFiles.set('Old', { icons: [], settings: { border_radius: 7 } });
		});

		it('deletes after approval and restores on revert', async () => {
			model.current = new MockLanguageModelV4({
				doStream: [
					call('c1', 'load_skill', { name: 'odeko-config' }),
					call('c2', 'delete_preset', { name: 'Old' }),
					say('Deleted')
				]
			});
			const chat = session();
			const sending = chat.send('delete Old');
			const request = await waitForPermission(chat);
			expect(request.title).toContain('Old');
			chat.answerPermission('allow');
			await sending;
			expect(presetFiles.has('Old')).toBe(false);
			await chat.revert('c2');
			expect(presetFiles.get('Old')).toMatchObject({ settings: { border_radius: 7 } });
		});

		it('refuses to delete the active preset without asking', async () => {
			model.current = new MockLanguageModelV4({
				doStream: [
					call('c1', 'load_skill', { name: 'odeko-config' }),
					call('c2', 'delete_preset', { name: 'Default' }),
					say('Cannot')
				]
			});
			const chat = session();
			await chat.send('delete Default');
			expect(chat.permission).toBeNull();
			expect(presetFiles.has('Default')).toBe(true);
		});

		it('switches only after the reply ends', async () => {
			const switched: string[] = [];
			setPresetSwitcher(async (name) => {
				switched.push(name);
			});
			const steps = [
				call('c1', 'load_skill', { name: 'odeko-config' }),
				call('c2', 'switch_preset', { name: 'Old' }),
				say('Switching')
			];
			let switchedDuringReply = false;
			model.current = new MockLanguageModelV4({
				doStream: async () => {
					if (switched.length > 0) switchedDuringReply = true;
					return steps.shift()!;
				}
			});
			await session().send('go to Old');
			expect(switched).toEqual(['Old']);
			expect(switchedDuringReply).toBe(false);
			setPresetSwitcher(null);
		});
	});

	it('shows a setup hint without a provider', async () => {
		await aiSettingsStore.update({ profiles: [], defaultProfileId: null });
		stored.keys.clear();
		const chat = createChatSession({ profileId: () => 'missing', instructions: () => '' });
		await chat.send('hi');
		expect(chat.messages[1].error).toMatch(/No AI provider/);
	});
});
