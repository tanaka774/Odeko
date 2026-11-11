import { invoke } from '@tauri-apps/api/core';

interface Head {
	rid: number;
	status: number;
	status_text: string;
	headers: [string, string][];
}

function headerPairs(headers: HeadersInit | undefined): [string, string][] {
	if (!headers) return [];
	if (headers instanceof Headers) return [...headers.entries()];
	if (Array.isArray(headers)) return headers.map(([k, v]) => [k, v]);
	return Object.entries(headers).map(([k, v]) => [k, String(v)]);
}

async function bodyText(body: BodyInit | null | undefined): Promise<string | undefined> {
	if (body == null) return undefined;
	if (typeof body === 'string') return body;
	return new Response(body).text();
}

/**
 * A `fetch` that runs in Rust. `auth` names the stored key (a profile id or
 * `search:<service>`); Rust adds it, so keys never reach the webview.
 */
export async function aiFetch(
	input: RequestInfo | URL,
	init: RequestInit = {},
	auth?: string
): Promise<Response> {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	const signal = init.signal;
	if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

	const head = await invoke<Head>('ai_request_send', {
		request: {
			url,
			method: init.method ?? 'GET',
			headers: headerPairs(init.headers),
			body: await bodyText(init.body),
			auth: auth ?? null
		}
	});

	const cancel = () => void invoke('ai_request_cancel', { rid: head.rid });
	if (signal?.aborted) {
		cancel();
		throw signal.reason ?? new DOMException('Aborted', 'AbortError');
	}

	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const raw = new Uint8Array(await invoke<ArrayBuffer>('ai_request_read', { rid: head.rid }));
				const done = raw[raw.length - 1] === 1;
				if (raw.length > 1) controller.enqueue(raw.slice(0, -1));
				if (done) controller.close();
			} catch (error) {
				controller.error(error);
			}
		},
		cancel
	});
	signal?.addEventListener('abort', cancel, { once: true });

	const status = head.status;
	const nullBody = status === 204 || status === 205 || status === 304;
	return new Response(nullBody ? null : body, {
		status,
		statusText: head.status_text,
		headers: head.headers
	});
}

/** A fetch bound to one stored key, for provider SDKs. */
export function keyedFetch(auth: string | undefined): typeof globalThis.fetch {
	return ((input: RequestInfo | URL, init?: RequestInit) =>
		aiFetch(input, init, auth)) as typeof globalThis.fetch;
}
