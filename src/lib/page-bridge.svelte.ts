import { invoke } from '@tauri-apps/api/core';
import { settingsStore } from '$lib/stores/settings.svelte';
import type { PageKind } from '$lib/html-page';

// Routes messages from sandboxed HTML pages (background layers and Custom
// HTML widgets) by the token each page was built with. Registered once at
// module import: component-lifecycle listeners proved unreliable in the
// built WebKitGTK app.

export interface PageHandle {
	token: string;
	kind: PageKind;
	/** Storage key; widgets only. */
	widgetId?: string;
	frame: () => HTMLIFrameElement | null;
}

export interface PendingRequest {
	token: string;
	id: number;
	url: string;
	host: string;
}

const pages = new Map<string, PageHandle>();

export function registerPage(handle: PageHandle): () => void {
	pages.set(handle.token, handle);
	return () => {
		if (pages.get(handle.token) === handle) pages.delete(handle.token);
	};
}

export function newPageToken(): string {
	return crypto.randomUUID();
}

function hostOf(url: string): string {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
		return parsed.host;
	} catch {
		return '';
	}
}

export function grantedHosts(): string[] {
	return settingsStore.settings.network_grants ?? [];
}

export function grantHost(host: string): void {
	const current = grantedHosts();
	if (current.includes(host)) return;
	settingsStore.updateSettings({ network_grants: [...current, host] });
	void settingsStore.saveSettings();
}

export function revokeHost(host: string): void {
	const current = grantedHosts();
	if (!current.includes(host)) return;
	settingsStore.updateSettings({ network_grants: current.filter((h) => h !== host) });
	void settingsStore.saveSettings();
}

export function setAllowLocalNetwork(enabled: boolean): void {
	settingsStore.updateSettings({ allow_local_network: enabled });
	void settingsStore.saveSettings();
}

async function openLink(url: string) {
	try {
		await invoke('open_url', { url });
		if (settingsStore.settings.hide_on_link_open ?? true) await invoke('hide_canvas');
	} catch (error) {
		console.error('Failed to open link:', error);
	}
}

function createBridge() {
	let pending = $state.raw<PendingRequest[]>([]);

	function reply(
		token: string,
		id: number,
		payload: { ok: boolean; value?: unknown; error?: string }
	) {
		pages
			.get(token)
			?.frame()
			?.contentWindow?.postMessage({ kind: 'odeko-reply', id, ...payload }, '*');
	}

	async function doFetch(token: string, id: number, url: string) {
		try {
			const result = await invoke<{ status: number; body: string }>('widget_fetch', {
				url,
				allowLocal: settingsStore.settings.allow_local_network
			});
			reply(token, id, { ok: true, value: result });
		} catch (error) {
			reply(token, id, { ok: false, error: String(error) });
		}
	}

	function handleFetch(page: PageHandle, id: number, url: unknown) {
		const host = typeof url === 'string' ? hostOf(url) : '';
		if (!host) {
			reply(page.token, id, { ok: false, error: 'only http/https URLs are allowed' });
			return;
		}
		if (grantedHosts().includes(host)) {
			void doFetch(page.token, id, url as string);
			return;
		}
		pending = [...pending, { token: page.token, id, url: url as string, host }];
	}

	async function handleStorage(
		page: PageHandle,
		id: number,
		kind: string,
		key: unknown,
		value: unknown
	) {
		if (!page.widgetId) {
			reply(page.token, id, { ok: false, error: 'storage is only available in widgets' });
			return;
		}
		try {
			if (kind === 'odeko-storage-load') {
				const values = await invoke<Record<string, string>>('widget_data_load', {
					widgetId: page.widgetId
				});
				reply(page.token, id, { ok: true, value: values });
			} else {
				await invoke('widget_data_set', {
					widgetId: page.widgetId,
					key: String(key),
					value: typeof value === 'string' ? value : null
				});
				reply(page.token, id, { ok: true });
			}
		} catch (error) {
			reply(page.token, id, { ok: false, error: String(error) });
		}
	}

	function handleMessage(event: MessageEvent) {
		// Only opaque-origin frames: pages are sandboxed without
		// allow-same-origin, and a frame that navigated away would post with
		// a real origin.
		if (event.origin !== 'null') return;
		const msg = event.data as Record<string, unknown> | null;
		if (!msg || typeof msg.kind !== 'string' || typeof msg.token !== 'string') return;
		const page = pages.get(msg.token);
		if (!page) return;
		const id = typeof msg.id === 'number' ? msg.id : -1;

		switch (msg.kind) {
			case 'widget-fetch':
				if (id >= 0) handleFetch(page, id, msg.url);
				break;
			case 'odeko-storage-load':
			case 'odeko-storage-set':
				if (id >= 0) void handleStorage(page, id, msg.kind, msg.key, msg.value);
				break;
			case 'odeko-open':
				if (typeof msg.url === 'string' && /^(https?|mailto):/i.test(msg.url)) {
					void openLink(msg.url);
				}
				break;
			case 'odeko-key':
				window.dispatchEvent(new KeyboardEvent('keydown', { ...msg, bubbles: true }));
				break;
			case 'odeko-pointer':
			case 'odeko-contextmenu':
				forwardInput(page, msg);
				break;
		}
	}

	// Re-fires input a frame handed back, in app coordinates.
	function forwardInput(page: PageHandle, msg: Record<string, unknown>) {
		const frame = page.frame();
		if (!frame || typeof msg.x !== 'number' || typeof msg.y !== 'number') return;
		const rect = frame.getBoundingClientRect();
		const clientX = rect.left + msg.x;
		const clientY = rect.top + msg.y;
		if (msg.kind === 'odeko-pointer') {
			if (
				page.kind === 'background' &&
				['pointermove', 'pointerdown', 'pointerup'].includes(msg.type as string)
			) {
				window.dispatchEvent(
					new PointerEvent(msg.type as string, {
						clientX,
						clientY,
						button: Number(msg.button) || 0
					})
				);
			}
			return;
		}
		const target = page.kind === 'widget' ? frame : document.elementFromPoint(clientX, clientY);
		target?.dispatchEvent(
			new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				button: 2,
				clientX,
				clientY
			})
		);
	}

	function resolvePrompt(request: PendingRequest, allowed: boolean) {
		pending = pending.filter((entry) => entry !== request);
		if (!allowed) {
			reply(request.token, request.id, { ok: false, error: 'denied by user' });
			return;
		}
		grantHost(request.host);
		// Other requests waiting on the same host go through too.
		const sameHost = pending.filter((entry) => entry.host === request.host);
		pending = pending.filter((entry) => entry.host !== request.host);
		for (const entry of [request, ...sameHost]) void doFetch(entry.token, entry.id, entry.url);
	}

	if (typeof window !== 'undefined') window.addEventListener('message', handleMessage);

	return {
		/** The first waiting request of the page with `token`, if any. */
		pendingFor(token: string): PendingRequest | undefined {
			return pending.find((entry) => entry.token === token);
		},
		/** The first waiting request of any background page. */
		get backgroundPending(): PendingRequest | undefined {
			return pending.find((entry) => pages.get(entry.token)?.kind === 'background');
		},
		resolvePrompt
	};
}

export const bridge = createBridge();
