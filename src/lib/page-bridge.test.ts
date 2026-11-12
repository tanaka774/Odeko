import { describe, it, expect, vi, afterEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
	invoke: (...args: unknown[]) => invokeMock(...args),
	convertFileSrc: (path: string) => path
}));

import { bridge, registerPage } from './page-bridge.svelte';
import { settingsStore } from '$lib/stores/settings.svelte';

function fakeFrame() {
	const received: Record<string, unknown>[] = [];
	const frame = {
		contentWindow: { postMessage: (message: Record<string, unknown>) => received.push(message) },
		getBoundingClientRect: () => ({ left: 0, top: 0 }),
		dispatchEvent: vi.fn()
	} as unknown as HTMLIFrameElement;
	return { frame, received };
}

function send(data: Record<string, unknown>, origin = 'null') {
	window.dispatchEvent(new MessageEvent('message', { origin, data }));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const cleanups: (() => void)[] = [];

afterEach(() => {
	cleanups.splice(0).forEach((stop) => stop());
	invokeMock.mockReset();
	settingsStore.updateSettings({ network_grants: [] });
});

describe('page bridge', () => {
	it('answers storage requests of the page that asked, keyed by its widget', async () => {
		const a = fakeFrame();
		const b = fakeFrame();
		cleanups.push(
			registerPage({ token: 'a', kind: 'widget', widgetId: 'w-a', frame: () => a.frame })
		);
		cleanups.push(
			registerPage({ token: 'b', kind: 'widget', widgetId: 'w-b', frame: () => b.frame })
		);
		invokeMock.mockResolvedValue({ k: '1' });

		send({ kind: 'odeko-storage-load', token: 'b', id: 7 });
		await flush();

		expect(invokeMock).toHaveBeenCalledWith('widget_data_load', { widgetId: 'w-b' });
		expect(b.received).toEqual([{ kind: 'odeko-reply', id: 7, ok: true, value: { k: '1' } }]);
		expect(a.received).toEqual([]);
	});

	it('ignores unknown tokens and non-opaque origins', async () => {
		const a = fakeFrame();
		cleanups.push(
			registerPage({ token: 'a', kind: 'widget', widgetId: 'w', frame: () => a.frame })
		);
		send({ kind: 'odeko-storage-load', token: 'nope', id: 1 });
		send({ kind: 'odeko-storage-load', token: 'a', id: 1 }, 'https://evil.example');
		await flush();
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it('denies storage to background pages', async () => {
		const a = fakeFrame();
		cleanups.push(registerPage({ token: 'bg', kind: 'background', frame: () => a.frame }));
		send({ kind: 'odeko-storage-set', token: 'bg', id: 2, key: 'k', value: '1' });
		await flush();
		expect(invokeMock).not.toHaveBeenCalled();
		expect(a.received[0]).toMatchObject({ id: 2, ok: false });
	});

	it('asks only on the requesting page and fetches once allowed', async () => {
		const a = fakeFrame();
		const b = fakeFrame();
		cleanups.push(
			registerPage({ token: 'a', kind: 'widget', widgetId: 'w-a', frame: () => a.frame })
		);
		cleanups.push(
			registerPage({ token: 'b', kind: 'widget', widgetId: 'w-b', frame: () => b.frame })
		);
		invokeMock.mockResolvedValue({ status: 200, body: 'x' });

		send({ kind: 'widget-fetch', token: 'a', id: 3, url: 'https://api.example.com/v' });
		expect(bridge.pendingFor('a')?.host).toBe('api.example.com');
		expect(bridge.pendingFor('b')).toBeUndefined();

		bridge.resolvePrompt(bridge.pendingFor('a')!, true);
		await flush();
		expect(invokeMock).toHaveBeenCalledWith(
			'widget_fetch',
			expect.objectContaining({ url: 'https://api.example.com/v' })
		);
		expect(a.received[0]).toMatchObject({ id: 3, ok: true, value: { status: 200, body: 'x' } });
		expect(bridge.pendingFor('a')).toBeUndefined();
	});

	it('opens only web and mail links, then hides the canvas', async () => {
		const a = fakeFrame();
		cleanups.push(registerPage({ token: 'a', kind: 'widget', frame: () => a.frame }));
		send({ kind: 'odeko-open', token: 'a', url: 'javascript:alert(1)' });
		send({ kind: 'odeko-open', token: 'a', url: 'https://example.com' });
		await flush();
		expect(invokeMock.mock.calls).toEqual([
			['open_url', { url: 'https://example.com' }],
			['hide_canvas']
		]);
	});

	it('keeps the canvas open when the setting is off', async () => {
		settingsStore.updateSettings({ hide_on_link_open: false });
		const a = fakeFrame();
		cleanups.push(registerPage({ token: 'a', kind: 'widget', frame: () => a.frame }));
		send({ kind: 'odeko-open', token: 'a', url: 'https://example.com' });
		await flush();
		expect(invokeMock.mock.calls).toEqual([['open_url', { url: 'https://example.com' }]]);
		settingsStore.updateSettings({ hide_on_link_open: true });
	});
});
