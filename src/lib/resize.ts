export type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** CSS cursor for each resize direction. */
export const RESIZE_CURSORS: Record<ResizeDir, string> = {
	nw: 'nwse-resize',
	se: 'nwse-resize',
	ne: 'nesw-resize',
	sw: 'nesw-resize',
	n: 'ns-resize',
	s: 'ns-resize',
	e: 'ew-resize',
	w: 'ew-resize'
};

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Maps a pointer position (client coordinates) inside an item's bounding rect
 * to a resize direction, or null for the interior "move" area. Corners win
 * over edges; the hit zone defaults to 8px. Points outside the rect return
 * null.
 */
export function getResizeDirAtPoint(rect: Rect, x: number, y: number, zone = 8): ResizeDir | null {
	const insideX = x >= rect.x && x <= rect.x + rect.width;
	const insideY = y >= rect.y && y <= rect.y + rect.height;
	if (!insideX || !insideY) return null;

	const nearLeft = x - rect.x <= zone;
	const nearRight = rect.x + rect.width - x <= zone;
	const nearTop = y - rect.y <= zone;
	const nearBottom = rect.y + rect.height - y <= zone;

	if (nearLeft && nearTop) return 'nw';
	if (nearRight && nearTop) return 'ne';
	if (nearLeft && nearBottom) return 'sw';
	if (nearRight && nearBottom) return 'se';
	if (nearLeft) return 'w';
	if (nearRight) return 'e';
	if (nearTop) return 'n';
	if (nearBottom) return 's';
	return null;
}

export interface ResizeOptions {
	/** Keep width and height equal (used by square app icons). */
	square?: boolean;
	minSize: number;
	snap?: boolean;
	gridSize?: number;
	snapThreshold?: number;
}

/**
 * Computes the new position and size of an item while dragging a resize handle.
 *
 * The edge opposite the dragged handle stays fixed: dragging the north-west
 * handle moves the north and west edges, so the south-east corner never moves.
 */
export function computeResizeRect(
	start: Rect,
	dir: ResizeDir,
	deltaX: number,
	deltaY: number,
	opts: ResizeOptions
): Rect {
	const { square = false, minSize, snap = false, gridSize = 40, snapThreshold = 10 } = opts;

	const eastMoves = dir.includes('e');
	const westMoves = dir.includes('w');
	const southMoves = dir.includes('s');
	const northMoves = dir.includes('n');

	if (square) {
		// A single size value keeps the icon square.
		const size = Math.max(
			start.width + (eastMoves ? deltaX : -deltaX),
			start.height + (southMoves ? deltaY : -deltaY)
		);
		const anchorX = westMoves ? start.x + start.width : start.x;
		const anchorY = northMoves ? start.y + start.height : start.y;

		let s = Math.max(minSize, size);

		if (snap) {
			if (eastMoves || westMoves) {
				const edge = eastMoves ? anchorX + s : anchorX - s;
				const snapEdge = Math.round(edge / gridSize) * gridSize;
				if (Math.abs(edge - snapEdge) <= snapThreshold) {
					s = eastMoves ? snapEdge - anchorX : anchorX - snapEdge;
				}
			}
			if (southMoves || northMoves) {
				const edge = southMoves ? anchorY + s : anchorY - s;
				const snapEdge = Math.round(edge / gridSize) * gridSize;
				if (Math.abs(edge - snapEdge) <= snapThreshold) {
					s = southMoves ? snapEdge - anchorY : anchorY - snapEdge;
				}
			}
			s = Math.max(minSize, s);
		}

		return {
			x: anchorX - (westMoves ? s : 0),
			y: anchorY - (northMoves ? s : 0),
			width: s,
			height: s
		};
	}

	// Free-form resize: each edge moves independently.
	let width = start.width + (eastMoves ? deltaX : 0) - (westMoves ? deltaX : 0);
	let height = start.height + (southMoves ? deltaY : 0) - (northMoves ? deltaY : 0);
	let x = westMoves ? start.x + start.width - width : start.x;
	let y = northMoves ? start.y + start.height - height : start.y;

	width = Math.max(minSize, width);
	height = Math.max(minSize, height);

	if (snap) {
		const right = x + width;
		const bottom = y + height;
		if (eastMoves) {
			const snapRight = Math.round(right / gridSize) * gridSize;
			if (Math.abs(right - snapRight) <= snapThreshold) width = snapRight - x;
		} else {
			const snapLeft = Math.round(x / gridSize) * gridSize;
			if (Math.abs(x - snapLeft) <= snapThreshold) {
				width = right - snapLeft;
				x = snapLeft;
			}
		}
		if (southMoves) {
			const snapBottom = Math.round(bottom / gridSize) * gridSize;
			if (Math.abs(bottom - snapBottom) <= snapThreshold) height = snapBottom - y;
		} else {
			const snapTop = Math.round(y / gridSize) * gridSize;
			if (Math.abs(y - snapTop) <= snapThreshold) {
				height = bottom - snapTop;
				y = snapTop;
			}
		}
		width = Math.max(minSize, width);
		height = Math.max(minSize, height);
	}

	return { x, y, width, height };
}
