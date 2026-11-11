export const EDIT_SESSION_MAX_HISTORY = 50;

type Revert = () => void;

/**
 * Tracks the state of an edit-mode session for a list of items (icons/widgets).
 *
 * The session owns three pieces of state:
 * - a deep-copy baseline of the items as they were when the session started,
 * - an undo history of previous snapshots,
 * - a "dirty" flag meaning something changed during the session.
 *
 * A history entry may carry a revert callback for state that lives outside
 * the items (canvas settings changed by the AI chat). Undo runs it for that
 * step; cancel runs every remaining one, newest first.
 *
 * The component stays the owner of the live items array; the session only
 * records snapshots and answers questions like "what should cancel restore?".
 */
export function createEditSession<T>() {
	let baseline = $state<T[] | null>(null);
	let history = $state<T[][]>([]);
	let reverts: (Revert | null)[] = [];
	let pendingReverts: Revert[] = [];
	let dirty = $state(false);

	function clone(items: T[]): T[] {
		return JSON.parse(JSON.stringify(items)) as T[];
	}

	function reset() {
		history = [];
		reverts = [];
		pendingReverts = [];
		dirty = false;
	}

	function enter(items: T[]) {
		reset();
		baseline = clone(items);
		history = [clone(items)];
		reverts = [null];
	}

	/** Restore the baseline and end the session. Returns null when not in a session. */
	function cancel(): T[] | null {
		if (!baseline) return null;
		for (const revert of [...pendingReverts].reverse()) revert();
		const restored = clone(baseline);
		baseline = null;
		reset();
		return restored;
	}

	/** Persist the session: clear the baseline and history so future cancels are no-ops. */
	function save() {
		baseline = null;
		reset();
	}

	/** Undo the last recorded change. Returns null when there is nothing to undo. */
	function undo(): T[] | null {
		if (history.length <= 1) return null;
		// Each push records the "before" state of the upcoming change, so the
		// top of the history is the exact state to restore.
		const restored = clone(history[history.length - 1]);
		const revert = reverts[reverts.length - 1];
		history = history.slice(0, -1);
		reverts = reverts.slice(0, -1);
		if (revert) {
			revert();
			pendingReverts = pendingReverts.filter((r) => r !== revert);
		}
		dirty = true;
		return restored;
	}

	/** Record the current items so an undo can return to this exact state. */
	function pushHistory(items: T[], revert?: Revert) {
		history = [...history, clone(items)];
		reverts = [...reverts, revert ?? null];
		if (revert) pendingReverts = [...pendingReverts, revert];
		if (history.length > EDIT_SESSION_MAX_HISTORY) {
			history = history.slice(-EDIT_SESSION_MAX_HISTORY);
			reverts = reverts.slice(-EDIT_SESSION_MAX_HISTORY);
		}
	}

	function markDirty() {
		dirty = true;
	}

	return {
		get isDirty() {
			return dirty;
		},
		get canUndo() {
			return history.length > 1;
		},
		get hasBaseline() {
			return baseline !== null;
		},
		enter,
		cancel,
		save,
		undo,
		pushHistory,
		markDirty
	};
}
