import { applyPatch, compare } from 'fast-json-patch';
import type { CanvasIcon } from '$lib/icons';
import type { CanvasSettings } from '$lib/stores/settings.svelte';
import type { LayoutState } from './config';

/**
 * IconGrid owns the live icon list; it registers this bridge on mount so the
 * AI tools can read and replace the whole layout (icons + settings) at once.
 */
export interface LayoutBridge {
	read(): LayoutState;
	/** Name of the preset the live layout belongs to. */
	preset(): string | null;
	/** Replaces icons and settings, then persists them to the active preset. */
	write(next: LayoutState): Promise<void>;
}

let bridge: LayoutBridge | null = null;

export function setLayoutBridge(next: LayoutBridge | null): void {
	bridge = next;
}

export function layoutBridge(): LayoutBridge {
	if (!bridge) throw new Error('The canvas is not ready yet');
	return bridge;
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

interface Keyed {
	settings: CanvasSettings;
	icons: Record<string, CanvasIcon>;
}

function keyed(state: LayoutState): Keyed {
	return {
		settings: clone(state.settings),
		icons: Object.fromEntries(state.icons.map((icon) => [icon.id, clone(icon)]))
	};
}

function unkeyed(doc: Keyed, order: CanvasIcon[]): LayoutState {
	const ids = Object.keys(doc.icons);
	const ordered = [
		...order.map((icon) => icon.id).filter((id) => id in doc.icons),
		...ids.filter((id) => !order.some((icon) => icon.id === id))
	];
	return { settings: doc.settings, icons: ordered.map((id) => doc.icons[id]) };
}

/**
 * Reverses the change from `before` to `after` on top of `current`, keeping
 * whatever else changed since. Falls back to `before` when the edits collide.
 */
export function revertChange(
	before: LayoutState,
	after: LayoutState,
	current: LayoutState
): LayoutState {
	const inverse = compare(keyed(after), keyed(before));
	try {
		const doc = applyPatch(keyed(current), inverse, false, true).newDocument;
		return unkeyed(doc, before.icons.length >= current.icons.length ? before.icons : current.icons);
	} catch {
		return clone(before);
	}
}

/**
 * Undoes the settings part of a change from `before` to `after`, keeping any
 * other settings edits made since.
 */
export function revertSettings(
	before: CanvasSettings,
	after: CanvasSettings,
	current: CanvasSettings
): CanvasSettings {
	const inverse = compare(clone(after), clone(before));
	try {
		return applyPatch(clone(current), inverse, false, true).newDocument;
	} catch {
		return clone(before);
	}
}

/** Applies `next` and returns a function that reverts just this change. */
export async function applyLayout(next: LayoutState): Promise<() => Promise<void>> {
	const active = layoutBridge();
	const preset = active.preset();
	const before = clone(active.read());
	const after = clone(next);
	await active.write(clone(next));
	return async () => {
		const target = layoutBridge();
		if (target.preset() !== preset) {
			throw new Error(`Switch back to preset "${preset ?? 'default'}" to revert this change`);
		}
		await target.write(revertChange(before, after, clone(target.read())));
	};
}
