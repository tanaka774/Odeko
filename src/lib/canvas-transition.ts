import { tick } from 'svelte';

export type CanvasAnimation = 'none' | 'fade' | 'zoom' | 'slide';
export type SlideEdge = 'top' | 'bottom' | 'left' | 'right';
export type CanvasPhase = 'open' | 'opening' | 'closing' | 'closed';

export interface TransitionTargets {
	backdrop: HTMLElement;
	panel: HTMLElement;
	tiles: HTMLElement[];
}

export interface TransitionOptions {
	animation: CanvasAnimation;
	edge: SlideEdge;
	duration: number;
	/** Tiles sweep in one after another on top of the panel animation. */
	cascade: boolean;
}

export interface TransitionStep {
	element: HTMLElement;
	keyframes: Keyframe[];
	delay: number;
	duration: number;
}

// Not 0: WebKitGTK stops repainting fully transparent layers, so the
// next open would start from a stale frame.
export const HIDDEN_OPACITY = 0.01;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';
const CASCADE_STEP_MAX_MS = 40;

const fadeIn: Keyframe[] = [{ opacity: HIDDEN_OPACITY }, { opacity: 1 }];

export const painted = () =>
	new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** Translation that puts the panel just past the given screen edge. */
function offscreenOffset(rect: DOMRect, edge: SlideEdge, viewport: { w: number; h: number }) {
	switch (edge) {
		case 'top':
			return `0 ${-rect.bottom}px`;
		case 'bottom':
			return `0 ${viewport.h - rect.top}px`;
		case 'left':
			return `${-rect.right}px 0`;
		case 'right':
			return `${viewport.w - rect.left}px 0`;
	}
}

/** Tiles sweep in diagonally from the top-left corner, like the old Start screen. */
function cascadeOrder(tiles: HTMLElement[]): HTMLElement[] {
	const keyed = tiles.map((tile) => {
		const rect = tile.getBoundingClientRect();
		return { tile, key: rect.top + rect.left };
	});
	return keyed.sort((a, b) => a.key - b.key).map((entry) => entry.tile);
}

function cascadeSteps(tiles: HTMLElement[], duration: number, start: number): TransitionStep[] {
	const ordered = cascadeOrder(tiles);
	const step = Math.min(CASCADE_STEP_MAX_MS, duration / Math.max(ordered.length - 1, 1));
	return ordered.map((tile, i) => ({
		element: tile,
		keyframes: [
			{ opacity: HIDDEN_OPACITY, translate: '0 24px', scale: '0.9' },
			{ opacity: 1, translate: '0 0', scale: '1' }
		],
		delay: start + i * step,
		duration
	}));
}

/** The opening timeline; closing plays its mirror image. */
export function buildTimeline(
	targets: TransitionTargets,
	options: TransitionOptions,
	viewport = { w: window.innerWidth, h: window.innerHeight }
): TransitionStep[] {
	const { duration } = options;
	const steps: TransitionStep[] = [];
	const panel = (keyframes: Keyframe[]) =>
		steps.push(
			{ element: targets.backdrop, keyframes: fadeIn, delay: 0, duration },
			{ element: targets.panel, keyframes, delay: 0, duration }
		);

	switch (options.animation) {
		case 'none':
			break;
		case 'fade':
			panel(fadeIn);
			break;
		case 'zoom':
			panel([
				{ opacity: HIDDEN_OPACITY, scale: '0.92' },
				{ opacity: 1, scale: '1' }
			]);
			break;
		case 'slide':
			panel([
				{
					translate: offscreenOffset(targets.panel.getBoundingClientRect(), options.edge, viewport)
				},
				{ translate: '0 0' }
			]);
			break;
	}
	if (options.cascade) {
		const start = options.animation === 'none' ? 0 : duration / 4;
		steps.push(...cascadeSteps(targets.tiles, duration, start));
	}
	return steps;
}

/**
 * Every animation spans the whole timeline (delay + duration + endDelay), so
 * reversing them mid-flight retraces the same path in mirror order.
 */
function play(steps: TransitionStep[], direction: 'open' | 'close'): Animation[] {
	const total = Math.max(0, ...steps.map((s) => s.delay + s.duration));
	return steps.map((s) => {
		const before = direction === 'open' ? s.delay : total - s.delay - s.duration;
		return s.element.animate(s.keyframes, {
			duration: s.duration,
			easing: EASING,
			fill: 'both',
			direction: direction === 'open' ? 'normal' : 'reverse',
			delay: before,
			endDelay: total - before - s.duration
		});
	});
}

/** Sweeps freshly laid out tiles in, e.g. after a preset switch. */
export function cascadeIn(tiles: HTMLElement[], duration: number): Animation[] {
	return play(cascadeSteps(tiles, duration, 0), 'open');
}

/**
 * Drives the canvas show/hide animations. `close()` resolves `true` once the
 * canvas is fully concealed and the window can be hidden; a call that was
 * superseded (e.g. reopened mid-close) resolves `false`.
 */
export function createCanvasTransition(deps: {
	targets: () => TransitionTargets | null;
	setConcealed: (concealed: boolean) => void;
	initialPhase?: CanvasPhase;
}) {
	let phase: CanvasPhase = deps.initialPhase ?? 'open';
	let animations: Animation[] = [];
	let generation = 0;

	function finish() {
		for (const animation of animations) animation.cancel();
		animations = [];
	}

	async function run(direction: 'open' | 'close', options: TransitionOptions): Promise<boolean> {
		const settled = direction === 'open' ? 'open' : 'closed';
		const moving = direction === 'open' ? 'opening' : 'closing';
		if (phase === settled || phase === moving) return false;

		const gen = ++generation;
		const reversing = animations.length > 0;
		phase = moving;
		if (reversing) {
			for (const animation of animations) animation.reverse();
		} else {
			const targets = deps.targets();
			animations = targets ? play(buildTimeline(targets, options), direction) : [];
		}
		if (direction === 'open') deps.setConcealed(false);

		await Promise.all(animations.map((a) => a.finished)).catch(() => {});
		if (gen !== generation) return false;

		if (direction === 'close') {
			deps.setConcealed(true);
			await tick();
			if (gen !== generation) return false;
			finish();
			// The last frame painted before the window hides is the first one
			// shown on the next open, so it must already be concealed.
			await painted();
			if (gen !== generation) return false;
		} else {
			finish();
		}
		phase = settled;
		return true;
	}

	return {
		get phase() {
			return phase;
		},
		open: (options: TransitionOptions) => run('open', options),
		close: (options: TransitionOptions) => run('close', options)
	};
}
