import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildSrcdoc } from './html-page';

// Runs the injected helper against this test window: `parent` is the window
// itself here, so posted messages can be captured with a spy.
function loadHelper(kind: 'widget' | 'background', token = 'tok') {
	const srcdoc = buildSrcdoc('', true, null, token, kind);
	const code = srcdoc.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)![1];
	new Function(code)();
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the helper is untyped page JS
	return (window as unknown as { odeko: Record<string, any> }).odeko;
}

let posted: Record<string, unknown>[];

beforeEach(() => {
	posted = [];
	vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
		posted.push(message as Record<string, unknown>);
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	delete (window as { odeko?: unknown }).odeko;
	document.body.innerHTML = '';
});

function reply(id: number, value: unknown) {
	window.dispatchEvent(
		new MessageEvent('message', { data: { kind: 'odeko-reply', id, ok: true, value } })
	);
}

describe('page helper', () => {
	it('stamps every request with the token', () => {
		const odeko = loadHelper('background', 'abc');
		void odeko.fetch('https://example.com');
		expect(posted.at(-1)).toMatchObject({ kind: 'widget-fetch', token: 'abc', from: 'background' });
	});

	it('resolves fetch with the reply value', async () => {
		const odeko = loadHelper('widget');
		const result = odeko.fetch('https://example.com');
		const request = posted.find((m) => m.kind === 'widget-fetch')!;
		reply(request.id as number, { status: 200, body: 'ok' });
		await expect(result).resolves.toEqual({ status: 200, body: 'ok' });
	});

	it('loads storage once and round-trips JSON values', async () => {
		const odeko = loadHelper('widget');
		const load = posted.find((m) => m.kind === 'odeko-storage-load')!;
		reply(load.id as number, { count: '3', obj: '{"a":1}' });

		await expect(odeko.storage.get('count')).resolves.toBe(3);
		await expect(odeko.storage.get('obj')).resolves.toEqual({ a: 1 });
		await expect(odeko.storage.get('missing')).resolves.toBeNull();

		const saved = odeko.storage.set('count', 4);
		await Promise.resolve();
		await Promise.resolve();
		const set = posted.find((m) => m.kind === 'odeko-storage-set')!;
		expect(set).toMatchObject({ key: 'count', value: '4' });
		reply(set.id as number, undefined);
		await saved;
		await expect(odeko.storage.get('count')).resolves.toBe(4);
		await expect(odeko.storage.keys()).resolves.toEqual(['count', 'obj']);
	});

	it('has no storage in background pages', () => {
		const odeko = loadHelper('background');
		expect(odeko.storage).toBeUndefined();
	});

	it('opens absolute links through the app and keeps fragment links', () => {
		loadHelper('widget');
		document.body.innerHTML =
			'<a id="out" href="https://example.com/x">x</a><a id="in" href="#top">y</a>';

		const outEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
		document.getElementById('out')!.dispatchEvent(outEvent);
		expect(outEvent.defaultPrevented).toBe(true);
		expect(posted.at(-1)).toMatchObject({ kind: 'odeko-open', url: 'https://example.com/x' });

		const count = posted.length;
		const inEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
		document.getElementById('in')!.dispatchEvent(inEvent);
		expect(inEvent.defaultPrevented).toBe(false);
		expect(posted.length).toBe(count);
	});
});
