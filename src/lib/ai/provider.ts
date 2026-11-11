import type { LanguageModel } from 'ai';
import { keyedFetch } from './http';
import type { AiProfile } from './settings.svelte';

// The real key is added by Rust (see ai_http.rs); the SDKs only need a
// non-empty placeholder, which Rust strips before sending.
const PLACEHOLDER = 'odeko-key-in-rust';

/** Each provider SDK is loaded on first use, so unused ones never load. */
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
	if (profile.kind === 'openai-compatible' && !profile.baseUrl.trim())
		return `Profile "${profile.name}" needs a base URL.`;
	if (profile.kind !== 'openai-compatible' && !hasKey)
		return `Profile "${profile.name}" has no API key.`;
	return null;
}
