import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	buildTimeline,
	cascadeIn,
	createCanvasTransition,
	type TransitionOptions,
	type TransitionTargets
} from './canvas-transition';

function element(rect: Partial<DOMRect> = {}): HTMLElement {
	const el = document.createElement('div');
	el.getBoundingClientRect = () =>
		({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, ...rect }) as DOMRect;
	return el;
}

function targets(tiles: HTMLElement[] = []): TransitionTargets {
	return {
		backdrop: element(),
		panel: element({ top: 100, left: 200, right: 1000, bottom: 700 }),
		tiles
	};
}

const options = (overrides: Partial<TransitionOptions> = {}): TransitionOptions => ({
	animation: 'fade',
	edge: 'bottom',
	duration: 200,
	cascade: false,
	...overrides
});

const viewport = { w: 1200, h: 800 };

describe('buildTimeline', () => {
	it('is empty for "none" without a cascade', () => {
		expect(buildTimeline(targets(), options({ animation: 'none' }), viewport)).toEqual([]);
	});

	it('fades the backdrop along with the panel', () => {
		const t = targets();
		const steps = buildTimeline(t, options(), viewport);
		expect(steps.map((s) => s.element)).toEqual([t.backdrop, t.panel]);
	});

	it('slides the panel in from just past the chosen edge', () => {
		const offset = (edge: TransitionOptions['edge']) =>
			buildTimeline(targets(), options({ animation: 'slide', edge }), viewport)[1].keyframes[0]
				.translate;

		expect(offset('bottom')).toBe('0 700px');
		expect(offset('top')).toBe('0 -700px');
		expect(offset('left')).toBe('-1000px 0');
		expect(offset('right')).toBe('1000px 0');
	});

	it('cascades tiles diagonally from the top-left', () => {
		const far = element({ top: 300, left: 300 });
		const near = element({ top: 0, left: 0 });
		const middle = element({ top: 0, left: 200 });
		const steps = buildTimeline(
			targets([far, near, middle]),
			options({ cascade: true }),
			viewport
		).slice(2);

		expect(steps.map((s) => s.element)).toEqual([near, middle, far]);
		const delays = steps.map((s) => s.delay);
		expect(delays[0]).toBe(50);
		expect(delays[1] - delays[0]).toBe(40);
		expect(delays[2] - delays[1]).toBe(40);
	});

	it('cascades on top of any panel animation', () => {
		const tile = element();
		const t = targets([tile]);
		const elements = (animation: TransitionOptions['animation']) =>
			buildTimeline(t, options({ animation, cascade: true }), viewport).map((s) => s.element);

		expect(elements('zoom')).toEqual([t.backdrop, t.panel, tile]);
		expect(elements('slide')).toEqual([t.backdrop, t.panel, tile]);
	});

	it('starts the cascade at once when the panel does not animate', () => {
		const tile = element();
		const steps = buildTimeline(
			targets([tile]),
			options({ animation: 'none', cascade: true }),
			viewport
		);
		expect(steps).toEqual([expect.objectContaining({ element: tile, delay: 0 })]);
	});
});

interface FakeAnimation {
	keyframes: Keyframe[];
	timing: KeyframeAnimationOptions;
	reversed: boolean;
	cancelled: boolean;
	resolve: () => void;
}

function stubAnimate() {
	const created: FakeAnimation[] = [];
	vi.spyOn(Element.prototype, 'animate').mockImplementation(function (keyframes, timing) {
		let resolve!: () => void;
		const finished = new Promise<void>((r) => (resolve = r));
		const fake: FakeAnimation = {
			keyframes: keyframes as Keyframe[],
			timing: timing as KeyframeAnimationOptions,
			reversed: false,
			cancelled: false,
			resolve
		};
		created.push(fake);
		return {
			finished,
			reverse: () => (fake.reversed = !fake.reversed),
			cancel: () => (fake.cancelled = true)
		} as unknown as Animation;
	});
	return created;
}

afterEach(() => vi.restoreAllMocks());

describe('createCanvasTransition', () => {
	function setup(initialPhase: 'open' | 'closed' = 'open', tiles: HTMLElement[] = []) {
		const t = targets(tiles);
		const concealed = vi.fn();
		const transition = createCanvasTransition({
			targets: () => t,
			setConcealed: concealed,
			initialPhase
		});
		return { transition, concealed };
	}

	it('plays the close as the mirror of the open, spanning one total length', async () => {
		const created = stubAnimate();
		const { transition } = setup('open', [element(), element()]);

		void transition.close(options({ cascade: true }));

		const total = Math.max(
			...created.map((a) => (a.timing.delay as number) + (a.timing.duration as number))
		);
		for (const a of created) {
			expect(a.timing.direction).toBe('reverse');
			expect(
				(a.timing.delay as number) + (a.timing.duration as number) + (a.timing.endDelay as number)
			).toBe(total);
		}
	});

	it('cascades preset tiles in from hidden, without waiting on a panel', () => {
		const created = stubAnimate();
		cascadeIn([element(), element()], 200);

		expect(created).toHaveLength(2);
		expect(created[0].timing.delay).toBe(0);
		expect(created[0].timing.direction).toBe('normal');
		expect(created[0].keyframes[0].opacity).toBeLessThan(0.1);
	});

	it('conceals once the close animation ends', async () => {
		const created = stubAnimate();
		const { transition, concealed } = setup();

		const closing = transition.close(options());
		expect(transition.phase).toBe('closing');
		expect(concealed).not.toHaveBeenCalled();

		created.forEach((a) => a.resolve());
		expect(await closing).toBe(true);
		expect(concealed).toHaveBeenLastCalledWith(true);
		expect(created.every((a) => a.cancelled)).toBe(true);
		expect(transition.phase).toBe('closed');
	});

	it('reverses a running close when reopened, and the close gives up', async () => {
		const created = stubAnimate();
		const { transition, concealed } = setup();

		const closing = transition.close(options());
		const opening = transition.open(options({ animation: 'zoom' }));

		expect(created).toHaveLength(2);
		expect(created.every((a) => a.reversed)).toBe(true);
		expect(transition.phase).toBe('opening');

		created.forEach((a) => a.resolve());
		expect(await closing).toBe(false);
		expect(await opening).toBe(true);
		expect(concealed).not.toHaveBeenCalledWith(true);
		expect(transition.phase).toBe('open');
	});

	it('ignores a request for the state it is already in', async () => {
		stubAnimate();
		const { transition } = setup('open');
		expect(await transition.open(options())).toBe(false);
	});

	it('opens instantly with "none"', async () => {
		const created = stubAnimate();
		const { transition, concealed } = setup('closed');

		expect(await transition.open(options({ animation: 'none' }))).toBe(true);
		expect(created).toHaveLength(0);
		expect(concealed).toHaveBeenCalledWith(false);
	});
});
