import type { CanvasIcon } from '$lib/icons';
import type { CanvasSettings } from '$lib/stores/settings.svelte';
import type { PresetTransitionStyle } from '$lib/presets';

export interface PresetLayers {
	icons: CanvasIcon[];
	settings: CanvasSettings;
}

export type TransitionPhase = 'idle' | 'out' | 'in';

export interface TransitionTiming {
	style: PresetTransitionStyle;
	duration_ms: number;
	stagger_ms: number;
}

/**
 * Icons past this index share the last delay, so a grid with sixty icons does
 * not take two seconds to finish appearing.
 */
export const MAX_STAGGERED_ICONS = 24;

/** Share of the run spent fading the outgoing layout out. */
const OUT_SHARE = 0.35;

/** A switch that interrupts another one gets out of the way quickly. */
const SUPERSEDED_DURATION_MS = 120;

let phase = $state<TransitionPhase>('idle');
let style = $state<PresetTransitionStyle>('fade');
let outMs = $state(0);
let inMs = $state(0);
let staggerMs = $state(0);
let from = $state<PresetLayers | null>(null);
let to = $state<PresetLayers | null>(null);
let pending = $state<PresetLayers | null>(null);
let generation = 0;

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function staggerDelay(index: number, stagger: number): number {
	return Math.min(Math.max(index, 0), MAX_STAGGERED_ICONS) * stagger;
}

function settle() {
	phase = 'idle';
	from = null;
	to = null;
	pending = null;
}

export const presetTransition = {
	get phase() {
		return phase;
	},
	get style() {
		return style;
	},
	/** Duration of the outgoing half, in ms (for the CSS fade-out). */
	get outMs() {
		return outMs;
	},
	/** Duration of the incoming half, in ms (per-icon fade-in). */
	get inMs() {
		return inMs;
	},
	get staggerMs() {
		return staggerMs;
	},
	get from() {
		return from;
	},
	get to() {
		return to;
	},
	/**
	 * The layers the canvas is showing or heading towards. Callers use it as
	 * the starting point of the next run, so interrupting a switch animates
	 * from what is on screen instead of snapping back.
	 */
	get pending() {
		return pending;
	},
	get active() {
		return phase !== 'idle';
	},

	async run(
		start: PresetLayers,
		target: PresetLayers,
		commit: () => void | Promise<void>,
		timing: TransitionTiming
	): Promise<void> {
		const runId = ++generation;
		const superseded = phase !== 'idle';
		const total = superseded
			? Math.min(timing.duration_ms, SUPERSEDED_DURATION_MS)
			: timing.duration_ms;
		const stagger = superseded ? 0 : timing.stagger_ms;

		if (timing.style === 'none' || total <= 0) {
			settle();
			style = timing.style;
			outMs = 0;
			inMs = 0;
			staggerMs = 0;
			await commit();
			return;
		}

		outMs = Math.max(1, Math.round(total * OUT_SHARE));
		inMs = Math.max(1, total - outMs);
		staggerMs = stagger;

		style = timing.style;
		from = start;
		to = target;
		pending = target;
		phase = 'out';

		await wait(outMs);
		if (runId !== generation) return;

		try {
			await commit();
		} catch (error) {
			if (runId === generation) settle();
			throw error;
		}
		if (runId !== generation) return;
		phase = 'in';

		await wait(inMs + staggerDelay(target.icons.length - 1, stagger));
		if (runId !== generation) return;

		settle();
	},

	reset() {
		generation += 1;
		settle();
		outMs = 0;
		inMs = 0;
		staggerMs = 0;
	}
};
