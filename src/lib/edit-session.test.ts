import { describe, it, expect } from 'vitest';
import { createEditSession } from './edit-session.svelte';

interface Item {
	id: string;
	x: number;
	y: number;
}

function items(): Item[] {
	return [
		{ id: 'a', x: 100, y: 100 },
		{ id: 'b', x: 200, y: 150 }
	];
}

function move(item: Item, x: number, y: number): Item {
	return { ...item, x, y };
}

describe('createEditSession', () => {
	it('starts clean with nothing to undo or cancel', () => {
		const session = createEditSession<Item>();
		expect(session.isDirty).toBe(false);
		expect(session.canUndo).toBe(false);
		expect(session.cancel()).toBeNull();
	});

	it('enter records a deep-copy baseline', () => {
		const session = createEditSession<Item>();
		const live = items();
		session.enter(live);

		// Mutating the live array must not leak into the baseline.
		live[0].x = 999;
		live.push({ id: 'c', x: 1, y: 1 });

		expect(session.cancel()).toEqual(items());
	});

	it('cancel restores icon positions changed during the session', () => {
		const session = createEditSession<Item>();
		const live = items();
		session.enter(live);

		// User drags icon "a" during the session.
		live[0] = move(live[0], 350, 220);

		const restored = session.cancel();
		expect(restored).toEqual(items());
		expect(restored![0]).toEqual({ id: 'a', x: 100, y: 100 });
	});

	it('cancel restores widget changes and ends the session', () => {
		const session = createEditSession<Item>();
		const live = items();
		session.enter(live);

		live[1] = move(live[1], 500, 400);

		const restored = session.cancel();
		expect(restored![1]).toEqual({ id: 'b', x: 200, y: 150 });

		// After cancel, a second cancel is a no-op.
		expect(session.cancel()).toBeNull();
		expect(session.isDirty).toBe(false);
		expect(session.canUndo).toBe(false);
	});

	it('cancel clears the dirty flag', () => {
		const session = createEditSession<Item>();
		session.enter(items());
		session.markDirty();

		session.cancel();
		expect(session.isDirty).toBe(false);
	});

	it('save makes a later cancel a no-op', () => {
		const session = createEditSession<Item>();
		const live = items();
		session.enter(live);

		live[0] = move(live[0], 900, 900);
		session.save();

		expect(session.isDirty).toBe(false);
		expect(session.cancel()).toBeNull();
	});

	it('undo restores the previous state and marks dirty', () => {
		const session = createEditSession<Item>();
		const live = items();
		session.enter(live);

		// Two drags, each recorded before it happens.
		live[0] = move(live[0], 350, 220);
		session.pushHistory(live);
		live[0] = move(live[0], 500, 400);
		session.pushHistory(live);

		// Current live state is the unrecorded third position.
		live[0] = move(live[0], 700, 700);

		const undone = session.undo();
		expect(undone![0]).toEqual({ id: 'a', x: 500, y: 400 });
		expect(session.isDirty).toBe(true);

		const undoneAgain = session.undo();
		expect(undoneAgain![0]).toEqual({ id: 'a', x: 350, y: 220 });
	});

	it('undo returns null when there is nothing left to undo', () => {
		const session = createEditSession<Item>();
		session.enter(items());
		session.markDirty();

		expect(session.undo()).toBeNull();
	});

	it('pushHistory caps the undo history size', () => {
		const session = createEditSession<Item>();
		const live = items();
		session.enter(live);

		for (let i = 0; i < 100; i++) {
			live[0] = move(live[0], 100 + i, 100 + i);
			session.pushHistory(live);
		}

		expect(session.canUndo).toBe(true);
		// Only the most recent 50 pushes are kept.
		expect(session.undo()![0].x).toBe(100 + 99);
	});
});
