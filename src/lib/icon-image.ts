import { invoke } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';

const imageDataUrlCache = new Map<string, string>();

export async function loadIconDataUrl(iconPath: string | undefined): Promise<string | undefined> {
	if (!iconPath) return undefined;

	const cachedDataUrl = imageDataUrlCache.get(iconPath);
	if (cachedDataUrl) return cachedDataUrl;

	if (isBrowserImageUrl(iconPath)) {
		imageDataUrlCache.set(iconPath, iconPath);
		return iconPath;
	}

	if (iconPath.toLowerCase().endsWith('.exe')) {
		imageDataUrlCache.set(iconPath, '');
		return undefined;
	}

	if (iconPath.toLowerCase().endsWith('.png') && !isBrowserImageUrl(iconPath)) {
		try {
			const dataUrl = await invoke<string>('get_icon_base64', { iconPath });
			imageDataUrlCache.set(iconPath, dataUrl);
			return dataUrl;
		} catch {
			return undefined;
		}
	}

	try {
		const displayPath = await getDisplayableFilePath(iconPath);
		if (!displayPath) return undefined;

		const bytes = await readFile(displayPath);
		const dataUrl = `data:${getMimeType(displayPath)};base64,${arrayBufferToBase64(bytes)}`;

		imageDataUrlCache.set(iconPath, dataUrl);
		imageDataUrlCache.set(displayPath, dataUrl);

		return dataUrl;
	} catch (error) {
		console.error('Failed to load icon image:', iconPath, error);
		return undefined;
	}
}

function isBrowserImageUrl(path: string): boolean {
	return (
		path.startsWith('http://') ||
		path.startsWith('https://') ||
		path.startsWith('asset:') ||
		path.startsWith('data:image/')
	);
}

async function getDisplayableFilePath(iconPath: string): Promise<string | undefined> {
	if (!isIcns(iconPath)) return iconPath;

	return (await invoke<string | null>('convert_icns_to_png', { iconPath })) ?? undefined;
}

function isIcns(path: string): boolean {
	return path.toLowerCase().endsWith('.icns');
}

function arrayBufferToBase64(buffer: Uint8Array): string {
	let binary = '';
	for (const byte of buffer) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function getMimeType(path: string): string {
	const ext = path.toLowerCase().split('.').pop();

	switch (ext) {
		case 'png':
			return 'image/png';
		case 'jpg':
		case 'jpeg':
			return 'image/jpeg';
		case 'gif':
			return 'image/gif';
		case 'svg':
			return 'image/svg+xml';
		case 'webp':
			return 'image/webp';
		case 'bmp':
			return 'image/bmp';
		case 'xpm':
			return 'image/x-xpixmap';
		default:
			return 'application/octet-stream';
	}
}
