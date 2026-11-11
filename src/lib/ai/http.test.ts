import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { aiFetch } from './http';

function chunk(text: string, done: boolean): ArrayBuffer {
	const bytes = new TextEncoder().encode(text);
	const out = new Uint8Array(bytes.length + 1);
	out.set(bytes);
	out[bytes.length] = done ? 1 : 0;
	return out.buffer;
}

beforeEach(() => invoke.mockReset());

describe('aiFetch', () => {
	it('sends through Rust with the auth id and streams the body', async () => {
		const reads = [chunk('data: a\n', false), chunk('data: b\n', false), chunk('', true)];
		invoke.mockImplementation(async (command: string) => {
			if (command === 'ai_request_send')
				return {
					rid: 7,
					status: 200,
					status_text: 'OK',
					headers: [['content-type', 'text/event-stream']]
				};
			if (command === 'ai_request_read') return reads.shift();
		});
		const response = await aiFetch(
			'https://api.example.com/v1/chat',
			{ method: 'POST', headers: { Authorization: 'Bearer placeholder' }, body: '{"x":1}' },
			'profile-1'
		);
		expect(await response.text()).toBe('data: a\ndata: b\n');
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		const [, args] = invoke.mock.calls[0];
		expect(args.request).toMatchObject({
			url: 'https://api.example.com/v1/chat',
			method: 'POST',
			body: '{"x":1}',
			auth: 'profile-1'
		});
	});

	it('cancels the Rust request on abort', async () => {
		invoke.mockImplementation(async (command: string) => {
			if (command === 'ai_request_send')
				return { rid: 3, status: 200, status_text: '', headers: [] };
			if (command === 'ai_request_read') return new Promise(() => {});
		});
		const controller = new AbortController();
		const response = await aiFetch('https://x.example', { signal: controller.signal });
		const reading = response.body!.getReader().read();
		controller.abort();
		await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('ai_request_cancel', { rid: 3 }));
		void reading;
	});

	it('does not send when already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(aiFetch('https://x.example', { signal: controller.signal })).rejects.toBeTruthy();
		expect(invoke).not.toHaveBeenCalled();
	});
});
