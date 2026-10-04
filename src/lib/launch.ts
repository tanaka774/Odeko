import { invoke } from '@tauri-apps/api/core';
import type { CanvasIcon } from '$lib/icons';
import { errorMessage, toastStore } from '$lib/stores/toast.svelte';

export function isLaunchable(icon: CanvasIcon): boolean {
	return icon.icon_type === 'app' || (icon.icon_type === 'image' && !!icon.url);
}

/** Name to show the user for an icon, preferring a custom label. */
export function iconDisplayName(icon: CanvasIcon): string {
	const custom = icon.custom_name?.trim();
	if (custom) return custom;
	const name = icon.name?.trim();
	return name || icon.path || 'This icon';
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
		// Stay visible and say what went wrong: silently hiding on a failed
		// launch is what made a broken icon look like a dead hotkey (#3).
		console.error('Failed to launch:', error);
		toastStore.show(`Could not launch ${iconDisplayName(icon)}`, errorMessage(error));
	}
}
