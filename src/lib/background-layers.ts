// The canvas background is an ordered stack of layers (first = bottom).
// Each layer draws either behind the icons or over them; layers over the
// icons never take pointer events.

export const BLEND_MODES = [
	'normal',
	'multiply',
	'screen',
	'overlay',
	'darken',
	'lighten',
	'color-dodge',
	'color-burn',
	'hard-light',
	'soft-light',
	'difference',
	'exclusion',
	'hue',
	'saturation',
	'color',
	'luminosity',
	'plus-lighter'
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export type Placement = 'below' | 'above';

export const MEDIA_POSITIONS = [
	'center',
	'top',
	'bottom',
	'left',
	'right',
	'top left',
	'top right',
	'bottom left',
	'bottom right'
] as const;
export type MediaPosition = (typeof MEDIA_POSITIONS)[number];

interface LayerCommon {
	id: string;
	name: string;
	enabled: boolean;
	opacity: number;
	blend: BlendMode;
	placement: Placement;
}

export interface ColorLayer extends LayerCommon {
	type: 'color';
	/** "R, G, B" */
	color: string;
	/** Second color of a linear gradient; null for a solid color. */
	color2: string | null;
	angle: number;
}

export interface MediaLayer extends LayerCommon {
	type: 'media';
	/** Image or video: a file path or an http(s)/data/asset URL. */
	src: string;
	fit: 'cover' | 'contain' | 'stretch';
	position: MediaPosition;
	repeat: boolean;
}

interface SourceFile {
	source: string;
	/** File the source was loaded from. */
	file: string | null;
	/** Re-read `file` whenever it changes on disk. */
	watch: boolean;
}

export interface ShaderLayer extends LayerCommon, SourceFile {
	type: 'shader';
	/** Image/video bound as iChannel0. */
	texture: string | null;
	/** Canvas pixels per CSS pixel, relative to the display density. */
	quality: number;
	/** Frame rate cap; 0 = display rate. */
	fps: number;
}

export interface HtmlLayer extends LayerCommon, SourceFile {
	type: 'html';
	/** Off: the page renders as static HTML/CSS. */
	scripts: boolean;
}

export type BackgroundLayer = ColorLayer | MediaLayer | ShaderLayer | HtmlLayer;
export type LayerType = BackgroundLayer['type'];

/** What a rendered version of a layer is built from; a change remounts it. */
export interface LayerContent {
	/** Media src, or shader/HTML source. */
	source: string;
	texture: string | null;
	scripts: boolean;
}

export function layerContent(layer: BackgroundLayer, source: string): LayerContent {
	return {
		source: layer.type === 'media' ? layer.src : source,
		texture: layer.type === 'shader' ? layer.texture : null,
		scripts: layer.type === 'html' && layer.scripts
	};
}

export function contentKey(layer: BackgroundLayer, content: LayerContent): string {
	return layer.type === 'color' ? 'color' : JSON.stringify(content);
}

export function newLayerId(): string {
	return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const COMMON_DEFAULTS = {
	enabled: true,
	opacity: 1,
	blend: 'normal' as BlendMode,
	placement: 'below' as Placement
};

// Sources a new shader/HTML layer starts with, so it shows something at once.
const STARTER_SHADER = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
	vec2 uv = fragCoord / iResolution.xy;
	vec3 col = 0.5 + 0.5 * cos(iTime * 0.3 + uv.xyx + vec3(0.0, 2.0, 4.0));
	col += odPointerGlow(fragCoord, 120.0) * 0.5;
	fragColor = vec4(col * 0.4, 1.0);
}
`;

const STARTER_HTML = `<!doctype html>
<html>
	<body style="margin: 0">
		<canvas></canvas>
		<script>
			const canvas = document.querySelector('canvas');
			const ctx = canvas.getContext('2d');
			odeko.on('frame', ({ width, height, pointer }) => {
				canvas.width = width;
				canvas.height = height;
				ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
				ctx.beginPath();
				ctx.arc(pointer.x, pointer.y, 80 * pointer.presence, 0, Math.PI * 2);
				ctx.fill();
			});
		</script>
	</body>
</html>
`;

export function createLayer(
	type: LayerType,
	overrides: Partial<BackgroundLayer> = {}
): BackgroundLayer {
	const base = { id: newLayerId(), ...COMMON_DEFAULTS };
	const layer: BackgroundLayer =
		type === 'color'
			? { ...base, type, name: 'Color', color: '20, 20, 30', color2: null, angle: 180 }
			: type === 'media'
				? {
						...base,
						type,
						name: 'Image / Video',
						src: '',
						fit: 'cover',
						position: 'center',
						repeat: false
					}
				: type === 'shader'
					? {
							...base,
							type,
							name: 'Shader',
							source: STARTER_SHADER,
							file: null,
							watch: false,
							texture: null,
							quality: 1,
							fps: 60
						}
					: {
							...base,
							type,
							name: 'HTML',
							source: STARTER_HTML,
							file: null,
							watch: false,
							scripts: true
						};
	return { ...layer, ...overrides } as BackgroundLayer;
}

export function defaultLayers(): BackgroundLayer[] {
	return [createLayer('color', { name: 'Tint', opacity: 0.75 })];
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
	return allowed.includes(value as T) ? (value as T) : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(max, Math.max(min, value))
		: fallback;
}

function str(value: unknown, fallback: string): string {
	return typeof value === 'string' ? value : fallback;
}

function strOrNull(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

function bool(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

/** Normalizes one stored (possibly imported) layer; null when unusable. */
export function sanitizeLayer(raw: unknown): BackgroundLayer | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const value = raw as Record<string, unknown>;
	const type = value.type;
	if (type !== 'color' && type !== 'media' && type !== 'shader' && type !== 'html') return null;
	const d = createLayer(type);
	const common = {
		id: typeof value.id === 'string' && value.id ? value.id : d.id,
		name: str(value.name, d.name),
		enabled: bool(value.enabled, true),
		opacity: num(value.opacity, 0, 1, 1),
		blend: pick(value.blend, BLEND_MODES, 'normal'),
		placement: pick<Placement>(value.placement, ['below', 'above'], 'below')
	};
	const sourceFile = {
		source: str(value.source, ''),
		file: strOrNull(value.file),
		watch: bool(value.watch, false)
	};
	switch (type) {
		case 'color':
			return {
				...common,
				type,
				color: str(value.color, '20, 20, 30'),
				color2: strOrNull(value.color2),
				angle: num(value.angle, 0, 360, 180)
			};
		case 'media':
			return {
				...common,
				type,
				src: str(value.src, ''),
				fit: pick(value.fit, ['cover', 'contain', 'stretch'] as const, 'cover'),
				position: pick(value.position, MEDIA_POSITIONS, 'center'),
				repeat: bool(value.repeat, false)
			};
		case 'shader':
			return {
				...common,
				...sourceFile,
				type,
				texture: strOrNull(value.texture),
				quality: num(value.quality, 0.25, 1, 1),
				fps: pick(value.fps, [0, 15, 30, 60], 60)
			};
		case 'html':
			return { ...common, ...sourceFile, type, scripts: bool(value.scripts, true) };
	}
}

/** Normalizes the stored stack; anything that is not a list gets the default stack. */
export function sanitizeLayers(raw: unknown): BackgroundLayer[] {
	if (!Array.isArray(raw)) return defaultLayers();
	const seen = new Set<string>();
	const layers: BackgroundLayer[] = [];
	for (const entry of raw) {
		const layer = sanitizeLayer(entry);
		if (!layer) continue;
		if (seen.has(layer.id)) layer.id = newLayerId();
		seen.add(layer.id);
		layers.push(layer);
	}
	return layers;
}

/** Layers that render in `placement`, bottom first. */
export function layersAt(layers: BackgroundLayer[], placement: Placement): BackgroundLayer[] {
	return layers.filter((layer) => layer.enabled && layer.placement === placement);
}
