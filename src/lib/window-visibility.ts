import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Reports whether the canvas window is visible, once at start and on every
 * change. Animated layers pause while it is hidden (the canvas spends most of
 * its life hidden). Blurred but visible, e.g. alt-tab, counts as visible.
 */
export function watchWindowVisibility(onChange: (visible: boolean) => void): () => void {
	const appWindow = getCurrentWindow();
	let unlisten: (() => void) | null = null;
	let disposed = false;
	void appWindow
		.onFocusChanged(async ({ payload: focused }) => {
			if (focused) onChange(true);
			else if (!(await appWindow.isVisible())) onChange(false);
		})
		.then((un) => {
			if (disposed) un();
			else unlisten = un;
		});
	void appWindow.isVisible().then((visible) => {
		if (!disposed) onChange(visible);
	});
	return () => {
		disposed = true;
		unlisten?.();
	};
}
