import { invoke } from '@tauri-apps/api/core';
import type { CanvasIcon } from '$lib/icons';

export function isLaunchable(icon: CanvasIcon): boolean {
	return icon.icon_type === 'app' || (icon.icon_type === 'image' && !!icon.url);
}

export async function launchIcon(icon: CanvasIcon): Promise<void> {
	// Icons without a launchable action (e.g. an image with no url) do
	// nothing: in particular they must not hide the canvas.
	if (!isLaunchable(icon)) return;
	try {
		if (icon.icon_type === 'image' && icon.url) {
			await invoke('open_url', { url: icon.url });
		} else if (icon.icon_type === 'app') {
			await invoke('launch_app', { path: icon.path, args: icon.args });
		}
		await invoke('hide_canvas');
	} catch (error) {
		console.error('Failed to open:', error);
	}
}
