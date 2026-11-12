import type { LanguageModel, ToolSet } from 'ai';
import { keyedFetch } from './http';
import type { AiProfile } from './settings.svelte';

// The real key is added by Rust (see ai_http.rs); the SDKs only need a
// non-empty placeholder, which Rust strips before sending.
const PLACEHOLDER = 'odeko-key-in-rust';

const PLAN_UNSUPPORTED_FIELDS = [
	'background',
	'conversation',
	'max_output_tokens',
	'max_tool_calls',
	'metadata',
	'previous_response_id',
	'prompt_cache_retention',
	'safety_identifier',
	'temperature',
	'top_logprobs',
	'top_p',
	'truncation',
	'user'
];

export function planRequestBody(body: string): string {
	const parsed = JSON.parse(body) as Record<string, unknown>;
	for (const field of PLAN_UNSUPPORTED_FIELDS) delete parsed[field];
	parsed.store = false;
	parsed.stream = true;
	return JSON.stringify(parsed);
}

function withoutUnsupportedFields(fetch: typeof globalThis.fetch): typeof globalThis.fetch {
	return ((input: RequestInfo | URL, init?: RequestInit) =>
		fetch(
			input,
			typeof init?.body === 'string' ? { ...init, body: planRequestBody(init.body) } : init
		)) as typeof globalThis.fetch;
}

export interface ModelSetup {
	model: LanguageModel;
	/** The provider's own web search tool, when it has one. */
	nativeSearch: ToolSet | null;
}

/** Each provider SDK is loaded on first use, so unused ones never load. */
export async function createModelSetup(profile: AiProfile): Promise<ModelSetup> {
	const fetch = keyedFetch(profile.id);
	const baseURL = profile.baseUrl.trim() || undefined;
	const id = profile.model.trim();
	switch (profile.kind) {
		case 'openai':
		case 'chatgpt': {
			const { createOpenAI } = await import('@ai-sdk/openai');
			const provider =
				profile.kind === 'chatgpt'
					? createOpenAI({ apiKey: PLACEHOLDER, fetch: withoutUnsupportedFields(fetch) })
					: createOpenAI({ apiKey: PLACEHOLDER, baseURL, fetch });
			return {
				model: provider.responses(id),
				nativeSearch: { web_search: provider.tools.webSearch() }
			};
		}
		case 'anthropic': {
			const { createAnthropic } = await import('@ai-sdk/anthropic');
			const provider = createAnthropic({
				apiKey: PLACEHOLDER,
				baseURL,
				fetch,
				headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
			});
			return {
				model: provider(id),
				nativeSearch: { web_search: provider.tools.webSearch_20260318({ maxUses: 5 }) }
			};
		}
		case 'google': {
			const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
			const provider = createGoogleGenerativeAI({ apiKey: PLACEHOLDER, baseURL, fetch });
			return {
				model: provider(id),
				nativeSearch: { google_search: provider.tools.googleSearch({}) }
			};
		}
		case 'openai-compatible':
			return { model: await createModel(profile), nativeSearch: null };
	}
}

export async function createModel(profile: AiProfile): Promise<LanguageModel> {
	const fetch = keyedFetch(profile.id);
	const baseURL = profile.baseUrl.trim() || undefined;
	const model = profile.model.trim();
	const apiKey = PLACEHOLDER;
	switch (profile.kind) {
		case 'openai': {
			const { createOpenAI } = await import('@ai-sdk/openai');
			return createOpenAI({ apiKey, baseURL, fetch })(model);
		}
		case 'chatgpt': {
			// Plan usage requires the Responses API with store: false and
			// stream: true; sampling and token-limit fields are rejected.
			const { createOpenAI } = await import('@ai-sdk/openai');
			return createOpenAI({ apiKey, fetch: withoutUnsupportedFields(fetch) }).responses(model);
		}
		case 'anthropic': {
			const { createAnthropic } = await import('@ai-sdk/anthropic');
			return createAnthropic({
				apiKey,
				baseURL,
				fetch,
				headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
			})(model);
		}
		case 'google': {
			const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
			return createGoogleGenerativeAI({ apiKey, baseURL, fetch })(model);
		}
		case 'openai-compatible': {
			if (!baseURL) throw new Error('Base URL is required for an OpenAI-compatible provider');
			const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
			return createOpenAICompatible({
				name: profile.name || 'custom',
				apiKey,
				baseURL,
				fetch,
				includeUsage: true
			}).chatModel(model);
		}
	}
}

export function profileProblem(profile: AiProfile | null, hasKey: boolean): string | null {
	if (!profile) return 'No AI provider set up yet. Open the widget settings to add one.';
	if (!profile.model.trim()) return `Profile "${profile.name}" has no model.`;
	if (profile.kind === 'chatgpt') return null;
	if (profile.kind === 'openai-compatible' && !profile.baseUrl.trim())
		return `Profile "${profile.name}" needs a base URL.`;
	if (profile.kind !== 'openai-compatible' && !hasKey)
		return `Profile "${profile.name}" has no API key.`;
	return null;
}
