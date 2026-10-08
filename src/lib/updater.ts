/**
 * In-app update check, backed by `tauri-plugin-updater`.
 *
 * The plugins are imported lazily so unit tests never have to mock them.
 */

import type { Update } from '@tauri-apps/plugin-updater';

/** Returns the available update, or null when the running build is current. */
export async function checkForUpdate(): Promise<Update | null> {
	const { check } = await import('@tauri-apps/plugin-updater');
	return (await check()) ?? null;
}

/** Downloads and installs the update, then restarts into it. */
export async function installUpdate(update: Update): Promise<void> {
	const { relaunch } = await import('@tauri-apps/plugin-process');
	await update.downloadAndInstall();
	await relaunch();
}
