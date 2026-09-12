import { colorWithOpacity } from '$lib/widgets/appearance';

/** One key per settings modal. `app-settings` is the canvas settings dialog,
 *  `icon` the icon editor; the rest mirror widget types. */
export type ModalKey =
	| 'app-settings'
	| 'icon'
	| 'clock'
	| 'system'
	| 'weather'
	| 'terminal'
	| 'tasklist'
	| 'music'
	| 'textbox'
	| 'memo'
	| 'drawing'
	| 'slideshow'
	| 'sleep'
	| 'restart'
	| 'shutdown'
	| 'clipboard'
	| 'custom'
	| 'app-picker'
	| 'widget-picker';

export const MODAL_KEYS: ModalKey[] = [
	'app-settings',
	'icon',
	'clock',
	'system',
	'weather',
	'terminal',
	'tasklist',
	'music',
	'textbox',
	'memo',
	'drawing',
	'slideshow',
	'sleep',
	'restart',
	'shutdown',
	'clipboard',
	'custom',
	'app-picker',
	'widget-picker'
];

export const MODAL_LABELS: Record<ModalKey, string> = {
	'app-settings': 'Canvas Settings',
	icon: 'Icon Settings',
	clock: 'Clock Settings',
	system: 'System Monitor Settings',
	weather: 'Weather Settings',
	terminal: 'Terminal Settings',
	tasklist: 'Task List Settings',
	music: 'Music Player Settings',
	textbox: 'Text Box Settings',
	memo: 'Memo Settings',
	drawing: 'Drawing Settings',
	slideshow: 'Slideshow Settings',
	sleep: 'Sleep Settings',
	restart: 'Restart Settings',
	shutdown: 'Shutdown Settings',
	clipboard: 'Clipboard Settings',
	custom: 'Custom Widget Settings',
	'app-picker': 'Add App Dialog',
	'widget-picker': 'Add Widget Dialog'
};

export interface ModalAppearanceConfig {
	/** Backdrop dim color, as `r, g, b` or hex/rgb. */
	overlayColor?: string;
	overlayOpacity?: number;
	overlayBlur?: number;
	surfaceColor?: string;
	surfaceOpacity?: number;
	surfaceBlur?: number;
	borderColor?: string;
	borderWidth?: number;
	radius?: number;
	shadowColor?: string;
	/** 0 = no shadow; 1 = the original drop shadow. */
	shadowStrength?: number;
	/** Dialog width in px (capped at 92% of the viewport). */
	width?: number;
	/** Dialog max height in px (capped at 85% of the viewport). */
	height?: number;
	accentColor?: string;
	accentTextColor?: string;
	headerBackground?: string;
	titleColor?: string;
	titleSize?: number;
	dividerColor?: string;
	footerBackground?: string;
	textColor?: string;
	mutedColor?: string;
	/** Base text size in px; every length in the chrome scales from it. */
	fontSize?: number;
	fontFamily?: string;
	inputBackground?: string;
	inputBorderColor?: string;
	controlRadius?: number;
	customCssEnabled?: boolean;
	customCss?: string;
}

export interface ModalAppearanceStore {
	/** Default look every modal starts from. */
	global?: Partial<ModalAppearanceConfig>;
	/** Per-modal overrides, layered on top of `global`. */
	modals?: Partial<Record<ModalKey, Partial<ModalAppearanceConfig>>>;
}

