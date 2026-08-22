import { describe, it, expect } from 'vitest';
import {
	addClipboardEntry,
	capClipboardHistory,
	createImageEntry,
	createTextEntry,
	filterClipboardHistory,
	formatTimestamp,
	hashBytes,
	sortClipboardHistory,
	truncate
} from './clipboard';

describe('createTextEntry / createImageEntry', () => {
	it('builds a text entry with sensible defaults', () => {
		const entry = createTextEntry('hello', 1000);
		expect(entry).toMatchObject({ type: 'text', text: 'hello', createdAt: 1000, pinned: false });
		expect(entry.id).toMatch(/^clip-/);
	});

	it('builds an image entry', () => {
		const entry = createImageEntry('data:image/png;base64,xxx', 2000);
		expect(entry.type).toBe('image');
		expect(entry.image).toBe('data:image/png;base64,xxx');
	});

	it('generates unique ids', () => {
		expect(createTextEntry('a').id).not.toBe(createTextEntry('b').id);
	});
});

describe('addClipboardEntry', () => {
	it('prepends a new entry', () => {
		const first = createTextEntry('first');
		const second = createTextEntry('second');
		expect(addClipboardEntry([first], second)).toEqual([second, first]);
	});

	it('moves an existing identical entry to the front instead of duplicating', () => {
		const a = createTextEntry('same');
		const b = createTextEntry('other');
		const result = addClipboardEntry([b, a], createTextEntry('same'));
		expect(result).toHaveLength(2);
		expect(result[0].text).toBe('same');
		expect(result[1].text).toBe('other');
	});

	it('deduplicates images by data URL', () => {
		const image = createImageEntry('data:image/png;base64,img');
		const result = addClipboardEntry([image], createImageEntry('data:image/png;base64,img'));
		expect(result).toHaveLength(1);
	});

	it('caps the history at maxEntries, keeping newest-first order', () => {
		// Newest first: item-5 was copied last.
		const entries = [5, 4, 3, 2, 1].map((n) => createTextEntry(`item-${n}`, n));
		const result = addClipboardEntry(entries, createTextEntry('new'), 3);
		expect(result.map((e) => e.text)).toEqual(['new', 'item-5', 'item-4']);
	});

	it('ignores empty/whitespace-only history input (caller filters, function just stores)', () => {
		const result = addClipboardEntry([], createTextEntry('   '));
		expect(result).toHaveLength(1);
	});
});

describe('capClipboardHistory', () => {
	it('drops the oldest entries beyond the cap', () => {
		const entries = [1, 2, 3].map((n) => createTextEntry(`item-${n}`));
		expect(capClipboardHistory(entries, 2)).toHaveLength(2);
		expect(capClipboardHistory(entries, 5)).toHaveLength(3);
	});
});

describe('sortClipboardHistory', () => {
	it('sorts newest first', () => {
		const old = createTextEntry('old', 100);
		const fresh = createTextEntry('fresh', 300);
		const middle = createTextEntry('middle', 200);
		expect(sortClipboardHistory([old, fresh, middle]).map((e) => e.text)).toEqual([
			'fresh',
			'middle',
			'old'
		]);
	});

	it('keeps pinned entries on top', () => {
		const pinnedOld = createTextEntry('pinned-old', 100);
		pinnedOld.pinned = true;
		const fresh = createTextEntry('fresh', 300);
		const result = sortClipboardHistory([fresh, pinnedOld]);
		expect(result[0].text).toBe('pinned-old');
		expect(result[1].text).toBe('fresh');
	});

	it('does not mutate the input array', () => {
		const input = [createTextEntry('a'), createTextEntry('b')];
		sortClipboardHistory(input);
		expect(input[0].text).toBe('a');
	});
});

describe('filterClipboardHistory', () => {
	const text = createTextEntry('npm run tauri dev');
	const image = createImageEntry('data:image/png;base64,img');

	it('returns everything for an empty query', () => {
		expect(filterClipboardHistory([text, image], '')).toHaveLength(2);
		expect(filterClipboardHistory([text, image], '   ')).toHaveLength(2);
	});

	it('filters text case-insensitively', () => {
		const result = filterClipboardHistory([text, image], 'TAURI');
		expect(result).toEqual([text]);
	});

	it('hides images when a query is active', () => {
		expect(filterClipboardHistory([text, image], 'run')).toEqual([text]);
		expect(filterClipboardHistory([text, image], 'img')).toEqual([]);
	});
});

describe('truncate', () => {
	it('leaves short text untouched', () => {
		expect(truncate('hello', 5)).toBe('hello');
	});

	it('truncates long text with an ellipsis', () => {
		expect(truncate('abcdefghij', 5)).toBe('abcde…');
	});
});

describe('formatTimestamp', () => {
	it('shows just the time for today', () => {
		const now = new Date(2026, 7, 8, 14, 0).getTime();
		const earlier = new Date(2026, 7, 8, 9, 30).getTime();
		const expected = new Date(earlier).toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit'
		});
		expect(formatTimestamp(earlier, now)).toBe(expected);
	});

	it('includes the date for earlier days', () => {
		const now = new Date(2026, 7, 8, 14, 0).getTime();
		const older = new Date(2026, 6, 3, 9, 5).getTime();
		const time = new Date(older).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const expected = `${new Date(older).toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
		expect(formatTimestamp(older, now)).toBe(expected);
	});
});

describe('hashBytes', () => {
	it('is deterministic for the same bytes', () => {
		expect(hashBytes([1, 2, 3])).toBe(hashBytes([1, 2, 3]));
	});

	it('differs for different bytes', () => {
		expect(hashBytes([1, 2, 3])).not.toBe(hashBytes([3, 2, 1]));
	});
});
