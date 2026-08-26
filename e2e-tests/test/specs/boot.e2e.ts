import { $, browser } from '@wdio/globals';

describe('Odeko boots', () => {
	it('shows the main window', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
	});

	it('renders the icon grid', async () => {
		const grid = await $('.icon-grid');
		await grid.waitForExist({ timeout: 15000 });
	});
});
