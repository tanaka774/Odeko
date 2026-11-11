import { applyPatch, compare, deepClone, type Operation } from 'fast-json-patch';
import type { CanvasIcon } from '$lib/icons';
import { SETTINGS_KEYS, type CanvasSettings } from '$lib/stores/settings.svelte';
import {
	createDefaultWidgetConfig,
	getWidgetMeta,
	WIDGET_REGISTRY,
	type WidgetType
} from '$lib/widgets/types';

export interface ConfigDocument {
	settings: Record<string, unknown>;
	icons: Record<string, Record<string, unknown>>;
}

export interface LayoutState {
	icons: CanvasIcon[];
	settings: CanvasSettings;
}

/** Settings only the user may change: they grant network access to widget code. */
export const PROTECTED_SETTINGS = ['network_grants', 'allow_local_network'] as const;

/** Runtime data inside widget configs; never shown to or edited by the AI. */
const HIDDEN_WIDGET_FIELDS = ['history', 'canvasState', 'chat'];
const LARGE_STRING = 4000;
const HIDDEN_PREFIX = '<<hidden:';

function hiddenMarker(label: string): string {
	return `${HIDDEN_PREFIX}${label}>>`;
}

function isHiddenMarker(value: unknown): boolean {
	return typeof value === 'string' && value.startsWith(HIDDEN_PREFIX);
}

function escapeSegment(segment: string): string {
	return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function describeHidden(value: unknown): string {
	if (Array.isArray(value)) return `${value.length} items`;
	if (typeof value === 'string') return `${value.slice(0, 24)}… ${value.length} chars`;
	return 'data';
}

/**
 * The AI's view of the layout plus the hidden values it replaced, keyed by
 * JSON pointer, so they can be put back after a patch.
 */
export function buildView(state: LayoutState): {
	view: ConfigDocument;
	hidden: Map<string, unknown>;
} {
	const hidden = new Map<string, unknown>();
	const settings = deepClone(state.settings) as Record<string, unknown>;
	for (const key of Object.keys(settings)) {
		if (!SETTINGS_KEYS.includes(key as keyof CanvasSettings)) delete settings[key];
	}
	for (const key of PROTECTED_SETTINGS) delete settings[key];

	const icons: ConfigDocument['icons'] = {};
	for (const icon of state.icons) {
		const copy = deepClone(icon) as Record<string, unknown>;
		delete copy.id;
		icons[icon.id] = copy;
	}

	const walk = (value: unknown, path: string, parentKey: string, inWidgetConfig: boolean) => {
		if (!value || typeof value !== 'object') return;
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			const childPath = `${path}/${escapeSegment(key)}`;
			const runtime =
				inWidgetConfig && parentKey === 'widget_config' && HIDDEN_WIDGET_FIELDS.includes(key);
			const bulky =
				typeof child === 'string' && child.length > LARGE_STRING && child.startsWith('data:');
			if (runtime || bulky) {
				hidden.set(childPath, child);
				(value as Record<string, unknown>)[key] = hiddenMarker(describeHidden(child));
				continue;
			}
			walk(child, childPath, key, inWidgetConfig || key === 'widget_config');
		}
	};
	walk(settings, '/settings', 'settings', false);
	walk(icons, '/icons', 'icons', false);

	return { view: { settings, icons }, hidden };
}

export class PatchRejected extends Error {}

function protectedPath(path: string): boolean {
	return PROTECTED_SETTINGS.some(
		(key) => path === `/settings/${key}` || path.startsWith(`/settings/${key}/`)
	);
}

function pointerGet(doc: unknown, pointer: string): { found: boolean; value: unknown } {
	let node: unknown = doc;
	for (const raw of pointer.split('/').slice(1)) {
		const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
		if (!node || typeof node !== 'object' || !(key in (node as object))) {
			return { found: false, value: undefined };
		}
		node = (node as Record<string, unknown>)[key];
	}
	return { found: true, value: node };
}

function pointerSet(doc: unknown, pointer: string, value: unknown) {
	const keys = pointer
		.split('/')
		.slice(1)
		.map((raw) => raw.replace(/~1/g, '/').replace(/~0/g, '~'));
	const last = keys.pop();
	let node = doc as Record<string, unknown>;
	for (const key of keys) node = node[key] as Record<string, unknown>;
	if (last !== undefined) node[last] = value;
}

const ICON_TYPES = ['app', 'image', 'widget'];
const WIDGET_TYPES = WIDGET_REGISTRY.map((meta) => meta.type);

function finiteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function documentToIcons(doc: ConfigDocument, previous: CanvasIcon[]): CanvasIcon[] {
	if (!doc.icons || typeof doc.icons !== 'object' || Array.isArray(doc.icons)) {
		throw new PatchRejected('/icons must stay an object keyed by icon id');
	}
	const problems: string[] = [];
	const previousIds = new Set(previous.map((icon) => icon.id));
	let maxZ = Math.max(0, ...previous.map((icon) => icon.z ?? 0));
	const icons: CanvasIcon[] = [];

	for (const [id, raw] of Object.entries(doc.icons)) {
		if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
			problems.push(`/icons/${id} must be an object`);
			continue;
		}
		const icon = { ...raw, id } as Record<string, unknown>;
		const where = `/icons/${id}`;
		if (!ICON_TYPES.includes(icon.icon_type as string)) {
			problems.push(`${where}/icon_type must be one of ${ICON_TYPES.join(', ')}`);
			continue;
		}
		if (icon.icon_type === 'widget') {
			if (!WIDGET_TYPES.includes(icon.widget_type as WidgetType)) {
				problems.push(`${where}/widget_type must be one of ${WIDGET_TYPES.join(', ')}`);
				continue;
			}
			const type = icon.widget_type as WidgetType;
			const meta = getWidgetMeta(type);
			if (!icon.widget_config || typeof icon.widget_config !== 'object') {
				icon.widget_config = createDefaultWidgetConfig(type);
			}
			icon.width ??= meta?.defaultWidth;
			icon.height ??= meta?.defaultHeight;
			icon.name ??= meta?.name ?? '';
		}
		for (const key of ['x', 'y', 'width', 'height'] as const) {
			if (!finiteNumber(icon[key])) problems.push(`${where}/${key} must be a number`);
		}
		if (finiteNumber(icon.width) && icon.width < 1) problems.push(`${where}/width must be >= 1`);
		if (finiteNumber(icon.height) && icon.height < 1) problems.push(`${where}/height must be >= 1`);
		if (typeof icon.name !== 'string') icon.name = '';
		if (typeof icon.path !== 'string') icon.path = '';
		if (!finiteNumber(icon.z)) icon.z = previousIds.has(id) ? undefined : ++maxZ;
		icons.push(icon as unknown as CanvasIcon);
	}

	const removedChat = previous.filter(
		(icon) => icon.widget_type === 'aichat' && !icons.some((next) => next.id === icon.id)
	);
	if (removedChat.length > 0) {
		problems.push('AI chat widgets cannot be removed through a patch (the user removes them)');
	}
	if (problems.length > 0) throw new PatchRejected(problems.join('\n'));
	return icons;
}

export interface PatchOutcome {
	next: LayoutState;
	/** Effective changes, as seen in the AI's view. */
	changes: Operation[];
	/** Values the app adjusted after the patch (clamped, defaulted...). */
	adjusted: string[];
	/** Why the user must approve this patch first; empty when it is harmless. */
	sensitive: string[];
}

/**
 * Applies an RFC 6902 patch from the AI to the layout. Throws PatchRejected
 * with a message meant to be sent back to the model.
 */
export function applyConfigPatch(
	state: LayoutState,
	operations: Operation[],
	normalizeSettings: (settings: CanvasSettings) => CanvasSettings
): PatchOutcome {
	if (!Array.isArray(operations) || operations.length === 0) {
		throw new PatchRejected('The patch is empty');
	}
	for (const [index, op] of operations.entries()) {
		const paths = [op.path, (op as { from?: string }).from].filter(Boolean) as string[];
		if (paths.some(protectedPath)) {
			throw new PatchRejected(
				`Operation ${index} touches network permissions, which only the user can change in the widget's Network tab`
			);
		}
	}

	const { view, hidden } = buildView(state);
	let patched: ConfigDocument;
	try {
		patched = applyPatch(deepClone(view), operations, true, true, true).newDocument;
	} catch (error) {
		const e = error as { name?: string; message?: string; index?: number };
		const at = e.index !== undefined ? ` (operation ${e.index})` : '';
		throw new PatchRejected(`${e.name ?? 'Error'}${at}: ${e.message ?? String(error)}`);
	}
	if (!patched || typeof patched !== 'object' || !patched.settings || !patched.icons) {
		throw new PatchRejected('The document must keep its "settings" and "icons" objects');
	}

	for (const [pointer, original] of hidden) {
		const current = pointerGet(patched, pointer);
		if (current.found && isHiddenMarker(current.value)) pointerSet(patched, pointer, original);
	}

	const icons = documentToIcons(patched, state.icons);
	const rawSettings = { ...patched.settings } as unknown as CanvasSettings;
	const record = rawSettings as unknown as Record<string, unknown>;
	for (const key of PROTECTED_SETTINGS) record[key] = state.settings[key];
	for (const [key, value] of Object.entries(state.settings)) {
		if (!SETTINGS_KEYS.includes(key as keyof CanvasSettings)) record[key] = value;
	}
	const settings = normalizeSettings(rawSettings);
	const next = { icons, settings };

	const after = buildView(next).view;
	const changes = compare(view, after);
	const adjusted = compare(buildView({ icons, settings: rawSettings }).view, after)
		.filter((op) => op.op !== 'remove')
		.map((op) => `${op.path} was adjusted to ${JSON.stringify((op as { value?: unknown }).value)}`);

	return { next, changes, adjusted, sensitive: sensitiveChanges(state, next) };
}

