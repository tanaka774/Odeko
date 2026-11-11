import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('./http', () => ({ aiFetch: vi.fn() }));

import { htmlToText } from './web';

describe('htmlToText', () => {
	it('keeps readable text and links, drops scripts and styles', () => {
		const text = htmlToText(
			'<html><head><title>Page</title><style>p{}</style></head><body><nav>menu</nav><main><h1>Hello</h1><p>World <a href="https://x.dev">link</a></p><script>evil()</script></main></body></html>'
		);
		expect(text).toContain('Page');
		expect(text).toContain('Hello');
		expect(text).toContain('link (https://x.dev)');
		expect(text).not.toContain('evil');
		expect(text).not.toContain('menu');
	});
});

describe('redactSecrets', () => {
	it('removes common key formats', async () => {
		const { redactSecrets } = await import('./chat.svelte');
		const out = redactSecrets(
			'sk-proj-abcdefghijklmnop Authorization: Bearer abcdefghijklmnopqrstuv "x-api-key": "abcdef1234567890" AIzaSyA1234567890abcdefghijk'
		);
		expect(out).not.toMatch(/abcdefghijklmnop|abcdef1234567890|AIzaSy/);
		expect(out).toContain('Bearer [redacted]');
	});
});