export const DEFAULT_MODAL_APPEARANCE: Required<ModalAppearanceConfig> = {
	overlayColor: 'rgb(0, 0, 0)',
	overlayOpacity: 0.7,
	overlayBlur: 4,
	surfaceColor: 'rgb(30, 30, 40)',
	surfaceOpacity: 0.95,
	surfaceBlur: 20,
	borderColor: 'rgba(255, 255, 255, 0.1)',
	borderWidth: 1,
	radius: 16,
	shadowColor: 'rgb(0, 0, 0)',
	shadowStrength: 1,
	width: 480,
	height: 640,
	accentColor: 'rgba(120, 160, 200, 0.85)',
	accentTextColor: '#ffffff',
	headerBackground: 'transparent',
	titleColor: '#ffffff',
	titleSize: 20,
	dividerColor: 'rgba(255, 255, 255, 0.1)',
	footerBackground: 'rgba(0, 0, 0, 0.2)',
	textColor: 'rgba(255, 255, 255, 0.9)',
	mutedColor: 'rgba(255, 255, 255, 0.55)',
	fontSize: 14,
	fontFamily: 'inherit',
	inputBackground: 'rgba(0, 0, 0, 0.4)',
	inputBorderColor: 'rgba(255, 255, 255, 0.2)',
	controlRadius: 8,
	customCssEnabled: false,
	customCss: ''
};

/** Call-site defaults layered above DEFAULT_MODAL_APPEARANCE: the canvas
 *  settings dialog is wider than the per-widget ones. */
export const MODAL_BASE_DEFAULTS: Partial<Record<ModalKey, Partial<ModalAppearanceConfig>>> = {
	'app-settings': { width: 750 },
	'app-picker': { width: 900, height: 820 }
};

/** Font size the hard-coded chrome was authored at. Sizes that should follow
 *  the text-size knob are expressed as multiples of this value. */
export const BASE_FONT_SIZE = 14;

const NUMERIC_LIMITS: Record<string, [number, number]> = {
	overlayOpacity: [0, 1],
	overlayBlur: [0, 40],
	surfaceOpacity: [0, 1],
	surfaceBlur: [0, 60],
	borderWidth: [0, 8],
	radius: [0, 48],
	shadowStrength: [0, 1],
	width: [280, 1200],
	height: [240, 1400],
	titleSize: [12, 40],
	fontSize: [12, 22],
	controlRadius: [0, 24]
};

// Colors flow into an inline style string, so anything that could break out of
// a declaration (or fetch a URL) is rejected in favor of the fallback.
export function sanitizeCssColor(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const trimmed = value.trim();
	if (!trimmed) return fallback;
	if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(trimmed)) return trimmed;
	if (/^rgba?\([\d\s.,%]+\)$/.test(trimmed)) return trimmed;
	if (/^[a-zA-Z]{3,20}$/.test(trimmed)) return trimmed;
	const channels = trimmed.split(',').map((part) => part.trim());
	if (channels.length === 3 && channels.every((part) => /^\d{1,3}$/.test(part))) {
		const nums = channels.map(Number);
		if (nums.every((n) => n >= 0 && n <= 255)) return `rgb(${nums[0]}, ${nums[1]}, ${nums[2]})`;
	}
	return fallback;
}

/** Colors that get an opacity slider are normalized to a form
 *  `colorWithOpacity` understands. */
function sanitizeChannelColor(value: unknown, fallback: string): string {
	const sanitized = sanitizeCssColor(value, fallback);
	if (sanitized.startsWith('rgb(') || sanitized.startsWith('#')) return sanitized;
	const channels = sanitized.split(',').map((part) => part.trim());
	if (channels.length === 3 && channels.every((part) => /^\d{1,3}$/.test(part))) return sanitized;
	return fallback;
}

