// Pointer, icon and click state for interactive background layers (shader
// and HTML). Layers never take pointer events, so the tracker listens on the
// window and reports everything in CSS pixels relative to the layer's
// element, origin top-left. Shaders flip it to their bottom-left origin.

export const MAX_ICONS = 64;
export const MAX_CLICKS = 8;

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface InputSample {
	width: number;
	height: number;
	pointer: { x: number; y: number; presence: number };
	/** CSS pixels per second, y pointing down. */
	velocity: { x: number; y: number };
	/** Last hovered icon; `amount` fades to 0 after the pointer leaves it. */
	hover: Rect & { amount: number };
	icons: Rect[];
	/** Newest first; `age` in seconds. */
	clicks: { x: number; y: number; age: number }[];
	/** Last icon click; `age` is Infinity before the first one. */
	pulse: { x: number; y: number; age: number };
	/** Shadertoy iMouse state: position while held, press position. */
	mouse: { x: number; y: number; clickX: number; clickY: number; down: boolean; clicked: boolean };
}

const ICON_SELECTOR = '.icon-wrapper[data-item-id]';

function ease(current: number, target: number, dt: number, rate: number): number {
	return current + (target - current) * (1 - Math.exp(-dt * rate));
}

export function createInputTracker(element: HTMLElement) {
	const pointer = { x: 0, y: 0, inside: false, presence: 0, vx: 0, vy: 0, lastX: 0, lastY: 0 };
	const hover = {
		el: null as Element | null,
		rect: { x: 0, y: 0, width: 0, height: 0 },
		amount: 0
	};
	const pulse = { x: 0, y: 0, at: -Infinity };
	const mouse = { x: 0, y: 0, clickX: 0, clickY: 0, down: false, clicked: false };
	const clicks: { x: number; y: number; at: number }[] = [];

	function inside(event: PointerEvent): boolean {
		const bounds = element.getBoundingClientRect();
		return (
			event.clientX >= bounds.left &&
			event.clientX <= bounds.right &&
			event.clientY >= bounds.top &&
			event.clientY <= bounds.bottom
		);
	}

	function iconOf(event: PointerEvent): Element | null {
		return event.target instanceof Element ? event.target.closest(ICON_SELECTOR) : null;
	}

	function onPointerMove(event: PointerEvent) {
		// Entering the layer is not movement; don't report the jump as velocity.
		if (!pointer.inside) {
			pointer.lastX = event.clientX;
			pointer.lastY = event.clientY;
		}
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		pointer.inside = inside(event);
		if (mouse.down) {
			mouse.x = event.clientX;
			mouse.y = event.clientY;
		}
		hover.el = iconOf(event);
	}

	function onPointerLeave() {
		pointer.inside = false;
		hover.el = null;
	}

	function onPointerDown(event: PointerEvent) {
		if (event.button !== 0 || !inside(event)) return;
		const now = performance.now();
		mouse.x = mouse.clickX = event.clientX;
		mouse.y = mouse.clickY = event.clientY;
		mouse.down = true;
		mouse.clicked = true;
		clicks.unshift({ x: event.clientX, y: event.clientY, at: now });
		clicks.length = Math.min(clicks.length, MAX_CLICKS);
		const icon = iconOf(event);
		if (!icon || icon.querySelector('.edit-mode')) return;
		pulse.x = event.clientX;
		pulse.y = event.clientY;
		pulse.at = now;
	}

	function onPointerUp() {
		mouse.down = false;
	}

	window.addEventListener('pointermove', onPointerMove);
	window.addEventListener('pointerdown', onPointerDown, true);
	window.addEventListener('pointerup', onPointerUp, true);
	document.documentElement.addEventListener('pointerleave', onPointerLeave);

	/** Advances the eased values by `dt` seconds and returns the current state. */
	function sample(now: number, dt: number): InputSample {
		const bounds = element.getBoundingClientRect();
		const local = (rect: DOMRect): Rect => ({
			x: rect.left - bounds.left,
			y: rect.top - bounds.top,
			width: rect.width,
			height: rect.height
		});

		pointer.presence = ease(pointer.presence, pointer.inside ? 1 : 0, dt, 8);
		if (dt > 0) {
			pointer.vx = ease(pointer.vx, (pointer.x - pointer.lastX) / dt, dt, 20);
			pointer.vy = ease(pointer.vy, (pointer.y - pointer.lastY) / dt, dt, 20);
		}
		pointer.lastX = pointer.x;
		pointer.lastY = pointer.y;
		hover.amount = ease(hover.amount, hover.el ? 1 : 0, dt, 10);
		if (hover.el) hover.rect = local(hover.el.getBoundingClientRect());

		const icons: Rect[] = [];
		for (const el of document.querySelectorAll(ICON_SELECTOR)) {
			if (icons.length >= MAX_ICONS) break;
			icons.push(local(el.getBoundingClientRect()));
		}

		const result: InputSample = {
			width: bounds.width,
			height: bounds.height,
			pointer: {
				x: pointer.x - bounds.left,
				y: pointer.y - bounds.top,
				presence: pointer.presence
			},
			velocity: { x: pointer.vx, y: pointer.vy },
			hover: { ...hover.rect, amount: hover.amount },
			icons,
			clicks: clicks.map((c) => ({
				x: c.x - bounds.left,
				y: c.y - bounds.top,
				age: (now - c.at) / 1000
			})),
			pulse: { x: pulse.x - bounds.left, y: pulse.y - bounds.top, age: (now - pulse.at) / 1000 },
			mouse: {
				...mouse,
				x: mouse.x - bounds.left,
				y: mouse.y - bounds.top,
				clickX: mouse.clickX - bounds.left,
				clickY: mouse.clickY - bounds.top
			}
		};
		mouse.clicked = false;
		return result;
	}

	function destroy() {
		window.removeEventListener('pointermove', onPointerMove);
		window.removeEventListener('pointerdown', onPointerDown, true);
		window.removeEventListener('pointerup', onPointerUp, true);
		document.documentElement.removeEventListener('pointerleave', onPointerLeave);
	}

	return { sample, destroy };
}
