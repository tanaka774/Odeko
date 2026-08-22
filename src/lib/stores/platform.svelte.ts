import { invoke } from '@tauri-apps/api/core';

export type Platform = 'macos' | 'windows' | 'linux' | 'unknown';

const SUPPORTED_PLATFORMS = new Set<Platform>(['macos', 'windows', 'linux', 'unknown']);

function normalizePlatform(value: string): Platform {
	return SUPPORTED_PLATFORMS.has(value as Platform) ? (value as Platform) : 'unknown';
}

function createPlatformStore() {
	let platform = $state<Platform>('unknown');
	let isLoaded = $state(false);

	async function load() {
		if (isLoaded) return;

		try {
			platform = normalizePlatform(await invoke<string>('get_platform'));
		} catch (error) {
			console.error('Failed to detect platform:', error);
			platform = 'unknown';
		} finally {
			isLoaded = true;
		}
	}

	return {
		get platform() {
			return platform;
		},
		get isMacos() {
			return platform === 'macos';
		},
		load
	};
}

export const platformStore = createPlatformStore();
