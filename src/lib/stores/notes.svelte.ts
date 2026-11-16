import { invoke } from '@tauri-apps/api/core';
import { uniquePresetName } from '$lib/presets';
import { normalizeMemoTabs, normalizeTaskGroups } from '$lib/widgets/types';

/** Memo and task list contents live in notes, outside presets (see notes.rs). */
export type NoteKind = 'memo' | 'tasks';

export const MAIN_NOTE = 'main';

export function noteKindOf(widgetType: string | undefined): NoteKind | null {
	if (widgetType === 'memo') return 'memo';
	if (widgetType === 'tasklist') return 'tasks';
	return null;
}
/** Picker value: turn the widget's own note into a shared one. */
export const OWN_AS_SHARED = '__own__';
/** Picker value: a shared note created on save. */
export const NEW_NOTE = '__new__';

export interface NoteSummary {
	id: string;
	name: string;
}

export interface NoteEntry {
	name: string;
	shared: boolean;
	data: unknown;
	/** For a widget's own note: the shared note it was copied from. */
	from?: string;
	loaded: boolean;
	/** The note file is gone (deleted elsewhere); widgets show Main instead. */
	missing: boolean;
	error: string | null;
}

export interface NoteChoice {
	shared: boolean;
	/** A shared note id, OWN_AS_SHARED or NEW_NOTE. */
	selected: string;
	/** Name for NEW_NOTE. */
	newName: string;
}

interface Tab {
	id: string;
}

const TAB_FIELD: Record<NoteKind, 'tabs' | 'groups'> = { memo: 'tabs', tasks: 'groups' };

function tabsOf(kind: NoteKind, data: unknown): Tab[] {
	return kind === 'memo' ? normalizeMemoTabs(data) : normalizeTaskGroups(data);
}

function hasContent(kind: NoteKind, data: unknown): boolean {
	return kind === 'memo'
		? normalizeMemoTabs(data).some((tab) => tab.content.trim())
		: normalizeTaskGroups(data).some((group) => group.tasks.length > 0);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge of a dialog's tab edits: fields the dialog changed win,
 * everything else comes from `live`, so text typed meanwhile is kept.
 */
export function mergeTabs<T extends Tab>(edited: T[], base: T[], live: T[]): T[] {
	const baseById = new Map(base.map((tab) => [tab.id, tab]));
	const liveById = new Map(live.map((tab) => [tab.id, tab]));
	const merged = edited.map((tab) => {
		const before = baseById.get(tab.id);
		const now = liveById.get(tab.id);
		if (!before || !now) return tab;
		const out = { ...now } as Record<string, unknown>;
		for (const [field, value] of Object.entries(tab)) {
			if (!same(value, (before as Record<string, unknown>)[field])) out[field] = value;
		}
		return out as T;
	});
	for (const tab of live) {
		if (!baseById.has(tab.id) && !edited.some((other) => other.id === tab.id)) merged.push(tab);
	}
	return merged;
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
		const task = invoke<{
			name: string;
			shared: boolean;
			data: unknown;
			from?: string;
		} | null>('note_load', {
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
					entry.from = note.from;
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
			note: {
				name: entry.name,
				shared: entry.shared,
				data: $state.snapshot(entry.data),
				from: entry.shared ? undefined : entry.from
			}
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
		note: { name: string; shared: boolean; data: unknown; from?: string }
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

	/** Turning sharing back on rejoins the note the widget was copied from. */
	function initialChoice(kind: NoteKind, noteId: string | undefined): NoteChoice {
		const id = effectiveId(kind, noteId);
		if (!isPrivate(kind, id)) return { shared: true, selected: id, newName: '' };
		const from = get(kind, id)?.from;
		const known = !!from && lists[kind].some((note) => note.id === from);
		return { shared: false, selected: known ? from : MAIN_NOTE, newName: '' };
	}

	/** The note whose content a settings dialog shows for `choice`. */
	function sourceId(kind: NoteKind, noteId: string | undefined, choice: NoteChoice): string {
		const current = effectiveId(kind, noteId);
		if (!choice.shared || choice.selected === OWN_AS_SHARED) return current;
		return choice.selected;
	}

	/** Saving `choice` would drop the widget's own content. */
	function losesOwnContent(
		kind: NoteKind,
		noteId: string | undefined,
		choice: NoteChoice
	): boolean {
		const current = effectiveId(kind, noteId);
		if (!choice.shared || choice.selected === OWN_AS_SHARED || !isPrivate(kind, current)) {
			return false;
		}
		const own = get(kind, current)?.data;
		if (!hasContent(kind, own)) return false;
		const target = choice.selected === NEW_NOTE ? null : get(kind, choice.selected)?.data;
		return !same(tabsOf(kind, own), tabsOf(kind, target));
	}

	async function writeMerged(kind: NoteKind, id: string, edited: unknown, base: unknown) {
		const live = tabsOf(kind, get(kind, id)?.data);
		setData(kind, id, {
			[TAB_FIELD[kind]]: mergeTabs(tabsOf(kind, edited), tabsOf(kind, base), live)
		});
		await flush(kind, id);
	}

	/**
	 * Applies a settings dialog's choice. `base` is what the dialog loaded,
	 * `edited` what it holds now; content is only written when they differ.
	 * Returns the widget's new `noteId` (undefined means Main).
	 */
	async function applyChoice(
		kind: NoteKind,
		noteId: string | undefined,
		choice: NoteChoice,
		edited: unknown,
		base: unknown,
		baseName: string
	): Promise<string | undefined> {
		const dirty = !same(edited, base);
		const current = effectiveId(kind, noteId);
		const currentPrivate = isPrivate(kind, current);

		if (!choice.shared) {
			if (currentPrivate) {
				if (dirty) await writeMerged(kind, current, edited, base);
				return current;
			}
			const live = $state.snapshot(get(kind, current)?.data ?? null);
			const data = dirty
				? {
						[TAB_FIELD[kind]]: mergeTabs(
							tabsOf(kind, edited),
							tabsOf(kind, base),
							tabsOf(kind, live)
						)
					}
				: live;
			return create(kind, { name: '', shared: false, data, from: current });
		}

		if (choice.selected === NEW_NOTE) {
			await refreshList(kind);
			const name = choice.newName.trim() || uniqueName(kind, baseName);
			return create(kind, { name, shared: true, data: dirty ? edited : null });
		}

		if (choice.selected === OWN_AS_SHARED && currentPrivate) {
			await refreshList(kind);
			const entry = get(kind, current)!;
			entry.shared = true;
			entry.from = undefined;
			entry.name = uniqueName(kind, baseName);
			if (dirty) await writeMerged(kind, current, edited, base);
			else await persist(kind, current);
			await refreshList(kind);
			return current;
		}

		const target = choice.selected === OWN_AS_SHARED ? MAIN_NOTE : choice.selected;
		await load(kind, target);
		if (dirty) await writeMerged(kind, target, edited, base);
		await refreshList(kind);
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
		losesOwnContent,
		applyChoice
	};
}

export const notesStore = createNotesStore();
