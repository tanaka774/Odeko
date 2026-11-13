import { $, browser, expect } from '@wdio/globals';
import { openSettingsModal } from '../helpers';

async function backdropBlurChecked(): Promise<boolean> {
	return (await browser.execute(() => {
		const label = [...document.querySelectorAll('label')].find(
			(el) => el.textContent?.trim() === 'Backdrop Blur'
		);
		const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
		if (!input) throw new Error('Backdrop Blur checkbox not found');
		return input.checked;
	})) as boolean;
}

async function clickBackdropBlur() {
	await browser.execute(() => {
		const label = [...document.querySelectorAll('label')].find(
			(el) => el.textContent?.trim() === 'Backdrop Blur'
		);
		const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]');
		if (!input) throw new Error('Backdrop Blur checkbox not found');
		input.click();
	});
}

describe('settings save', () => {
	it('saves a toggle change and reflects it on reopen', async () => {
		await (await $('.icon-grid')).waitForExist({ timeout: 15000 });
		await openSettingsModal();

		const before = await backdropBlurChecked();
		await clickBackdropBlur();

		const saveButton = await $('button=Save Changes');
		await saveButton.click();

		await openSettingsModal();
		expect(await backdropBlurChecked()).toBe(!before);

		await clickBackdropBlur();
		await (await $('button=Save Changes')).click();
	});
});
