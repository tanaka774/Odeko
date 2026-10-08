import {
	DEFAULT_PRESET_TRANSITION,
	getPresetPrefs,
	normalizeSlots,
	savePresetPrefs,
	type PresetSlot,
	type PresetTransition
} from '$lib/presets';
import type { KeybindConfig } from '$lib/stores/settings.svelte';

/** Dragging the duration slider must not write config.json on every tick. */
const PERSIST_DELAY_MS = 400;

function createPresetPrefsStore() {
	let slots = $state<PresetSlot[]>(normalizeSlots([]));
	let transition = $state<PresetTransition>({ ...DEFAULT_PRESET_TRANSITION });
	let lastPreset = $state<string | null>(null);
	let isLoaded = $state(false);
	let persistTimer: ReturnType<typeof setTimeout> | null = null;

	async function load() {
		try {
			const prefs = await getPresetPrefs();
			slots = normalizeSlots(prefs.slots);
			transition = { ...DEFAULT_PRESET_TRANSITION, ...prefs.transition };
			lastPreset = prefs.last_preset ?? null;
			isLoaded = true;
		} catch (error) {
			console.error('Failed to load preset preferences:', error);
		}
	}

	async function flush() {
		if (persistTimer) {
			clearTimeout(persistTimer);
			persistTimer = null;
		}
		try {
			await savePresetPrefs({
				slots: $state.snapshot(slots) as PresetSlot[],
				transition: $state.snapshot(transition) as PresetTransition,
				last_preset: lastPreset
			});
		} catch (error) {
			console.error('Failed to save preset preferences:', error);
		}
	}

	function schedulePersist() {
		if (persistTimer) clearTimeout(persistTimer);
		persistTimer = setTimeout(() => {
			void flush();
		}, PERSIST_DELAY_MS);
	}

	function updateSlot(index: number, patch: Partial<PresetSlot>) {
		if (index < 0 || index >= slots.length) return;
		slots[index] = { ...slots[index], ...patch };
		schedulePersist();
	}

	return {
		get slots() {
			return slots;
		},
		get transition() {
			return transition;
		},
		get lastPreset() {
			return lastPreset;
		},
		get isLoaded() {
			return isLoaded;
		},
		load,
		flush,
		assignSlot(index: number, name: string | null) {
			updateSlot(index, { name });
		},
		setSlotKeybind(index: number, keybind: KeybindConfig | null) {
			updateSlot(index, { keybind });
		},
		setSlotGlobal(index: number, global: boolean) {
			updateSlot(index, { global });
		},
		setTransition(next: Partial<PresetTransition>) {
			transition = { ...transition, ...next };
			schedulePersist();
		},
		setLastPreset(name: string | null) {
			if (lastPreset === name) return;
			lastPreset = name;
			schedulePersist();
		}
	};
}

export const presetPrefs = createPresetPrefsStore();
