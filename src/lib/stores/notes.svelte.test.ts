import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

type StoredNote = { name: string; shared: boolean; data: unknown };
const disk = new Map<string, StoredNote>();

vi.mock('@tauri-apps/api/core', () => ({
	invoke: vi.fn(async (command: string, args: Record<string, unknown>) => {
		const key = `${args.kind}/${args.id}`;
		switch (command) {
			case 'note_load':
				return disk.get(key) ?? null;
			case 'note_save':
				disk.set(key, structuredClone(args.note as StoredNote));
				return null;
			case 'note_delete':
				disk.delete(key);
				return null;
			case 'note_list': {
				const list = [...disk.entries()]
					.filter(([k, note]) => k.startsWith(`${args.kind}/`) && note.shared)
					.map(([k, note]) => ({ id: k.split('/')[1], name: note.name }));
				if (!list.some((n) => n.id === 'main')) list.unshift({ id: 'main', name: 'Main' });
				return list;
			}
		}
		return null;
	})
}));

import { MAIN_NOTE, NEW_NOTE, OWN_AS_SHARED, mergeTabs, notesStore } from './notes.svelte';
import MemoWidget from '$lib/widgets/MemoWidget.svelte';
import TaskListWidget from '$lib/widgets/TaskListWidget.svelte';

const memo = (text: string) => ({ tabs: [{ id: 't1', name: '', color: '#fff', content: text }] });
let seq = 0;
const uniq = (prefix: string) => `${prefix}${++seq}`;

globalThis.ResizeObserver ??= class {
	observe() {}
	disconnect() {}
	unobserve() {}
} as unknown as typeof ResizeObserver;

beforeEach(() => {
	vi.useRealTimers();
});

afterEach(cleanup);

describe('notesStore', () => {
	it('loads a note once and saves edits after a delay', async () => {
		const id = uniq('a');
		disk.set(`memo/${id}`, { name: 'A', shared: true, data: memo('hello') });
		await Promise.all([notesStore.load('memo', id), notesStore.load('memo', id)]);
		expect(notesStore.get('memo', id)?.data).toEqual(memo('hello'));

		vi.useFakeTimers();
		notesStore.setData('memo', id, memo('changed'));
		expect(disk.get(`memo/${id}`)?.data).toEqual(memo('hello'));
		await vi.runAllTimersAsync();
		expect(disk.get(`memo/${id}`)?.data).toEqual(memo('changed'));
	});

	it('falls back to Main when a widget note is gone', async () => {
		const id = uniq('gone');
		await notesStore.load('memo', id);
		expect(notesStore.effectiveId('memo', id)).toBe(MAIN_NOTE);
		expect(notesStore.effectiveId('memo', undefined)).toBe(MAIN_NOTE);
	});

	const choice = (shared: boolean, selected: string, newName = '') => ({
		shared,
		selected,
		newName
	});
	const text = (id: string) =>
		(notesStore.get('memo', id)?.data as { tabs: { content: string }[] }).tabs[0].content;
	const typeIn = (id: string, value: string) => notesStore.setData('memo', id, memo(value));
	const save = (noteId: string | undefined, next: ReturnType<typeof choice>) =>
		notesStore.applyChoice('memo', noteId, next, {}, {}, 'Memo');

	async function freshMain(value: string) {
		await notesStore.load('memo', MAIN_NOTE);
		typeIn(MAIN_NOTE, value);
		await notesStore.flush('memo', MAIN_NOTE);
		await notesStore.refreshList('memo');
	}

	it('unsharing A copies Main; typing in A leaves B on Main alone', async () => {
		await freshMain('X');
		const a = await save(undefined, choice(false, MAIN_NOTE));
		expect(a).toMatch(/^n-/);
		expect(text(a!)).toBe('X');
		typeIn(a!, 'X + a');
		typeIn(MAIN_NOTE, 'X + b');
		expect(text(a!)).toBe('X + a');
		expect(text(MAIN_NOTE)).toBe('X + b');
	});

	it('re-sharing A defaults back to the note it was copied from', async () => {
		await freshMain('X');
		const a = await save(undefined, choice(false, MAIN_NOTE));
		typeIn(a!, 'X + a');
		const initial = notesStore.initialChoice('memo', a);
		expect(initial).toEqual(choice(false, MAIN_NOTE));

		const resharing = { ...initial, shared: true };
		expect(notesStore.losesOwnContent('memo', a, resharing)).toBe(true);
		const back = await save(a, resharing);
		expect(back).toBeUndefined();
		typeIn(MAIN_NOTE, 'together');
		expect(text(notesStore.effectiveId('memo', back))).toBe('together');
	});

	it('does not warn when own content matches the shared note', async () => {
		await freshMain('X');
		const a = await save(undefined, choice(false, MAIN_NOTE));
		expect(notesStore.losesOwnContent('memo', a, choice(true, MAIN_NOTE))).toBe(false);
	});

	it('repeated unshare and reshare never piles up shared notes', async () => {
		await freshMain('X');
		const before = notesStore.lists.memo.length;
		let id: string | undefined;
		for (let i = 0; i < 3; i++) {
			id = await save(id, choice(false, MAIN_NOTE));
			id = await save(id, { ...notesStore.initialChoice('memo', id), shared: true });
		}
		expect(id).toBeUndefined();
		expect(notesStore.lists.memo.length).toBe(before);
	});

	it('keeps own content as a new shared note when asked', async () => {
		const own = await notesStore.create('memo', { name: '', shared: false, data: memo('mine') });
		const id = await save(own, choice(true, OWN_AS_SHARED));
		expect(id).toBe(own);
		expect(disk.get(`memo/${own}`)).toMatchObject({ shared: true, data: memo('mine') });
		expect(notesStore.lists.memo.some((note) => note.id === own)).toBe(true);
	});

	it('creates a new shared note only on save', async () => {
		await notesStore.refreshList('memo');
		const before = notesStore.lists.memo.length;
		const id = await save(undefined, choice(true, NEW_NOTE, 'Ideas'));
		expect(disk.get(`memo/${id}`)).toMatchObject({ name: 'Ideas', shared: true });
		expect(notesStore.lists.memo.length).toBe(before + 1);
	});

	it('saving without tab edits does not overwrite newer typing', async () => {
		await freshMain('old');
		const opened = $state.snapshot(notesStore.get('memo', MAIN_NOTE)?.data);
		typeIn(MAIN_NOTE, 'typed meanwhile');
		await notesStore.applyChoice(
			'memo',
			undefined,
			choice(true, MAIN_NOTE),
			opened,
			opened,
			'Memo'
		);
		expect(text(MAIN_NOTE)).toBe('typed meanwhile');
	});

	it('tab renames merge with text typed meanwhile', async () => {
		await freshMain('old');
		const base = structuredClone(
			$state.snapshot(notesStore.get('memo', MAIN_NOTE)?.data) as { tabs: { name: string }[] }
		);
		const edited = structuredClone(base);
		edited.tabs[0].name = 'Renamed';
		typeIn(MAIN_NOTE, 'typed meanwhile');
		await notesStore.applyChoice('memo', undefined, choice(true, MAIN_NOTE), edited, base, 'Memo');
		const tab = (
			notesStore.get('memo', MAIN_NOTE)?.data as { tabs: { name: string; content: string }[] }
		).tabs[0];
		expect(tab).toMatchObject({ name: 'Renamed', content: 'typed meanwhile' });
	});

	it('copies private notes on fork but shares shared ones', async () => {
		const own = await notesStore.create('memo', { name: '', shared: false, data: memo('p') });
		const copy = notesStore.fork('memo', own);
		expect(copy).not.toBe(own);
		await waitFor(() => expect(disk.get(`memo/${copy}`)?.data).toEqual(memo('p')));
		expect(notesStore.fork('memo', MAIN_NOTE)).toBe(MAIN_NOTE);
	});
});

