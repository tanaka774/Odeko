import { invoke } from '@tauri-apps/api/core';
import { settingsStore } from '$lib/stores/settings.svelte';

// Module-level network bridge for Custom HTML widgets. The sandboxed iframe
// cannot call Tauri IPC (opaque origin) and the CSP blocks its fetch(), so it
// posts a widget-fetch message to the parent window; this listener forwards it
// through the widget_fetch command. Registered once at module import time,
// never inside a component (lifecycle/init side-effects proved unreliable in
// the built WebKitGTK app). Grants are app-wide, not per-widget.

export interface PendingRequest {
	id: number;
	url: string;
	host: string;
	iframe: Window;
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

function createBridge() {
	const state = $state({ pending: null as PendingRequest | null });

	function postResult(iframe: Window, id: number, payload: Record<string, unknown>) {
		iframe.postMessage({ kind: 'widget-fetch-result', id, ...payload }, '*');
	}

	async function doFetch(iframe: Window, id: number, url: string) {
		try {
			const result = await invoke<{ status: number; body: string }>('widget_fetch', {
				url,
				allowLocal: settingsStore.settings.allow_local_network
			});
			postResult(iframe, id, { ok: true, status: result.status, body: result.body });
		} catch (error) {
			postResult(iframe, id, { ok: false, error: String(error) });
		}
	}

	function handleMessage(event: MessageEvent) {
		// Only opaque-origin frames may use the bridge: a Custom HTML widget
		// iframe is sandboxed without allow-same-origin, so its origin is
		// "null". A frame that navigated itself to a remote page (allowed by
		// the sandbox) would post with a real origin — rejected here.
		if (event.origin !== 'null') return;

		// WebKitGTK does not make `event.source === iframe.contentWindow` for
		// opaque-origin frames, so the source window cannot identify the owning
		// widget; grants are app-wide, so identification is unnecessary.
		// The sandbox plus the consent prompt gate every fetch.
		const msg = event.data as { kind?: string; id?: number; url?: string };
		if (!msg || msg.kind !== 'widget-fetch') return;
		if (typeof msg.url !== 'string' || typeof msg.id !== 'number') return;

		const host = hostOf(msg.url);
		if (!host) {
			postResult(event.source as Window, msg.id, {
				ok: false,
				error: 'only http/https URLs are allowed'
			});
			return;
		}

		if (grantedHosts().includes(host)) {
			void doFetch(event.source as Window, msg.id, msg.url);
		} else {
			state.pending = { id: msg.id, url: msg.url, host, iframe: event.source as Window };
		}
	}

	function resolvePrompt(allowed: boolean) {
		if (!state.pending) return;
		const request = state.pending;
		state.pending = null;
		if (!allowed) {
			postResult(request.iframe, request.id, { ok: false, error: 'denied by user' });
			return;
		}
		grantHost(request.host);
		void doFetch(request.iframe, request.id, request.url);
	}

	if (typeof window !== 'undefined') {
		window.addEventListener('message', handleMessage);
	}

	return {
		get pending() {
			return state.pending;
		},
		resolvePrompt
	};
}

export const bridge = createBridge();
