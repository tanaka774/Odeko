import { invoke } from '@tauri-apps/api/core';
import type { CanvasIcon } from '$lib/icons';
import type { CanvasLayout, CanvasSettings, KeybindConfig } from '$lib/stores/settings.svelte';

export interface PresetSummary {
	name: string;
	/** `null` when the preset file exists but cannot be parsed. */
	icon_count: number | null;
	/** Last modification time, in seconds since the Unix epoch. */
	updated_at: number;
	is_active: boolean;
}

export type PresetTransitionStyle = 'fade' | 'slide' | 'zoom' | 'none';

/** How the canvas animates between presets. Global, not per preset. */
export interface PresetTransition {
	style: PresetTransitionStyle;
	duration_ms: number;
	stagger_ms: number;
}

export interface PresetSlot {
	name: string | null;
	keybind: KeybindConfig | null;
	/** Register with the OS instead of only while the canvas has focus. */
	global: boolean;
}

export interface PresetPrefs {
	slots: PresetSlot[];
	transition: PresetTransition;
	last_preset: string | null;
}

export const PRESET_SLOT_COUNT = 9;

export const DEFAULT_PRESET_TRANSITION: PresetTransition = {
	style: 'fade',
	duration_ms: 260,
	stagger_ms: 24
};

export const TRANSITION_STYLES: { value: PresetTransitionStyle; label: string }[] = [
	{ value: 'fade', label: 'Fade' },
	{ value: 'slide', label: 'Slide' },
	{ value: 'zoom', label: 'Zoom' },
	{ value: 'none', label: 'None' }
];

export interface ImportResult {
	name: string;
	cleared_network_grants: number;
	cleared_local_network: boolean;
	cleared_global_shortcuts: number;
	forced_power_confirmation: number;
}

export function listPresets(): Promise<PresetSummary[]> {
	return invoke<PresetSummary[]>('list_presets');
}

export function switchPreset(name: string): Promise<void> {
	return invoke('set_active_preset', { name });
}

export function saveLayoutToActivePreset(
	icons: CanvasIcon[],
	settings: CanvasSettings
): Promise<string> {
	return invoke<string>('save_active_layout', { icons, settings });
}

export function savePresetAs(
	name: string,
	icons: CanvasIcon[],
	settings: CanvasSettings
): Promise<void> {
	return invoke('save_preset_as', { name, icons, settings });
}

export function createBlankPreset(name: string): Promise<void> {
	return invoke('save_default_preset', { name });
}

export function duplicatePreset(name: string, newName: string): Promise<void> {
	return invoke('duplicate_preset', { name, newName });
}

export function deletePreset(name: string): Promise<void> {
	return invoke('delete_preset', { name });
}

export function renamePreset(oldName: string, newName: string): Promise<void> {
	return invoke('rename_preset', { oldName, newName });
}

export function exportPreset(name: string, path: string): Promise<void> {
	return invoke('export_preset', { name, path });
}

export function importPreset(path: string): Promise<ImportResult> {
	return invoke<ImportResult>('import_preset', { path });
}

/** Read a preset without making it active (the transition needs it first). */
export function readPreset(name: string): Promise<CanvasLayout> {
	return invoke<CanvasLayout>('read_preset', { name });
}

export function getPresetPrefs(): Promise<PresetPrefs> {
	return invoke<PresetPrefs>('get_preset_prefs');
}

export function savePresetPrefs(prefs: PresetPrefs): Promise<void> {
	return invoke('save_preset_prefs', { prefs });
}

export function normalizeSlots(slots: PresetSlot[] | undefined): PresetSlot[] {
	const next = (slots ?? []).slice(0, PRESET_SLOT_COUNT).map((slot) => ({
		name: slot?.name ?? null,
		keybind: slot?.keybind ?? null,
		global: slot?.global ?? false
	}));
	while (next.length < PRESET_SLOT_COUNT) {
		next.push({ name: null, keybind: null, global: false });
	}
	return next;
}

// Cycling with the arrow keys fires a switch per keypress. The canvas updates
// immediately; only the last one is worth writing to disk and re-registering
// OS shortcuts for.
const COMMIT_DELAY_MS = 350;
let commitTimer: ReturnType<typeof setTimeout> | null = null;
let pendingCommit: { name: string; icons: CanvasIcon[] } | null = null;

export function schedulePresetCommit(name: string, icons: CanvasIcon[], delay = COMMIT_DELAY_MS) {
	pendingCommit = { name, icons };
	if (commitTimer) clearTimeout(commitTimer);
	commitTimer = setTimeout(() => {
		void flushPresetCommit();
	}, delay);
}

export async function flushPresetCommit(): Promise<void> {
	if (commitTimer) {
		clearTimeout(commitTimer);
		commitTimer = null;
	}
	const pending = pendingCommit;
	pendingCommit = null;
	if (!pending) return;
	try {
		await invoke('set_active_preset', { name: pending.name });
		await invoke('update_icon_shortcuts', { icons: pending.icons });
	} catch (error) {
		console.error('Failed to persist the active preset:', error);
	}
}

export function cancelPresetCommit() {
	if (commitTimer) clearTimeout(commitTimer);
	commitTimer = null;
	pendingCommit = null;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(updatedAt: number, now = Date.now()): string {
	if (!updatedAt) return 'unknown';
	const seconds = Math.max(0, Math.floor(now / 1000) - updatedAt);
	if (seconds < MINUTE) return 'just now';
	if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m ago`;
	if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h ago`;
	if (seconds < MONTH) return `${Math.floor(seconds / DAY)}d ago`;
	if (seconds < YEAR) return `${Math.floor(seconds / MONTH)}mo ago`;
	return `${Math.floor(seconds / YEAR)}y ago`;
}

export function presetMeta(preset: PresetSummary, now = Date.now()): string {
	const age = formatRelativeTime(preset.updated_at, now);
	if (preset.icon_count === null) return `unreadable · ${age}`;
	const count = preset.icon_count === 1 ? '1 item' : `${preset.icon_count} items`;
	return `${count} · ${age}`;
}

export function uniquePresetName(base: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	if (!used.has(base)) return base;
	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${base} ${suffix}`;
		if (!used.has(candidate)) return candidate;
	}
}

/** What an import stripped from the file, phrased for the user. */
export function importNotes(result: ImportResult): string[] {
	const notes: string[] = [];
	if (result.cleared_network_grants > 0) {
		notes.push(`cleared ${result.cleared_network_grants} network grant(s)`);
	}
	if (result.cleared_local_network) notes.push('disabled local network access');
	if (result.cleared_global_shortcuts > 0) {
		notes.push(`disabled ${result.cleared_global_shortcuts} global shortcut(s)`);
	}
	if (result.forced_power_confirmation > 0) {
		notes.push(`re-enabled confirmation on ${result.forced_power_confirmation} power widget(s)`);
	}
	return notes;
}
