import type { CanvasIcon } from '$lib/icons';
import type { CanvasSettings } from '$lib/stores/settings.svelte';
import type { PresetTransitionStyle } from '$lib/presets';
import { isVideoBackground } from '$lib/background';
import { safeCssUrl } from '$lib/utils';

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

/** Per-icon fade-out as a share of the run; the rest is the fade-in. */
const OUT_SHARE = 0.3;
const IN_SHARE = 0.45;

/**
 * A switch that interrupts another one gets out of the way quickly.
 */
const SUPERSEDED_DURATION_MS = 120;

let phase = $state<TransitionPhase>('idle');
let style = $state<PresetTransitionStyle>('fade');
let outMs = $state(0);
let inMs = $state(0);
let staggerMs = $state(0);
let outStaggerMs = $state(0);
let totalMs = $state(0);
let from = $state<PresetLayers | null>(null);
let to = $state<PresetLayers | null>(null);
let pending = $state<PresetLayers | null>(null);
let generation = 0;

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves after the browser has had a chance to apply and paint what was just
 * set. Without this the class change and the heavy work that follows land in
 * the same frame, the browser never paints the intermediate state, and the
 * animation shows up as a hard cut.
 */
export function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestAnimationFrame !== 'function') {
			setTimeout(resolve, 16);
			return;
		}
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

/** Decode the incoming background before the animation starts, not during it. */
export async function preloadBackgroundImage(settings: CanvasSettings): Promise<void> {
	const source = settings.background_image;
	if (!source || isVideoBackground(source)) return;
	const url = safeCssUrl(source);
	if (!url) return;
	const image = new Image();
	image.src = url;
	try {
		await image.decode();
	} catch {
		// A background that fails to decode is the canvas's problem, not ours.
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
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
	/** Duration of the outgoing half, in ms (per-icon fade-out). */
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
	/** The outgoing ripple is half as wide, so it does not drag. */
	get outStaggerMs() {
		return outStaggerMs;
	},
	/** Wall-clock length of the current run, tails included. */
	get totalMs() {
		return totalMs;
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
			outStaggerMs = 0;
			totalMs = 0;
			await commit();
			return;
		}

		// The per-icon duration is deliberately shorter than the phase, so the
		// first icon is fully visible long before the last one starts.
		outMs = clamp(Math.round(total * OUT_SHARE), 60, 200);
		inMs = clamp(Math.round(total * IN_SHARE), 90, 260);
		staggerMs = stagger;
		outStaggerMs = Math.round(stagger * 0.5);

		const outTail = staggerDelay(target.icons.length - 1, outStaggerMs);
		const inTail = staggerDelay(target.icons.length - 1, stagger);
		totalMs = outMs + outTail + inMs + inTail;

		style = timing.style;
		from = start;
		to = target;
		pending = target;
		phase = 'out';

		// Give the browser a frame to actually start the fade-out before the
		// swap blocks the main thread; otherwise it paints one hard cut.
		await nextFrame();
		if (runId !== generation) return;

		await wait(outMs + outTail);
		if (runId !== generation) return;

		// The swap mounts the incoming preset's widgets, which is the most
		// expensive moment of the whole switch. It happens while every icon is
		// at opacity 0, so the stall is invisible.
		try {
			await commit();
		} catch (error) {
			if (runId === generation) settle();
			throw error;
		}
		if (runId !== generation) return;
		phase = 'in';

		await nextFrame();
		if (runId !== generation) return;

		await wait(inMs + inTail);
		if (runId !== generation) return;

		settle();
	},

	reset() {
		generation += 1;
		settle();
		outMs = 0;
		inMs = 0;
		staggerMs = 0;
		outStaggerMs = 0;
		totalMs = 0;
	}
};