const POWER_WIDGETS = ['sleep', 'restart', 'shutdown'];

function safeUrl(url: unknown): boolean {
	return typeof url !== 'string' || url === '' || /^https?:\/\//i.test(url.trim());
}

/**
 * Changes that can launch programs, act system-wide or skip a safety prompt.
 * Preset import strips these; from the AI they need the user's approval.
 */
export function sensitiveChanges(before: LayoutState, after: LayoutState): string[] {
	const reasons: string[] = [];
	const previous = new Map(before.icons.map((icon) => [icon.id, icon]));
	for (const icon of after.icons) {
		const old = previous.get(icon.id);
		const label = icon.custom_name || icon.name || icon.id;
		if (icon.icon_type === 'app' && (icon.path !== (old?.path ?? '') || old?.icon_type !== 'app')) {
			reasons.push(`"${label}" launches the program: ${icon.path || '(empty)'}`);
		}
		if ((icon.args ?? '') !== (old?.args ?? '') && icon.args) {
			reasons.push(`"${label}" runs with arguments: ${icon.args}`);
		}
		if ((icon.url ?? '') !== (old?.url ?? '') && !safeUrl(icon.url)) {
			reasons.push(`"${label}" opens a non-web link: ${icon.url}`);
		}
		if (icon.keybind_global && !old?.keybind_global) {
			reasons.push(`"${label}" gets a system-wide shortcut`);
		}
		if (POWER_WIDGETS.includes(icon.widget_type ?? '')) {
			const wasOff =
				(old?.widget_config as { requireConfirmation?: boolean } | undefined)
					?.requireConfirmation === false;
			const isOff =
				(icon.widget_config as { requireConfirmation?: boolean } | undefined)
					?.requireConfirmation === false;
			if (isOff && !wasOff)
				reasons.push(`"${label}" will ${icon.widget_type} without asking for confirmation`);
		}
	}
	const keybinds = SETTINGS_KEYS.filter((key) => key.startsWith('keybind_'));
	for (const key of keybinds) {
		if (JSON.stringify(before.settings[key]) !== JSON.stringify(after.settings[key])) {
			reasons.push(`App shortcut ${key.replace('keybind_', '')} changes`);
		}
	}
	return reasons;
}

/** Reads a subtree of the AI's view. */
export function readView(state: LayoutState, pointer = ''): unknown {
	const { view } = buildView(state);
	if (!pointer || pointer === '/') return view;
	const result = pointerGet(view, pointer);
	if (!result.found) throw new PatchRejected(`Nothing at ${pointer}`);
	return result.value;
}

/** Compact overview for the system prompt: every setting plus one line per icon. */
export function overview(state: LayoutState): string {
	const { view } = buildView(state);
	const settings = { ...view.settings } as Record<string, unknown>;
	const layers = Array.isArray(settings.background_layers) ? settings.background_layers : [];
	settings.background_layers = layers.map((layer) => {
		const l = layer as Record<string, unknown>;
		const source = typeof l.source === 'string' ? l.source : '';
		return source.length > 200
			? { ...l, source: `<<${source.length} chars, read with get_config>>` }
			: l;
	});
	const lines = Object.entries(view.icons).map(([id, icon]) => {
		const appearance =
			(icon.icon_type === 'widget'
				? (icon.widget_config as { appearance?: Record<string, unknown> } | undefined)?.appearance
				: (icon.appearance as Record<string, unknown> | undefined)) ?? {};
		const css = typeof appearance.customCss === 'string' && appearance.customCss.trim();
		const kind = icon.icon_type === 'widget' ? `widget:${icon.widget_type}` : icon.icon_type;
		const label = (icon.custom_name as string) || (icon.name as string) || '';
		return `- ${id} ${kind}${label ? ` "${label}"` : ''} at (${icon.x}, ${icon.y}) ${icon.width}x${icon.height}${css ? ' [custom CSS]' : ''}`;
	});
	return `settings = ${JSON.stringify(settings)}\n\nicons:\n${lines.join('\n') || '(none)'}`;
}