export function sanitizeFontFamily(value: unknown, fallback: string): string {
	if (typeof value !== 'string') return fallback;
	const cleaned = value
		.replace(/[;{}<>\\"]/g, '')
		.trim()
		.slice(0, 120);
	return cleaned || fallback;
}

function sanitizeNumber(value: unknown, fallback: number, key: string): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	const [min, max] = NUMERIC_LIMITS[key] ?? [-Infinity, Infinity];
	return Math.min(max, Math.max(min, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Normalizes an untrusted partial config: every field is validated and
 *  clamped, unknown keys are dropped. */
export function sanitizeModalAppearance(
	input: Partial<ModalAppearanceConfig> | undefined | null
): Partial<ModalAppearanceConfig> {
	if (!isRecord(input)) return {};
	const out: Partial<ModalAppearanceConfig> = {};
	const colorFields = [
		'borderColor',
		'headerBackground',
		'titleColor',
		'dividerColor',
		'footerBackground',
		'textColor',
		'mutedColor',
		'inputBackground',
		'inputBorderColor',
		'accentColor',
		'accentTextColor'
	] as const;
	const channelFields = ['overlayColor', 'surfaceColor', 'shadowColor'] as const;

	for (const key of colorFields) {
		if (input[key] !== undefined) {
			out[key] = sanitizeCssColor(input[key], DEFAULT_MODAL_APPEARANCE[key]);
		}
	}
	for (const key of channelFields) {
		if (input[key] !== undefined) {
			out[key] = sanitizeChannelColor(input[key], DEFAULT_MODAL_APPEARANCE[key]);
		}
	}
	if (input.fontFamily !== undefined) {
		out.fontFamily = sanitizeFontFamily(input.fontFamily, DEFAULT_MODAL_APPEARANCE.fontFamily);
	}
	if (input.customCss !== undefined) {
		out.customCss = typeof input.customCss === 'string' ? input.customCss : '';
	}
	if (input.customCssEnabled !== undefined) {
		out.customCssEnabled = input.customCssEnabled === true;
	}
	for (const key of Object.keys(NUMERIC_LIMITS)) {
		const value = (input as Record<string, unknown>)[key];
		if (value !== undefined) {
			(out as Record<string, unknown>)[key] = sanitizeNumber(
				value,
				DEFAULT_MODAL_APPEARANCE[key as keyof ModalAppearanceConfig] as number,
				key
			);
		}
	}
	return out;
}

/** Normalizes the whole persisted store (loaded file or imported preset):
 *  unknown modal keys are dropped, every value validated, empties removed. */
export function sanitizeModalAppearanceStore(input: unknown): ModalAppearanceStore {
	if (!isRecord(input)) return {};
	const out: ModalAppearanceStore = {};

	const globalLayer = sanitizeModalAppearance(
		input.global as Partial<ModalAppearanceConfig> | undefined
	);
	if (Object.keys(globalLayer).length > 0) out.global = globalLayer;

	if (isRecord(input.modals)) {
		const modals: Partial<Record<ModalKey, Partial<ModalAppearanceConfig>>> = {};
		for (const key of MODAL_KEYS) {
			const layer = sanitizeModalAppearance(
				input.modals[key] as Partial<ModalAppearanceConfig> | undefined
			);
			if (Object.keys(layer).length > 0) modals[key] = layer;
		}
		if (Object.keys(modals).length > 0) out.modals = modals;
	}

	return out;
}

/** Merges partial layers over the hard-coded base, sanitizing each layer. */
export function overlayModalAppearance(
	...layers: (Partial<ModalAppearanceConfig> | undefined)[]
): Required<ModalAppearanceConfig> {
	const out: Required<ModalAppearanceConfig> = { ...DEFAULT_MODAL_APPEARANCE };
	for (const layer of layers) {
		Object.assign(out, sanitizeModalAppearance(layer));
	}
	return out;
}

function mergeLayers(
	key: ModalKey,
	stored: ModalAppearanceStore | undefined,
	base: Partial<ModalAppearanceConfig>
): Required<ModalAppearanceConfig> {
	const modals = isRecord(stored?.modals) ? stored.modals : {};
	return overlayModalAppearance(
		base,
		stored?.global,
		(modals as Record<string, Partial<ModalAppearanceConfig> | undefined>)[key]
	);
}

/** Effective appearance of one modal: hard-coded base → call-site base →
 *  global default → this modal's override. */
export function resolveModalAppearance(
	key: ModalKey,
	stored?: ModalAppearanceStore,
	base: Partial<ModalAppearanceConfig> = MODAL_BASE_DEFAULTS[key] ?? {}
): Required<ModalAppearanceConfig> {
	return mergeLayers(key, stored, base);
}

/** Fields that differ from the layers below, so stored overrides stay sparse
 *  and keep inheriting later changes to the global default. */
export function diffModalAppearance(
	config: Partial<ModalAppearanceConfig>,
	lower: Partial<ModalAppearanceConfig>
): Partial<ModalAppearanceConfig> {
	const out: Partial<ModalAppearanceConfig> = {};
	for (const key of Object.keys(config) as (keyof ModalAppearanceConfig)[]) {
		const value = config[key];
		if (value === undefined) continue;
		if (lower[key] !== value) {
			(out as Record<string, unknown>)[key] = value;
		}
	}
	return out;
}

function shadowValue(color: string, strength: number): string {
	if (strength <= 0) return 'none';
	const blur = Math.round(50 * strength);
	const spread = Math.round(-12 * strength);
	const offset = Math.round(25 * strength);
	return `0 ${offset}px ${blur}px ${spread}px ${colorWithOpacity(color, 0.5 * strength)}`;
}

/** Inline custom properties consumed by the modal chrome. Values are
 *  sanitized by the resolver, so this string is safe to place in `style`. */
export function modalAppearanceStyle(config: Required<ModalAppearanceConfig>): string {
	const declarations = [
		`--modal-overlay-bg:${colorWithOpacity(config.overlayColor, config.overlayOpacity)}`,
		`--modal-overlay-blur:${config.overlayBlur}px`,
		`--modal-surface-bg:${colorWithOpacity(config.surfaceColor, config.surfaceOpacity)}`,
		`--modal-surface-blur:${config.surfaceBlur}px`,
		`--modal-border-width:${config.borderWidth}px`,
		`--modal-border-color:${config.borderColor}`,
		`--modal-radius:${config.radius}px`,
		`--modal-shadow:${shadowValue(config.shadowColor, config.shadowStrength)}`,
		`--modal-width:min(${config.width}px, 92%)`,
		`--modal-height:min(85%, ${config.height}px)`,
		`--modal-accent:${config.accentColor}`,
		`--modal-accent-fg:${config.accentTextColor}`,
		`--modal-header-bg:${config.headerBackground}`,
		`--modal-title-color:${config.titleColor}`,
		`--modal-title-size:calc(${(config.titleSize / BASE_FONT_SIZE).toFixed(4)} * var(--modal-font-size))`,
		`--modal-divider:${config.dividerColor}`,
		`--modal-footer-bg:${config.footerBackground}`,
		`--modal-text:${config.textColor}`,
		`--modal-muted:${config.mutedColor}`,
		`--modal-font-size:${config.fontSize}px`,
		`--modal-font-family:${config.fontFamily}`,
		`--modal-input-bg:${config.inputBackground}`,
		`--modal-input-border:${config.inputBorderColor}`,
		`--modal-control-radius:${config.controlRadius}px`
	];
	return declarations.join(';');
}

export function modalCssScope(key: ModalKey): string {
	return `[data-modal="${key}"]`;
}

/** Stable class names the per-modal custom CSS may target. */
export const MODAL_CSS_CLASSES = [
	'.modal-overlay',
	'.modal-anchor',
	'.modal-content',
	'.modal-header',
	'.modal-title',
	'.close-btn',
	'.modal-body',
	'.modal-footer',
	'.cancel-btn',
	'.save-btn',
	'.tab-nav',
	'.tab-btn',
	'.setting-row',
	'.setting-label',
	'.setting-section',
	'.radio-label',
	'.checkbox-label',
	'.text-input',
	'.select-input',
	'.range-input',
	'.color-control',
	'.css-input'
];

export const MODAL_CSS_EXAMPLE =
	'.modal-content { background: linear-gradient(160deg, #1b1b2f, #16213e); }\n.save-btn { letter-spacing: 0.05em; }';
