import { invoke } from '@tauri-apps/api/core';

export type AiProviderKind = 'openai' | 'chatgpt' | 'anthropic' | 'google' | 'openai-compatible';

export interface AiProfile {
	id: string;
	name: string;
	kind: AiProviderKind;
	/** Required for openai-compatible: any endpoint, local or remote. */
	baseUrl: string;
	model: string;
}

export type SearchService = 'off' | 'native' | 'deepseek' | 'tavily' | 'brave' | 'exa' | 'searxng';

export interface SearchSettings {
	service: SearchService;
	/** DeepSeek search reuses this profile's key. */
	deepseekProfileId: string | null;
	searxngUrl: string;
}

export type ConfigAccess = 'ask' | 'always';

export interface AiSettings {
	profiles: AiProfile[];
	defaultProfileId: string | null;
	/** Unset until the user picks; then the default below no longer applies. */
	search: SearchSettings | null;
	/** Whether the chat may read and edit the canvas config without asking. */
	configAccess: ConfigAccess;
}

export const PROVIDER_LABELS: Record<AiProviderKind, string> = {
	openai: 'OpenAI',
	chatgpt: 'ChatGPT plan (Sign in with ChatGPT)',
	anthropic: 'Anthropic',
	google: 'Google Gemini',
	'openai-compatible': 'OpenAI-compatible (custom endpoint)'
};

export const SEARCH_LABELS: Record<SearchService, string> = {
	off: 'Off',
	native: "Model's built-in search (OpenAI, ChatGPT plan, Anthropic, Gemini)",
	deepseek: 'DeepSeek',
	tavily: 'Tavily',
	brave: 'Brave Search',
	exa: 'Exa',
	searxng: 'SearXNG (self-hosted)'
};

export const SEARCH_KEY_SERVICES = ['tavily', 'brave', 'exa'] as const;

export const NATIVE_SEARCH_KINDS: AiProviderKind[] = ['openai', 'chatgpt', 'anthropic', 'google'];

export function searchKeyId(service: string): string {
	return `search:${service}`;
}

export const PROVIDER_PRESETS: {
	label: string;
	kind: AiProviderKind;
	baseUrl: string;
	model: string;
}[] = [
	{ label: 'OpenAI', kind: 'openai', baseUrl: '', model: 'gpt-5.1' },
	{ label: 'ChatGPT plan', kind: 'chatgpt', baseUrl: '', model: '' },
	{ label: 'Anthropic', kind: 'anthropic', baseUrl: '', model: 'claude-sonnet-4-5' },
	{ label: 'Google Gemini', kind: 'google', baseUrl: '', model: 'gemini-2.5-flash' },
	{
		label: 'DeepSeek',
		kind: 'openai-compatible',
		baseUrl: 'https://api.deepseek.com/v1',
		model: 'deepseek-chat'
	},
	{
		label: 'OpenRouter',
		kind: 'openai-compatible',
		baseUrl: 'https://openrouter.ai/api/v1',
		model: 'openai/gpt-5.1'
	},
	{
		label: 'Ollama',
		kind: 'openai-compatible',
		baseUrl: 'http://localhost:11434/v1',
		model: 'qwen3'
	},
	{ label: 'LM Studio', kind: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', model: '' },
	{ label: 'Custom', kind: 'openai-compatible', baseUrl: '', model: '' }
];

export function isDeepSeek(profile: AiProfile): boolean {
	return /(^|\.)deepseek\.com$/i.test(hostOf(profile.baseUrl));
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

export function newProfile(preset = PROVIDER_PRESETS[0]): AiProfile {
	return {
		id: `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
		name: preset.label,
		kind: preset.kind,
		baseUrl: preset.baseUrl,
		model: preset.model
	};
}

/** The search actually used: the saved choice, else DeepSeek when a DeepSeek profile exists. */
export function effectiveSearch(settings: AiSettings): SearchSettings {
	if (settings.search) return settings.search;
	const deepseek = settings.profiles.find(isDeepSeek);
	return {
		service: deepseek ? 'deepseek' : 'off',
		deepseekProfileId: deepseek?.id ?? null,
		searxngUrl: ''
	};
}

function sanitizeSearch(raw: unknown): SearchSettings | null {
	if (!raw || typeof raw !== 'object') return null;
	const value = raw as Partial<SearchSettings>;
	const service = (
		value.service && value.service in SEARCH_LABELS ? value.service : 'off'
	) as SearchService;
	return {
		service,
		deepseekProfileId: typeof value.deepseekProfileId === 'string' ? value.deepseekProfileId : null,
		searxngUrl: typeof value.searxngUrl === 'string' ? value.searxngUrl : ''
	};
}

function sanitize(raw: unknown): { settings: AiSettings; keys: string[] } {
	const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<AiSettings> & {
		keys?: unknown;
	};
	const profiles = Array.isArray(value.profiles)
		? value.profiles
				.filter((p): p is AiProfile => !!p && typeof p.id === 'string' && p.kind in PROVIDER_LABELS)
				.map(({ id, name, kind, baseUrl, model }) => ({
					id,
					name: name ?? '',
					kind,
					baseUrl: baseUrl ?? '',
					model: model ?? ''
				}))
		: [];
	const defaultProfileId = profiles.some((p) => p.id === value.defaultProfileId)
		? (value.defaultProfileId as string)
		: (profiles[0]?.id ?? null);
	return {
		settings: {
			profiles,
			defaultProfileId,
			search: sanitizeSearch(value.search),
			configAccess: value.configAccess === 'always' ? 'always' : 'ask'
		},
		keys: Array.isArray(value.keys)
			? value.keys.filter((k): k is string => typeof k === 'string')
			: []
	};
}

function createAiSettingsStore() {
	let settings = $state<AiSettings>(sanitize({}).settings);
	let keys = $state<string[]>([]);
	let loaded = $state(false);
	let loading: Promise<void> | null = null;

	function load(): Promise<void> {
		loading ??= invoke<unknown>('load_ai_settings')
			.then((raw) => {
				({ settings, keys } = sanitize(raw));
			})
			.catch((error) => console.error('Failed to load AI settings:', error))
			.finally(() => {
				loaded = true;
			});
		return loading;
	}

	async function save(next: AiSettings) {
		settings = sanitize(next).settings;
		await invoke('save_ai_settings', { settings });
	}

	function update(patch: Partial<AiSettings>) {
		return save({ ...$state.snapshot(settings), ...patch } as AiSettings);
	}

	/** Stores a key in Rust; an empty key removes it. */
	async function setKey(id: string, key: string) {
		await invoke('set_ai_secret', { id, key });
		const has = key.trim().length > 0;
		keys = has ? [...new Set([...keys, id])] : keys.filter((k) => k !== id);
	}

	async function pruneKeys() {
		const keep = [...settings.profiles.map((p) => p.id), ...SEARCH_KEY_SERVICES.map(searchKeyId)];
		await invoke('prune_ai_secrets', { keep });
		keys = keys.filter((k) => keep.includes(k));
	}

	return {
		get settings() {
			return settings;
		},
		get loaded() {
			return loaded;
		},
		hasKey(id: string) {
			return keys.includes(id);
		},
		get search() {
			return effectiveSearch(settings);
		},
		load,
		save,
		update,
		setKey,
		pruneKeys,
		profile(id: string | null | undefined): AiProfile | null {
			return (
				settings.profiles.find((p) => p.id === id) ??
				settings.profiles.find((p) => p.id === settings.defaultProfileId) ??
				null
			);
		}
	};
}

export const aiSettingsStore = createAiSettingsStore();
