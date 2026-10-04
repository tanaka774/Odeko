/**
 * Minimal canvas toast queue.
 *
 * The canvas has no window chrome, so a failed action has nowhere to report
 * itself. Launching an icon with a broken path used to fail silently: the
 * canvas hid and nothing happened. These toasts give that failure somewhere
 * visible to land (see issue #3).
 */

export interface Toast {
	id: number;
	message: string;
	/** Optional second line, e.g. the path that could not be found. */
	detail?: string;
}

const DEFAULT_TIMEOUT_MS = 6000;

function createToastStore() {
	let toasts = $state<Toast[]>([]);
	let nextId = 1;
	const timers = new Map<number, ReturnType<typeof setTimeout>>();

	function dismiss(id: number) {
		const timer = timers.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.delete(id);
		}
		toasts = toasts.filter((toast) => toast.id !== id);
	}

	function show(message: string, detail?: string, timeoutMs = DEFAULT_TIMEOUT_MS): number | null {
		const trimmed = message.trim();
		if (!trimmed) return null;

		const toast: Toast = { id: nextId++, message: trimmed, detail };
		// Keep the queue short: the canvas is small and overlays the desktop.
		toasts = [...toasts.slice(-2), toast];

		if (timeoutMs > 0) {
			timers.set(
				toast.id,
				setTimeout(() => dismiss(toast.id), timeoutMs)
			);
		}
		return toast.id;
	}

	function clear() {
		for (const timer of timers.values()) clearTimeout(timer);
		timers.clear();
		toasts = [];
	}

	return {
		get toasts() {
			return toasts;
		},
		show,
		dismiss,
		clear
	};
}

export const toastStore = createToastStore();

/** Turn an unknown thrown value into display text. */
export function errorMessage(error: unknown): string {
	if (typeof error === 'string') return error;
	if (error instanceof Error) return error.message;
	if (error && typeof error === 'object' && 'message' in error) {
		return String((error as { message: unknown }).message);
	}
	return String(error);
}
