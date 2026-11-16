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

import { KEEP_AS_SHARED, MAIN_NOTE, notesStore } from './notes.svelte';
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

	it('gives an unshared widget its own note, then reuses it', async () => {
		await notesStore.load('tasks', MAIN_NOTE);
		const own = await notesStore.applyChoice(
			'tasks',
			undefined,
			{ shared: false, selected: MAIN_NOTE },
			{ groups: [] },
			'Tasks'
		);
		expect(own).toMatch(/^n-/);
		expect(disk.get(`tasks/${own}`)?.shared).toBe(false);
		expect(notesStore.initialChoice('tasks', own)).toEqual({
			shared: false,
			selected: KEEP_AS_SHARED
		});

		const again = await notesStore.applyChoice(
			'tasks',
			own,
			{ shared: false, selected: KEEP_AS_SHARED },
			{ groups: [{ id: 'g', name: 'x', color: '#fff', tasks: [] }] },
			'Tasks'
		);
		expect(again).toBe(own);
	});

	it('turns a widget note into a named shared note', async () => {
		const own = await notesStore.create('memo', { name: '', shared: false, data: memo('mine') });
		const id = await notesStore.applyChoice(
			'memo',
			own,
			{ shared: true, selected: KEEP_AS_SHARED },
			memo('mine'),
			'Memo'
		);
		expect(id).toBe(own);
		expect(disk.get(`memo/${own}`)).toMatchObject({ shared: true, name: expect.any(String) });
		expect(notesStore.lists.memo.some((note) => note.id === own)).toBe(true);
	});

	it('switches a widget to Main without touching its old note', async () => {
		const own = await notesStore.create('memo', { name: '', shared: false, data: memo('old') });
		const id = await notesStore.applyChoice(
			'memo',
			own,
			{ shared: true, selected: MAIN_NOTE },
			memo('main text'),
			'Memo'
		);
		expect(id).toBeUndefined();
		expect(disk.get('memo/main')?.data).toEqual(memo('main text'));
		expect(disk.get(`memo/${own}`)?.data).toEqual(memo('old'));
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
