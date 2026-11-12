import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import type { AiChatWidgetConfig } from './types';

const files = vi.hoisted(() => new Map<string, unknown>());
const invokeMock = vi.hoisted(() =>
	vi.fn(async (command: string, args?: { widgetId?: string; chat?: unknown }) => {
		if (command === 'load_ai_settings') return { profiles: [], keys: [] };
		if (command === 'load_ai_chat') return files.get(args!.widgetId!) ?? null;
		if (command === 'save_ai_chat') files.set(args!.widgetId!, args!.chat);
		if (command === 'delete_ai_chat') files.delete(args!.widgetId!);
		return undefined;
	})
);
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import AiChatWidget from './AiChatWidget.svelte';

globalThis.ResizeObserver ??= class {
	observe() {}
	disconnect() {}
	unobserve() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollTo ??= () => {};

function storedChat(text: string) {
	return {
		messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text }] }],
		history: [{ role: 'user', content: text }]
	};
}

function mount(initial: AiChatWidgetConfig = {}) {
	let config = initial;
	const onConfigChange = vi.fn((next: AiChatWidgetConfig) => {
		config = next;
		result.rerender({ config, widgetId: 'w1', onConfigChange });
	});
	const result = render(AiChatWidget, { config, widgetId: 'w1', onConfigChange });
	return { ...result, current: () => config, onConfigChange };
}

beforeEach(() => files.clear());
afterEach(() => {
	cleanup();
	invokeMock.mockClear();
});

describe('AiChatWidget tabs', () => {
	it('starts with one nameless tab that loads the pre-tab chat file', async () => {
		files.set('w1', storedChat('old conversation'));
		const { container } = mount();
		const tabs = container.querySelectorAll('.chat-tab');
		expect(tabs).toHaveLength(1);
		expect(tabs[0].textContent?.trim()).toBe('');
		await waitFor(() => expect(container.textContent).toContain('old conversation'));
	});

	it('adds a tab with its own empty chat and switches back', async () => {
		files.set('w1', storedChat('first tab text'));
		const { container, current } = mount();
		await waitFor(() => expect(container.textContent).toContain('first tab text'));

		await fireEvent.click(container.querySelector('.add-tab-btn')!);
		expect(current().tabs).toHaveLength(2);
		const second = current().tabs![1];
		expect(second.name).toBe('');
		expect(second.color).not.toBe(current().tabs![0].color);
		await waitFor(() => expect(container.textContent).not.toContain('first tab text'));

		await fireEvent.click(container.querySelectorAll('.chat-tab')[0]);
		await waitFor(() => expect(container.textContent).toContain('first tab text'));
	});

	it('renames and recolors a tab from its editor', async () => {
		const { container, current } = mount();
		await fireEvent.dblClick(container.querySelector('.chat-tab')!);
		const name = container.querySelector<HTMLInputElement>('.tab-name-input')!;
		await fireEvent.input(name, { target: { value: 'Research' } });
		const color = container.querySelector<HTMLInputElement>(
			'.chat-tab-editor input[type="color"]'
		)!;
		await fireEvent.input(color, { target: { value: '#ff0000' } });
		expect(current().tabs![0]).toMatchObject({ name: 'Research', color: '#ff0000' });
		expect(container.querySelector('.chat-tab')!.textContent).toContain('Research');
	});

	it('deletes a tab and its saved chat', async () => {
		files.set('w1--tab-b', storedChat('second'));
		const { container, current } = mount({
			tabs: [
				{ id: 'main', name: 'A', color: '#4f9cf7' },
				{ id: 'tab-b', name: 'B', color: '#4ade80' }
			],
			activeTabId: 'tab-b'
		});
		await waitFor(() => expect(container.textContent).toContain('second'));
		await fireEvent.contextMenu(container.querySelectorAll('.chat-tab')[1]);
		await fireEvent.click(container.querySelector('.chat-tab-editor button[title="Delete chat"]')!);
		expect(current().tabs!.map((tab) => tab.id)).toEqual(['main']);
		expect(current().activeTabId).toBe('main');
		await waitFor(() => expect(files.has('w1--tab-b')).toBe(false));
	});

	it('keeps one fresh tab when the last one is deleted', async () => {
		const { container, current } = mount();
		await fireEvent.dblClick(container.querySelector('.chat-tab')!);
		await fireEvent.click(container.querySelector('.chat-tab-editor button[title="Delete chat"]')!);
		expect(current().tabs).toHaveLength(1);
		expect(current().tabs![0].id).not.toBe('main');
	});
});
