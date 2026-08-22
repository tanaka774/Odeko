import { $, $$, browser, expect } from '@wdio/globals';

describe('Odeko boots', () => {
	it('shows the main window', async () => {
		await browser.waitUntil(async () => (await browser.getTitle()) === 'Odeko', {
			timeout: 15000
		});
	});

	it('renders the icon grid with at least one icon', async () => {
		const grid = await $('.icon-grid');
		await grid.waitForExist({ timeout: 15000 });

		const icons = await $$('.icon-wrapper');
		expect(icons.length).toBeGreaterThan(0);
	});
});
