import type { ClipboardEntry } from './widgets/types';

// Small helpers used by the clipboard widget. Keeping them free of Svelte and
// Tauri makes the behavior easy to unit test.
//
// Image entries are stored as PNG data URLs so they can be shown as thumbnails
// and written back to the clipboard later. They are downscaled on capture so a
// long history of screenshots does not bloat the saved layout file.

export const MAX_IMAGE_DIMENSION = 800;

let idCounter = 0;

export function createClipboardEntryId(): string {
	idCounter += 1;
	return `clip-${Date.now()}-${idCounter}`;
}

export function createTextEntry(text: string, now = Date.now()): ClipboardEntry {
	return { id: createClipboardEntryId(), type: 'text', text, createdAt: now, pinned: false };
}

export function createImageEntry(image: string, now = Date.now()): ClipboardEntry {
	return { id: createClipboardEntryId(), type: 'image', image, createdAt: now, pinned: false };
}

// Adds an entry to the front of the history. If an identical entry already
// exists it is moved to the front instead of duplicated, like real clipboard
// managers do. Returns a new array capped to `maxEntries`.
export function addClipboardEntry(
	history: ClipboardEntry[],
	entry: ClipboardEntry,
	maxEntries = 20
): ClipboardEntry[] {
	const duplicateIndex = history.findIndex((item) => {
		if (item.type !== entry.type) return false;
		return entry.type === 'text' ? item.text === entry.text : item.image === entry.image;
	});
	const rest = duplicateIndex === -1 ? history : history.filter((_, i) => i !== duplicateIndex);
	return [entry, ...rest].slice(0, maxEntries);
}

// Caps the history to `maxEntries`, dropping the oldest items.
export function capClipboardHistory(
	history: ClipboardEntry[],
	maxEntries: number
): ClipboardEntry[] {
	return history.slice(0, maxEntries);
}

// Pinned entries stay on top; within each group, newest comes first.
export function sortClipboardHistory(history: ClipboardEntry[]): ClipboardEntry[] {
	return [...history].sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.createdAt - a.createdAt;
	});
}

// Filters text entries by a case-insensitive substring match. Images are kept
// only when the query is empty (they have no searchable text).
export function filterClipboardHistory(history: ClipboardEntry[], query: string): ClipboardEntry[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return history;
	return history.filter(
		(entry) => entry.type === 'text' && (entry.text ?? '').toLowerCase().includes(normalized)
	);
}

export function truncate(text: string, max = 80): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max).trimEnd()}…`;
}

// "14:32" for today, otherwise "Aug 3 14:32".
export function formatTimestamp(createdAt: number, now = Date.now()): string {
	const date = new Date(createdAt);
	const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	const sameDay = date.toDateString() === new Date(now).toDateString();
	if (sameDay) return time;
	return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

// Cheap hash of a byte array. Used to notice a new image on the clipboard
// without having to compare every stored pixel.
export function hashBytes(bytes: ArrayLike<number>): string {
	let hash = 0;
	for (let i = 0; i < bytes.length; i++) {
		hash = (hash * 31 + bytes[i]) >>> 0;
	}
	return hash.toString(36);
}

// Converts raw RGBA pixels into a PNG data URL, downscaling to fit within
// `maxDimension` so image entries do not eat the whole layout file.
export function rgbaToDataUrl(
	rgba: ArrayLike<number>,
	width: number,
	height: number,
	maxDimension = MAX_IMAGE_DIMENSION
): string {
	const scale = Math.min(1, maxDimension / Math.max(width, height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(width * scale));
	canvas.height = Math.max(1, Math.round(height * scale));

	const source = document.createElement('canvas');
	source.width = width;
	source.height = height;
	const sourceContext = source.getContext('2d');
	if (!sourceContext) return '';
	sourceContext.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);

	const context = canvas.getContext('2d');
	if (!context) return '';
	context.drawImage(source, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL('image/png');
}

// Decodes a stored PNG data URL back into the RGBA bytes + size needed by
// the clipboard plugin's writeImage command.
export async function dataUrlToRgba(
	dataUrl: string
): Promise<{ rgba: Uint8Array; width: number; height: number } | null> {
	const image = new Image();
	const loaded = new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('Failed to decode clipboard image'));
	});
	image.src = dataUrl;
	try {
		await loaded;
	} catch {
		return null;
	}

	const canvas = document.createElement('canvas');
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext('2d');
	if (!context) return null;
	context.drawImage(image, 0, 0);
	const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
	return { rgba: new Uint8Array(imageData.data), width: canvas.width, height: canvas.height };
}
