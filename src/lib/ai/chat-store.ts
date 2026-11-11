import { invoke } from '@tauri-apps/api/core';
import type { StoredChat } from './chat.svelte';

// Conversations live in <config>/ai-chats/<widget id>.json, never in presets,
// so exporting a preset cannot leak them.
const SAVE_DELAY_MS = 400;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function loadChat(widgetId: string): Promise<StoredChat | null> {
	try {
		return await invoke<StoredChat | null>('load_ai_chat', { widgetId });
	} catch (error) {
		console.error('Failed to load chat:', error);
		return null;
	}
}

export function saveChat(widgetId: string, chat: StoredChat): void {
	clearTimeout(timers.get(widgetId));
	timers.set(
		widgetId,
		setTimeout(() => {
			timers.delete(widgetId);
			invoke('save_ai_chat', { widgetId, chat }).catch((error) =>
				console.error('Failed to save chat:', error)
			);
		}, SAVE_DELAY_MS)
	);
}

export function deleteChat(widgetId: string): void {
	clearTimeout(timers.get(widgetId));
	timers.delete(widgetId);
	void invoke('delete_ai_chat', { widgetId }).catch(() => {});
}
