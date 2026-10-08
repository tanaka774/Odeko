import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	MAX_STAGGERED_ICONS,
	presetTransition,
	staggerDelay,
	type PresetLayers
} from './preset-transition.svelte';
import type { CanvasSettings } from '$lib/stores/settings.svelte';

function layers(iconCount: number, color = '20, 20, 30'): PresetLayers {
	return {
		icons: Array.from({ length: iconCount }, (_, index) => ({ id: `icon-${index}` })) as never,
		settings: { background_color: color } as CanvasSettings
	};
}

beforeEach(() => {
	presetTransition.reset();
	vi.useFakeTimers();
});

afterEach(() => {
	presetTransition.reset();
	vi.useRealTimers();
});

describe('staggerDelay', () => {
	it('spreads the delay and then stops growing', () => {
		expect(staggerDelay(0, 20)).toBe(0);
		expect(staggerDelay(3, 20)).toBe(60);
		expect(staggerDelay(MAX_STAGGERED_ICONS + 40, 20)).toBe(MAX_STAGGERED_ICONS * 20);
	});
});

describe('presetTransition', () => {
	it('swaps in the middle of the run and settles at the end', async () => {
		const target = layers(3);
		const commit = vi.fn();
		const run = presetTransition.run(layers(1), target, commit, {
			style: 'fade',
			duration_ms: 200,
			stagger_ms: 10
		});

		expect(presetTransition.phase).toBe('out');
		expect(presetTransition.active).toBe(true);
		// $state proxies what it is given, so compare by value.
		expect(presetTransition.pending).toEqual(target);
		expect(commit).not.toHaveBeenCalled();

		// 35% of 200ms is the outgoing half.
		await vi.advanceTimersByTimeAsync(70);
		expect(commit).toHaveBeenCalledTimes(1);
		expect(presetTransition.phase).toBe('in');

		await vi.advanceTimersByTimeAsync(200);
		await run;

		expect(presetTransition.phase).toBe('idle');
		expect(presetTransition.from).toBeNull();
		expect(presetTransition.to).toBeNull();
		expect(presetTransition.pending).toBeNull();
	});

	it('commits immediately when the style is none', async () => {
		const commit = vi.fn();
		await presetTransition.run(layers(1), layers(2), commit, {
			style: 'none',
			duration_ms: 260,
			stagger_ms: 10
		});

		expect(commit).toHaveBeenCalledTimes(1);
		expect(presetTransition.phase).toBe('idle');
		expect(presetTransition.active).toBe(false);
	});

	it('lets a new switch take over without the old one committing', async () => {
		const firstCommit = vi.fn();
		const secondCommit = vi.fn();

		const first = presetTransition.run(layers(1), layers(2), firstCommit, {
			style: 'fade',
			duration_ms: 400,
			stagger_ms: 0
		});
		await vi.advanceTimersByTimeAsync(50);

		// The next switch starts from what is on screen, not from the store.
		const onScreen = presetTransition.pending;
		const second = presetTransition.run(onScreen!, layers(4), secondCommit, {
			style: 'fade',
			duration_ms: 400,
			stagger_ms: 0
		});

		await vi.advanceTimersByTimeAsync(600);
		await Promise.all([first, second]);

		expect(firstCommit).not.toHaveBeenCalled();
		expect(secondCommit).toHaveBeenCalledTimes(1);
		expect(presetTransition.phase).toBe('idle');
	});

	it('shortens a run that interrupts another one', async () => {
		const first = presetTransition.run(layers(1), layers(2), vi.fn(), {
			style: 'fade',
			duration_ms: 600,
			stagger_ms: 20
		});
		await vi.advanceTimersByTimeAsync(20);

		const second = presetTransition.run(layers(2), layers(3), vi.fn(), {
			style: 'fade',
			duration_ms: 600,
			stagger_ms: 20
		});
		// A superseded hop drops to the 120ms cap and skips the stagger.
		expect(presetTransition.outMs + presetTransition.inMs).toBe(120);
		expect(presetTransition.staggerMs).toBe(0);

		await vi.advanceTimersByTimeAsync(600);
		await Promise.all([first, second]);
		expect(presetTransition.phase).toBe('idle');
	});
});
