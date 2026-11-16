import { invoke } from '@tauri-apps/api/core';
import { uniquePresetName } from '$lib/presets';

/** Memo and task list contents live in notes, outside presets (see notes.rs). */
export type NoteKind = 'memo' | 'tasks';

export const MAIN_NOTE = 'main';

export function noteKindOf(widgetType: string | undefined): NoteKind | null {
	if (widgetType === 'memo') return 'memo';
	if (widgetType === 'tasklist') return 'tasks';
	return null;
}
/** Picker value: turn the widget's own note into a shared one. */
export const KEEP_AS_SHARED = '__keep__';

export interface NoteSummary {
	id: string;
	name: string;
}

export interface NoteEntry {
	name: string;
	shared: boolean;
	data: unknown;
	loaded: boolean;
	/** The note file is gone (deleted elsewhere); widgets show Main instead. */
	missing: boolean;
	error: string | null;
}

export interface NoteChoice {
	shared: boolean;
	/** A shared note id, or KEEP_AS_SHARED. */
	selected: string;
}

const SAVE_DELAY_MS = 500;

function newNoteId(): string {
	return `n-${crypto.randomUUID().replace(/-/g, '')}`;
}

function createNotesStore() {
	const entries = $state<Record<string, NoteEntry>>({});
	const lists = $state<Record<NoteKind, NoteSummary[]>>({ memo: [], tasks: [] });
	const pending = new Map<string, Promise<void>>();
	const timers = new Map<string, ReturnType<typeof setTimeout>>();

	const key = (kind: NoteKind, id: string) => `${kind}/${id}`;

	function get(kind: NoteKind, id: string): NoteEntry | undefined {
		return entries[key(kind, id)];
	}

	function load(kind: NoteKind, id: string): Promise<void> {
		const k = key(kind, id);
		const running = pending.get(k);
		if (running) return running;
		if (entries[k]?.loaded) return Promise.resolve();
		entries[k] = {
			name: '',
			shared: id === MAIN_NOTE,
			data: null,
			loaded: false,
			missing: false,
			error: null
		};
		const task = invoke<{ name: string; shared: boolean; data: unknown } | null>('note_load', {
			kind,
			id
		})
			.then((note) => {
				const entry = entries[k];
				if (!entry) return;
				if (note) {
					entry.name = note.name;
					entry.shared = note.shared || id === MAIN_NOTE;
					entry.data = note.data;
				} else {
					entry.name = id === MAIN_NOTE ? 'Main' : '';
					entry.missing = id !== MAIN_NOTE;
				}
				entry.loaded = true;
			})
			.catch((error) => {
				const entry = entries[k];
				if (entry) entry.error = String(error);
				console.error('Failed to load note:', error);
			})
			.finally(() => pending.delete(k));
		pending.set(k, task);
		return task;
	}

	function persist(kind: NoteKind, id: string): Promise<void> {
		const k = key(kind, id);
		clearTimeout(timers.get(k));
		timers.delete(k);
		const entry = entries[k];
		if (!entry?.loaded) return Promise.resolve();
		return invoke<void>('note_save', {
			kind,
			id,
			note: { name: entry.name, shared: entry.shared, data: $state.snapshot(entry.data) }
		}).catch((error) => console.error('Failed to save note:', error));
	}

	/** Replaces a loaded note's data and saves it shortly after. */
	function setData(kind: NoteKind, id: string, data: unknown) {
		const k = key(kind, id);
		const entry = entries[k];
		if (!entry?.loaded) return;
		entry.data = data;
		entry.missing = false;
		clearTimeout(timers.get(k));
		timers.set(
			k,
			setTimeout(() => void persist(kind, id), SAVE_DELAY_MS)
		);
	}

	function flush(kind: NoteKind, id: string): Promise<void> {
		return timers.has(key(kind, id)) ? persist(kind, id) : Promise.resolve();
	}

	async function refreshList(kind: NoteKind): Promise<NoteSummary[]> {
		try {
			lists[kind] = await invoke<NoteSummary[]>('note_list', { kind });
		} catch (error) {
			console.error('Failed to list notes:', error);
		}
		return lists[kind];
	}

	function uniqueName(kind: NoteKind, base: string): string {
		return uniquePresetName(
			base,
			lists[kind].map((note) => note.name)
		);
	}

	async function create(
		kind: NoteKind,
		note: { name: string; shared: boolean; data: unknown }
	): Promise<string> {
		const id = newNoteId();
		entries[key(kind, id)] = { ...note, loaded: true, missing: false, error: null };
		await persist(kind, id);
		if (note.shared) await refreshList(kind);
		return id;
	}

	async function rename(kind: NoteKind, id: string, name: string) {
		const entry = get(kind, id);
		if (!entry?.loaded || !name.trim()) return;
		entry.name = name.trim();
		await persist(kind, id);
		await refreshList(kind);
	}

	async function remove(kind: NoteKind, id: string) {
		if (id === MAIN_NOTE) return;
		const k = key(kind, id);
		clearTimeout(timers.get(k));
		timers.delete(k);
		await invoke('note_delete', { kind, id });
		delete entries[k];
		await refreshList(kind);
	}

	/** A copy for a duplicated widget when its note is private; shared ids are returned as is. */
	function fork(kind: NoteKind, id: string): string {
		const entry = get(kind, id);
		if (!entry?.loaded || entry.shared || entry.missing) return id;
		const copy = newNoteId();
		entries[key(kind, copy)] = {
			...entry,
			data: $state.snapshot(entry.data),
			error: null
		};
		void persist(kind, copy);
		return copy;
	}

	/** The note a widget actually shows: its own, or Main when that is gone. */
	function effectiveId(kind: NoteKind, noteId: string | undefined): string {
		const id = noteId ?? MAIN_NOTE;
		return get(kind, id)?.missing ? MAIN_NOTE : id;
	}

	function isPrivate(kind: NoteKind, id: string): boolean {
		const entry = get(kind, id);
		return !!entry?.loaded && !entry.shared && !entry.missing;
	}

	function initialChoice(kind: NoteKind, noteId: string | undefined): NoteChoice {
		const id = effectiveId(kind, noteId);
		return isPrivate(kind, id)
			? { shared: false, selected: KEEP_AS_SHARED }
			: { shared: true, selected: id };
	}

	/** The note whose content a settings dialog shows for `choice`. */
	function sourceId(kind: NoteKind, noteId: string | undefined, choice: NoteChoice): string {
		const current = effectiveId(kind, noteId);
		if (choice.shared && choice.selected !== KEEP_AS_SHARED) return choice.selected;
		return isPrivate(kind, current) ? current : choice.selected;
	}

	/**
	 * Applies a settings dialog's choice, writing `data` to the chosen note.
	 * Returns the widget's new `noteId` (undefined means Main).
	 */
	async function applyChoice(
		kind: NoteKind,
		noteId: string | undefined,
		choice: NoteChoice,
		data: unknown,
		baseName: string
	): Promise<string | undefined> {
		const current = effectiveId(kind, noteId);
		const currentPrivate = isPrivate(kind, current);
		let target: string;
		if (choice.shared && choice.selected === KEEP_AS_SHARED && currentPrivate) {
			await refreshList(kind);
			const entry = get(kind, current)!;
			entry.shared = true;
			entry.name = uniqueName(kind, baseName);
			target = current;
		} else if (choice.shared) {
			target = choice.selected === KEEP_AS_SHARED ? MAIN_NOTE : choice.selected;
			await load(kind, target);
		} else if (currentPrivate) {
			target = current;
		} else {
			return create(kind, { name: '', shared: false, data });
		}
		setData(kind, target, data);
		await flush(kind, target);
		if (choice.shared) await refreshList(kind);
		return target === MAIN_NOTE ? undefined : target;
	}

	return {
		get lists() {
			return lists;
		},
		get,
		load,
		setData,
		flush,
		refreshList,
		uniqueName,
		create,
		rename,
		remove,
		fork,
		effectiveId,
		isPrivate,
		initialChoice,
		sourceId,
		applyChoice
	};
}

export const notesStore = createNotesStore();
