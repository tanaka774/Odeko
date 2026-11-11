export interface ChatImage {
	/** data: URL (JPEG or PNG), already downscaled. */
	url: string;
	mediaType: string;
	width: number;
	height: number;
}

export const MAX_IMAGES = 4;
const MAX_SIDE = 1568;
const JPEG_QUALITY = 0.85;

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Could not read the image'));
		image.src = src;
	});
}

function readAsDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
		reader.readAsDataURL(blob);
	});
}

/** Downscales so the longer side is at most MAX_SIDE and re-encodes as JPEG. */
export async function prepareImage(source: Blob | string): Promise<ChatImage> {
	const src = typeof source === 'string' ? source : await readAsDataUrl(source);
	const image = await loadImage(src);
	const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
	const width = Math.max(1, Math.round(image.naturalWidth * scale));
	const height = Math.max(1, Math.round(image.naturalHeight * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, width, height);
	ctx.drawImage(image, 0, 0, width, height);
	return {
		url: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
		mediaType: 'image/jpeg',
		width,
		height
	};
}

/** Base64 payload of a data: URL. */
export function dataUrlBase64(url: string): string {
	return url.slice(url.indexOf(',') + 1);
}

export function imagesFromClipboard(event: ClipboardEvent): File[] {
	return [...(event.clipboardData?.items ?? [])]
		.filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
		.map((item) => item.getAsFile())
		.filter((file): file is File => file !== null);
}