describe('note widgets', () => {
	it('two memo widgets on the same note show the same text', async () => {
		const id = uniq('shared');
		disk.set(`memo/${id}`, { name: 'S', shared: true, data: memo('same text') });
		const a = render(MemoWidget, { config: { noteId: id } });
		const b = render(MemoWidget, { config: { noteId: id } });
		const areaA = () => a.container.querySelector('textarea') as HTMLTextAreaElement;
		const areaB = () => b.container.querySelector('textarea') as HTMLTextAreaElement;
		await waitFor(() => expect(areaA().value).toBe('same text'));
		expect(areaB().value).toBe('same text');

		await fireEvent.input(areaA(), { target: { value: 'edited' } });
		await waitFor(() => expect(areaB().value).toBe('edited'));
	});

	it('memo content never goes into the widget config', async () => {
		const onConfigChange = vi.fn();
		const id = uniq('cfg');
		disk.set(`memo/${id}`, { name: 'C', shared: true, data: memo('') });
		const { container } = render(MemoWidget, { config: { noteId: id }, onConfigChange });
		const area = container.querySelector('textarea') as HTMLTextAreaElement;
		await waitFor(() => expect(area.readOnly).toBe(false));
		await fireEvent.input(area, { target: { value: 'private' } });
		expect(onConfigChange).not.toHaveBeenCalled();
	});

	it('task list reads tasks from its note', async () => {
		const id = uniq('tasks');
		disk.set(`tasks/${id}`, {
			name: 'T',
			shared: true,
			data: {
				groups: [
					{
						id: 'g',
						name: 'daily',
						color: '#fff',
						tasks: [{ id: '1', text: 'buy milk', completed: false, createdAt: 1 }]
					}
				]
			}
		});
		const { container } = render(TaskListWidget, { config: { noteId: id } });
		await waitFor(() => expect(container.textContent).toContain('buy milk'));
		expect(container.querySelector('.task-tab')?.textContent).toContain('daily');
	});
});

describe('mergeTabs', () => {
	const tab = (id: string, name: string, content: string) => ({ id, name, color: '#fff', content });

	it('keeps live text, dialog renames, deletions and tabs added meanwhile', () => {
		const base = [tab('a', 'A', '1'), tab('b', 'B', '2')];
		const edited = [tab('a', 'A!', '1'), tab('c', 'C', '')];
		const live = [tab('a', 'A', '1 typed'), tab('b', 'B', '2'), tab('d', 'D', 'new')];
		expect(mergeTabs(edited, base, live)).toEqual([
			tab('a', 'A!', '1 typed'),
			tab('c', 'C', ''),
			tab('d', 'D', 'new')
		]);
	});
});
