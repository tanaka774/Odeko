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

describe('edit-mode cancel', () => {
	it('restores an icon position after Cancel', async () => {
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

		// Cancel the edit session from the floating toolbar.
		const cancelButton = await $('button=Cancel');
		await cancelButton.click();

		await browser.waitUntil(async () => (await draggedIconStyle()) === styleBefore, {
			timeout: 10000,
			timeoutMsg: 'icon position was not restored after cancel'
		});
	});
});
