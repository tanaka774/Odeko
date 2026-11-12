import { invoke } from '@tauri-apps/api/core';

export const WATCH_INTERVAL_MS = 1000;

/**
 * Polls `path` and calls `onChange` with its content whenever the file's
 * modification time changes, starting with the current content. Returns a
 * function that stops watching.
 */
export function watchTextFile(
	path: string,
	onChange: (content: string) => void,
	onError?: (error: unknown) => void
): () => void {
	let modified = -1;
	let stopped = false;
	async function poll() {
		try {
			const current = await invoke<number>('text_file_modified', { path });
			if (current === modified || stopped) return;
			const file = await invoke<{ content: string; modified: number }>('read_text_file', {
				path
			});
			if (stopped) return;
			modified = file.modified;
			onChange(file.content);
		} catch (error) {
			onError?.(error);
		}
	}
	void poll();
	const timer = setInterval(poll, WATCH_INTERVAL_MS);
	return () => {
		stopped = true;
		clearInterval(timer);
	};
}
