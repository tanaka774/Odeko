import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import WidgetCss from './WidgetCss.svelte';

function headStyle(id = 'w1'): HTMLStyleElement | null {
	return document.querySelector(`style[data-widget-css="${id}"]`);
}

afterEach(cleanup);

describe('WidgetCss', () => {
	it('injects the user CSS prefixed with the widget scope when enabled', () => {
		render(WidgetCss, {
			id: 'w1',
			appearance: { customCssEnabled: true, customCss: '.time-display { color: red; }' }
		});

		const style = headStyle();
		expect(style).not.toBeNull();
		expect(style?.textContent).toBe('[data-item-id="w1"] .time-display { color: red; }');
	});

	it('injects nothing when custom CSS is disabled or empty', () => {
		render(WidgetCss, {
			id: 'w1',
			appearance: { customCssEnabled: false, customCss: '.a { color: red; }' }
		});
		expect(headStyle()).toBeNull();

		render(WidgetCss, {
			id: 'w2',
			appearance: { customCssEnabled: true, customCss: '   ' }
		});
		expect(headStyle('w2')).toBeNull();
	});

	it('replaces the injected CSS when the appearance changes', async () => {
		const utils = render(WidgetCss, {
			id: 'w1',
			appearance: { customCssEnabled: true, customCss: '.a { color: red; }' }
		});

		await utils.rerender({
			id: 'w1',
			appearance: { customCssEnabled: true, customCss: '.b { color: blue; }' }
		});

		const style = headStyle();
		expect(style?.textContent).toContain('.b { color: blue; }');
		expect(style?.textContent).not.toContain('.a');
	});

	it('removes the style element on unmount', () => {
		const { unmount } = render(WidgetCss, {
			id: 'w1',
			appearance: { customCssEnabled: true, customCss: '.a { color: red; }' }
		});
		expect(headStyle()).not.toBeNull();

		unmount();
		expect(headStyle()).toBeNull();
	});
});
