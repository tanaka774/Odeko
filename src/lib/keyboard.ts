const SHORTCUT_BLOCKING_SELECTOR = [
	'input',
	'textarea',
	'select',
	'button',
	'[contenteditable=""]',
	'[contenteditable="true"]',
	'[role="textbox"]',
	'[role="combobox"]',
	'[role="listbox"]',
	'[role="slider"]',
	'[role="spinbutton"]',
	'[role="dialog"]',
	'[data-keyboard-shortcut-boundary]'
].join(',');

const OPEN_MODAL_SELECTOR = '[role="dialog"][aria-modal="true"]';

export function shouldIgnoreGlobalShortcut(event: KeyboardEvent): boolean {
	if (document.querySelector(OPEN_MODAL_SELECTOR)) return true;

	const target = event.target;
	if (!(target instanceof Element)) return false;

	return target.closest(SHORTCUT_BLOCKING_SELECTOR) !== null;
}
