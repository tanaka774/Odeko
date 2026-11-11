import {
	deletePreset,
	listPresets,
	loadPreset,
	renamePreset,
	savePresetAs,
	type PresetSummary
} from '$lib/presets';
import { settingsStore } from '$lib/stores/settings.svelte';
import type { CanvasIcon } from '$lib/icons';
import { layoutBridge } from './layout-bridge';

import { presetSwitcher, setPresetSwitcher } from './preset-switcher';

export { setPresetSwitcher };

export async function presetList(): Promise<string> {
	const presets = await listPresets();
	if (presets.length === 0) return 'No presets yet.';
	return presets
		.map((p: PresetSummary) => {
			const date = new Date(p.updated_at * 1000).toISOString().slice(0, 10);
			const icons = p.icon_count === null ? 'unreadable' : `${p.icon_count} items`;
			return `- ${p.name}${p.is_active ? ' (active)' : ''}: ${icons}, updated ${date}`;
		})
		.join('\n');
}

async function exists(name: string): Promise<boolean> {
	return (await listPresets()).some((p) => p.name === name);
}

export async function switchTo(name: string): Promise<void> {
	const switcher = presetSwitcher();
	if (!switcher) throw new Error('The canvas is not ready');
	if (!(await exists(name))) throw new Error(`Preset "${name}" does not exist`);
	if (settingsStore.activePreset === name) throw new Error(`"${name}" is already active`);
	await switcher(name);
}

/** Saves the live layout under a new name; returns an undo. */
export async function saveCurrentAs(name: string): Promise<() => Promise<void>> {
	if (await exists(name)) throw new Error(`Preset "${name}" already exists`);
	const { icons, settings } = layoutBridge().read();
	await savePresetAs(name, icons, settings);
	return () => deletePreset(name);
}

export async function rename(from: string, to: string): Promise<() => Promise<void>> {
	if (!(await exists(from))) throw new Error(`Preset "${from}" does not exist`);
	if (await exists(to)) throw new Error(`Preset "${to}" already exists`);
	await renamePreset(from, to);
	if (settingsStore.activePreset === from) settingsStore.setActivePreset(to);
	return async () => {
		await renamePreset(to, from);
		if (settingsStore.activePreset === to) settingsStore.setActivePreset(from);
	};
}

/** Deletes a preset that is not active; the undo writes it back from memory. */
export async function remove(name: string): Promise<() => Promise<void>> {
	if (settingsStore.activePreset === name) {
		throw new Error('The active preset cannot be deleted; switch to another one first');
	}
	if (!(await exists(name))) throw new Error(`Preset "${name}" does not exist`);
	const backup = await loadPreset(name);
	await deletePreset(name);
	return async () => {
		if (await exists(name)) throw new Error(`A preset named "${name}" exists again`);
		await savePresetAs(name, backup.icons as CanvasIcon[], backup.settings);
	};
}
