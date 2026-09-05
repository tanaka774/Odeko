import { $, browser, expect } from '@wdio/globals';
import { enterEditMode, dragIconBy } from '../helpers';

/**
 * Style of the wrapper around the first app icon — the exact element
 * `dragIconBy` drags. (The first `.icon-wrapper` in the DOM may be a widget,
 * which the drag never touches.)
 */
async function draggedIconStyle(): Promise<string> {
	return (await browser.execute(
		() =>
			document
				.querySelector('.icon-wrapper .app-icon')
				?.closest('.icon-wrapper')
				?.getAttribute('style') ?? ''
	)) as string;
}

describe('edit-mode exit keybind', () => {
	it('saves the session when leaving edit mode via the toggle keybind', async () => {
		const grid = await $('.icon-grid');
		await grid.waitForExist({ timeout: 15000 });
		await (await $('.icon-wrapper .app-icon')).waitForExist({ timeout: 15000 });

		await enterEditMode();

		const styleBefore = await draggedIconStyle();

		// Drag the first icon to a new position.
		await dragIconBy(120, 100);
		await browser.pause(300);

		await browser.waitUntil(async () => (await draggedIconStyle()) !== styleBefore, {
			timeout: 10000,
			timeoutMsg: 'icon did not move after drag'
		});
		const styleMoved = await draggedIconStyle();

		// Leave edit mode with the same keybind that entered it (F2). Exiting
		// must commit the session, exactly like the toolbar's "Save & Exit".
		await browser.execute(() => {
			window.dispatchEvent(
				new KeyboardEvent('keydown', {
					code: 'F2',
					key: 'F2',
					bubbles: true,
					cancelable: true
				})
			);
		});

		await (await $('.floating-toolbar')).waitForExist({ timeout: 10000, reverse: true });
		await browser.pause(300);

		// The icon keeps its new position: the exit did not revert the session.
		expect(await draggedIconStyle()).toBe(styleMoved);
	});
});
