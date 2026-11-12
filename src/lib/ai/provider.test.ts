import { describe, it, expect, vi } from 'vitest';

const sent = vi.hoisted(
	() => [] as { url: string; body: Record<string, unknown>; auth?: string }[]
);
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('./http', () => ({
	keyedFetch: (auth: string) => async (url: string, init: RequestInit) => {
		sent.push({ url, body: JSON.parse(init.body as string), auth });
		return new Response('{"error":{"message":"stop"}}', { status: 400 });
	}
}));

import { streamText } from 'ai';
import { createModel, planRequestBody, profileProblem } from './provider';

describe('ChatGPT plan provider', () => {
	it('sends Responses requests with store false and without rejected fields', async () => {
		const model = await createModel({
			id: 'p-plan',
			name: 'ChatGPT',
			kind: 'chatgpt',
			baseUrl: 'https://evil.example',
			model: 'gpt-6.1-sol'
		});
		const result = streamText({
			model,
			instructions: 'be helpful',
			messages: [{ role: 'user', content: 'hi' }],
			temperature: 0.5,
			maxOutputTokens: 100,
			maxRetries: 0
		});
		for await (const part of result.fullStream) void part;
		const request = sent[0];
		expect(request.url).toBe('https://api.openai.com/v1/responses');
		expect(request.auth).toBe('p-plan');
		expect(request.body).toMatchObject({ model: 'gpt-6.1-sol', store: false, stream: true });
		expect(request.body).not.toHaveProperty('temperature');
		expect(request.body).not.toHaveProperty('max_output_tokens');
		expect(JSON.stringify(request.body.input)).not.toContain('"role":"system"');
	});

	it('strips unsupported fields from any body', () => {
		const body = JSON.parse(planRequestBody('{"model":"m","top_p":1,"user":"u","store":true}'));
		expect(body).toEqual({ model: 'm', store: false, stream: true });
	});

	it('needs no API key, only a model', () => {
		const profile = { id: 'p', name: 'C', kind: 'chatgpt' as const, baseUrl: '', model: '' };
		expect(profileProblem(profile, false)).toMatch(/no model/);
		expect(profileProblem({ ...profile, model: 'gpt' }, false)).toBeNull();
	});
});
