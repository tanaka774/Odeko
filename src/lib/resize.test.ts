import { describe, it, expect } from 'vitest';
import { computeResizeRect, getResizeDirAtPoint } from './resize';

const start = { x: 100, y: 100, width: 200, height: 100 };

describe('getResizeDirAtPoint', () => {
	const rect = { x: 10, y: 20, width: 100, height: 60 };

	it('detects corners and edges within the hit zone', () => {
		expect(getResizeDirAtPoint(rect, 10, 20)).toBe('nw');
		expect(getResizeDirAtPoint(rect, 110, 20)).toBe('ne');
		expect(getResizeDirAtPoint(rect, 10, 80)).toBe('sw');
		expect(getResizeDirAtPoint(rect, 110, 80)).toBe('se');
		expect(getResizeDirAtPoint(rect, 60, 20)).toBe('n');
		expect(getResizeDirAtPoint(rect, 60, 80)).toBe('s');
		expect(getResizeDirAtPoint(rect, 10, 50)).toBe('w');
		expect(getResizeDirAtPoint(rect, 110, 50)).toBe('e');
	});

	it('returns null inside the move area', () => {
		expect(getResizeDirAtPoint(rect, 60, 50)).toBeNull();
	});

	it('returns null for points outside the rect', () => {
		expect(getResizeDirAtPoint(rect, 5, 50)).toBeNull();
		expect(getResizeDirAtPoint(rect, 60, 5)).toBeNull();
		expect(getResizeDirAtPoint(rect, 120, 50)).toBeNull();
	});

	it('lets the caller widen the hit zone', () => {
		expect(getResizeDirAtPoint(rect, 30, 50, 20)).toBe('w');
		expect(getResizeDirAtPoint(rect, 90, 40, 20)).toBe('ne');
		expect(getResizeDirAtPoint(rect, 60, 50, 20)).toBeNull();
	});
});

describe('computeResizeRect', () => {
	describe('free-form (widgets)', () => {
		it('moves the dragged edges and keeps the opposite edges fixed', () => {
			// Dragging by +20px: west/north edges move right/down, east/south
			// edges grow outward. The edge opposite the handle never moves.
			const cases: Array<{
				dir: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
				left: number;
				top: number;
				right: number;
				bottom: number;
			}> = [
				{ dir: 'nw', left: 120, top: 120, right: 300, bottom: 200 },
				{ dir: 'n', left: 100, top: 120, right: 300, bottom: 200 },
				{ dir: 'ne', left: 100, top: 120, right: 320, bottom: 200 },
				{ dir: 'e', left: 100, top: 100, right: 320, bottom: 200 },
				{ dir: 'se', left: 100, top: 100, right: 320, bottom: 220 },
				{ dir: 's', left: 100, top: 100, right: 300, bottom: 220 },
				{ dir: 'sw', left: 120, top: 100, right: 300, bottom: 220 },
				{ dir: 'w', left: 120, top: 100, right: 300, bottom: 200 }
			];

			for (const { dir, left, top, right, bottom } of cases) {
				const rect = computeResizeRect(start, dir, 20, 20, { minSize: 20 });
				expect(
					{ x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height },
					dir
				).toEqual({ x: left, y: top, right, bottom });
			}
		});

		it('clamps to minSize even when dragged smaller', () => {
			const rect = computeResizeRect(start, 'se', -500, -500, { minSize: 40 });
			expect(rect.width).toBe(40);
			expect(rect.height).toBe(40);
		});
	});

	describe('square (app icons)', () => {
		it('keeps width and height equal and the opposite corner fixed', () => {
			const rect = computeResizeRect(start, 'nw', 20, 30, { square: true, minSize: 20 });
			expect(rect.width).toBe(rect.height);
			// South-east corner stayed fixed.
			expect(rect.x + rect.width).toBe(start.x + start.width);
			expect(rect.y + rect.height).toBe(start.y + start.height);
		});

		it('clamps to minSize', () => {
			const rect = computeResizeRect(start, 'se', -1000, -1000, { square: true, minSize: 40 });
			expect(rect.width).toBe(40);
			expect(rect.height).toBe(40);
		});

		it('snaps the moving edge to the grid', () => {
			// Bottom-right handle on a 40px grid: the east edge lands on 330px,
			// which is within 10px of 320px, so it snaps.
			const rect = computeResizeRect(start, 'se', 30, 0, {
				square: true,
				minSize: 20,
				snap: true,
				gridSize: 40
			});
			expect(rect.x + rect.width).toBe(320);
		});
	});
});
