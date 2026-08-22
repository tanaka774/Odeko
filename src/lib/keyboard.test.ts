import { describe, it, expect, afterEach } from 'vitest';
import { shouldIgnoreGlobalShortcut } from './keyboard';

function fireKeydown(target: Element): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { bubbles: true });
	target.dispatchEvent(event);
	return event;
}

afterEach(() => {
	document.body.innerHTML = '';
});

describe('shouldIgnoreGlobalShortcut', () => {
	it('returns false when the target is the body', () => {
		const event = fireKeydown(document.body);
		expect(shouldIgnoreGlobalShortcut(event)).toBe(false);
	});

	it('returns false for a plain div', () => {
		const div = document.createElement('div');
		document.body.appendChild(div);

		const event = fireKeydown(div);
		expect(shouldIgnoreGlobalShortcut(event)).toBe(false);
	});

	it('returns false when there is no event target', () => {
		const event = new KeyboardEvent('keydown');
		expect(shouldIgnoreGlobalShortcut(event)).toBe(false);
	});

	it('returns true when an input is focused', () => {
		const input = document.createElement('input');
		document.body.appendChild(input);

		const event = fireKeydown(input);
		expect(shouldIgnoreGlobalShortcut(event)).toBe(true);
	});

	it('returns true when the target is inside a textarea', () => {
		const textarea = document.createElement('textarea');
		const span = document.createElement('span');
		textarea.appendChild(span);
		document.body.appendChild(textarea);

		const event = fireKeydown(span);
		expect(shouldIgnoreGlobalShortcut(event)).toBe(true);
	});

	it('returns true when the target is a button', () => {
		const button = document.createElement('button');
		document.body.appendChild(button);

		const event = fireKeydown(button);
		expect(shouldIgnoreGlobalShortcut(event)).toBe(true);
	});

	it('returns true when the target is contenteditable', () => {
		const editable = document.createElement('div');
		editable.setAttribute('contenteditable', 'true');
		document.body.appendChild(editable);

		const event = fireKeydown(editable);
		expect(shouldIgnoreGlobalShortcut(event)).toBe(true);
	});

	it('returns true when a modal dialog is open', () => {
		const modal = document.createElement('div');
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		document.body.appendChild(modal);

		const event = fireKeydown(document.body);
		expect(shouldIgnoreGlobalShortcut(event)).toBe(true);
	});
});
