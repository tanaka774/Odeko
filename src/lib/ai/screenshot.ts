import { invoke } from '@tauri-apps/api/core';
import type { ChatImage } from './images';

const MAX_SIDE = 1280;

/** Screenshot of the canvas panel, as a PNG data URL. */
export async function captureCanvas(): Promise<ChatImage> {
	const panel = document.querySelector('.canvas-panel');
	const rect = panel?.getBoundingClientRect();
	if (!rect || rect.width === 0) throw new Error('The canvas is hidden; open it first');
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	const base64 = await invoke<string>('ai_canvas_snapshot', {
		crop: {
			x: rect.x,
			y: rect.y,
			width: rect.width,
			height: rect.height,
			viewport_width: window.innerWidth
		},
		maxSide: MAX_SIDE
	});
	const scale = Math.min(1, MAX_SIDE / Math.max(rect.width, rect.height));
	return {
		url: `data:image/png;base64,${base64}`,
		mediaType: 'image/png',
		width: Math.round(rect.width * scale),
		height: Math.round(rect.height * scale)
	};
}
