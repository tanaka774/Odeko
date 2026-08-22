import { invoke } from '@tauri-apps/api/core';
import type { LauncherIcon } from '$lib/icons';

export function isLaunchable(icon: LauncherIcon): boolean {
	return (
		icon.icon_type === 'app' ||
		(icon.icon_type === 'link' && !!icon.url) ||
		(icon.icon_type === 'image' && !!icon.url)
	);
}

export async function launchIcon(icon: LauncherIcon): Promise<void> {
	// Icons without a launchable action (e.g. an image with no url) do
	// nothing: in particular they must not hide the launcher.
	if (!isLaunchable(icon)) return;
	try {
		if (icon.icon_type === 'link' && icon.url) {
			await invoke('open_url', { url: icon.url });
		} else if (icon.icon_type === 'app') {
			await invoke('launch_app', { path: icon.path, args: icon.args });
		} else if (icon.icon_type === 'image' && icon.url) {
			await invoke('open_url', { url: icon.url });
		}
		await invoke('hide_launcher');
	} catch (error) {
		console.error('Failed to open:', error);
	}
}
